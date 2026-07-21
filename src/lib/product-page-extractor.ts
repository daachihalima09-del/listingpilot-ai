import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARACTERS = 60_000;
const FETCH_TIMEOUT_MS = 20_000;

export class ProductPageExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductPageExtractionError';
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
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

function isPrivateIp(address: string) {
  if (isIP(address) === 4) {
    return isPrivateIpv4(address);
  }

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice(7));
  }

  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized);
}

async function assertSafePublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ProductPageExtractionError('Enter a public product URL beginning with http:// or https://.');
  }

  if (url.username || url.password) {
    throw new ProductPageExtractionError('Product URLs cannot contain embedded credentials.');
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    throw new ProductPageExtractionError('Product URLs must use the standard HTTP or HTTPS port.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ProductPageExtractionError('Private or local product URLs are not supported.');
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new ProductPageExtractionError('Private or local product URLs are not supported.');
  }
}

async function readLimitedHtml(response: Response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new ProductPageExtractionError('This product page is too large to analyze safely.');
  }

  if (!response.body) {
    throw new ProductPageExtractionError('The product page returned no readable content.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ProductPageExtractionError('This product page is too large to analyze safely.');
    }
    chunks.push(value);
  }

  const htmlBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    htmlBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(htmlBytes);
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
      return Number.isFinite(numericCode) ? String.fromCodePoint(numericCode) : entity;
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

export async function extractProductPage(urlValue: string) {
  let currentUrl: URL;
  try {
    currentUrl = new URL(urlValue);
  } catch {
    throw new ProductPageExtractionError('Enter a valid product URL beginning with http:// or https://.');
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafePublicUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(currentUrl, {
        cache: 'no-store',
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (compatible; ListingPilot/1.0; product-catalog-analyzer)',
        },
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new ProductPageExtractionError('The product page redirected too many times.');
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new ProductPageExtractionError(`The product page could not be read (HTTP ${response.status}).`);
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new ProductPageExtractionError('The supplied URL did not return an HTML product page.');
      }

      const html = await readLimitedHtml(response);
      return {
        finalUrl: currentUrl.href,
        pageText: buildExtractedPageText(html, currentUrl.href),
      };
    } catch (error) {
      if (error instanceof ProductPageExtractionError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProductPageExtractionError('The product page took too long to respond.');
      }
      throw new ProductPageExtractionError('The product page could not be reached from the server.');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ProductPageExtractionError('The product page redirected too many times.');
}
