import 'server-only';

import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { extractSourceImageCandidates } from '@/modules/product-images/source-image-detection';

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARACTERS = 60_000;
const FETCH_TIMEOUT_MS = 20_000;

export class ProductPageExtractionError extends Error {
  readonly status: 422 | 502 | 504;

  constructor(
    message: string,
    status: 422 | 502 | 504 = 422,
  ) {
    super(message);
    this.name = 'ProductPageExtractionError';
    this.status = status;
  }
}

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && parts[2] === 0)
    || (first === 192 && second === 0 && parts[2] === 2)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && parts[2] === 100)
    || (first === 203 && second === 0 && parts[2] === 113)
    || first >= 224;
}

function isPrivateIp(address: string) {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isPrivateIpv4(address);
  }

  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice(7));
  }

  const isSpecialPurpose = normalized.startsWith('2001:0:')
    || normalized.startsWith('2001:db8:')
    || normalized.startsWith('2002:');

  // Restrict outbound requests to globally routable IPv6 unicast addresses
  // while excluding common documentation and transition ranges.
  return ipVersion !== 6 || !/^[23]/.test(normalized) || isSpecialPurpose;
}

async function resolveSafePublicUrl(url: URL): Promise<LookupAddress[]> {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ProductPageExtractionError('Enter a public product URL beginning with http:// or https://.');
  }

  if (url.username || url.password) {
    throw new ProductPageExtractionError('Product URLs cannot contain embedded credentials.');
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    throw new ProductPageExtractionError('Product URLs must use the standard HTTP or HTTPS port.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ProductPageExtractionError('Private or local product URLs are not supported.');
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new ProductPageExtractionError('Private or local product URLs are not supported.');
  }

  return addresses;
}

function getHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function createPinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const matchingAddresses = options.family
      ? addresses.filter(({ family }) => family === options.family)
      : addresses;
    if (!matchingAddresses.length) {
      const error = new Error('No validated address matches the requested address family.') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(null, matchingAddresses);
      return;
    }

    const selectedAddress = matchingAddresses[0];
    callback(null, selectedAddress.address, selectedAddress.family);
  };
}

function requestPage(url: URL, addresses: LookupAddress[], signal: AbortSignal) {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<IncomingMessage>((resolve, reject) => {
    const outgoingRequest = request(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'User-Agent': 'Mozilla/5.0 (compatible; ListingPilot/1.0; product-catalog-analyzer)',
      },
      lookup: createPinnedLookup(addresses),
      signal,
    }, resolve);

    outgoingRequest.once('error', reject);
    outgoingRequest.end();
  });
}

async function readLimitedHtml(response: IncomingMessage) {
  const declaredLength = Number(getHeader(response.headers, 'content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    response.destroy();
    throw new ProductPageExtractionError('This product page is too large to analyze safely.');
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      response.destroy();
      throw new ProductPageExtractionError('This product page is too large to analyze safely.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const isHex = code[1]?.toLowerCase() === 'x';
      const numericCode = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(numericCode) && numericCode >= 0 && numericCode <= 0x10ffff
        ? String.fromCodePoint(numericCode)
        : entity;
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

function normalizeExtractedText(value: string) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const rawLine of decodeHtmlEntities(value).split(/\r?\n/)) {
    const line = rawLine.replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 2 || seen.has(line)) {
      continue;
    }
    seen.add(line);
    lines.push(line);
  }

  return lines.join('\n');
}

function extractMetaContent(html: string) {
  const values: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/(?:name|property|itemprop)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    if (content && key && /(title|description|brand|product|model|sku)/.test(key)) {
      values.push(`${key}: ${content}`);
    }
  }
  return values.join('\n');
}

function extractStructuredData(html: string) {
  const values: string[] = [];
  const lowerHtml = html.toLowerCase();
  let cursor = 0;
  let extractedLength = 0;

  while (cursor < html.length) {
    const scriptStart = lowerHtml.indexOf('<script', cursor);
    if (scriptStart === -1) {
      break;
    }
    const openingEnd = lowerHtml.indexOf('>', scriptStart + 7);
    const scriptEnd = openingEnd === -1 ? -1 : lowerHtml.indexOf('</script>', openingEnd + 1);
    if (openingEnd === -1 || scriptEnd === -1) {
      break;
    }

    const attributes = html.slice(scriptStart + 7, openingEnd);
    const content = html.slice(openingEnd + 1, scriptEnd).trim();
    cursor = scriptEnd + 9;
    if (!content) {
      continue;
    }

    const isJsonLd = /type=["']application\/ld\+json["']/i.test(attributes);
    const isProductData = /product|specification|model|sku/i.test(content);
    if (isJsonLd || isProductData) {
      const extractedContent = content.slice(0, 20_000);
      values.push(extractedContent);
      extractedLength += extractedContent.length;
    }

    if (extractedLength >= 35_000) {
      break;
    }
  }

  return values.join('\n');
}

function removeElementBlocks(html: string, tagName: string) {
  const lowerHtml = html.toLowerCase();
  const openingToken = `<${tagName}`;
  const closingToken = `</${tagName}>`;
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const blockStart = lowerHtml.indexOf(openingToken, cursor);
    if (blockStart === -1) {
      parts.push(html.slice(cursor));
      break;
    }

    parts.push(html.slice(cursor, blockStart));
    const blockEnd = lowerHtml.indexOf(closingToken, blockStart + openingToken.length);
    if (blockEnd === -1) {
      break;
    }
    cursor = blockEnd + closingToken.length;
  }

  return parts.join(' ');
}

function extractVisibleText(html: string) {
  const withoutEmbeddedContent = ['script', 'style', 'noscript', 'svg']
    .reduce((currentHtml, tagName) => removeElementBlocks(currentHtml, tagName), html);

  return withoutEmbeddedContent
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:article|div|h[1-6]|li|p|section|td|th|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function buildExtractedPageText(html: string, finalUrl: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const extracted = normalizeExtractedText([
    `Product page URL: ${finalUrl}`,
    `Page title: ${title}`,
    extractMetaContent(html),
    extractStructuredData(html),
    extractVisibleText(html),
  ].join('\n'));

  if (extracted.length < 200) {
    throw new ProductPageExtractionError('The product page did not expose enough readable product information.');
  }

  return extracted.slice(0, MAX_EXTRACTED_CHARACTERS);
}

export async function extractProductPage(urlValue: string, requestSignal?: AbortSignal) {
  let currentUrl: URL;
  try {
    currentUrl = new URL(urlValue);
  } catch {
    throw new ProductPageExtractionError('Enter a valid product URL beginning with http:// or https://.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const abortForRequest = () => controller.abort();
  requestSignal?.addEventListener('abort', abortForRequest, { once: true });

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const addresses = await resolveSafePublicUrl(currentUrl);
      const response = await requestPage(currentUrl, addresses, controller.signal);
      const statusCode = response.statusCode ?? 0;

      if (statusCode >= 300 && statusCode < 400) {
        const location = getHeader(response.headers, 'location');
        response.destroy();
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new ProductPageExtractionError('The product page redirected too many times.', 502);
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.destroy();
        throw new ProductPageExtractionError(`The product page could not be read (HTTP ${statusCode}).`, 502);
      }

      const contentType = getHeader(response.headers, 'content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        response.destroy();
        throw new ProductPageExtractionError('The supplied URL did not return an HTML product page.');
      }

      const html = await readLimitedHtml(response);
      return {
        finalUrl: currentUrl.href,
        pageText: buildExtractedPageText(html, currentUrl.href),
        sourceImages: extractSourceImageCandidates(html, currentUrl.href),
      };
    }

    throw new ProductPageExtractionError('The product page redirected too many times.', 502);
  } catch (error) {
    if (error instanceof ProductPageExtractionError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProductPageExtractionError('The product page took too long to respond.', 504);
    }
    throw new ProductPageExtractionError('The product page could not be reached from the server.', 502);
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener('abort', abortForRequest);
  }
}
