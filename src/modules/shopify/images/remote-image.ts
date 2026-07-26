import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SHOPIFY_IMAGE_LIMITS } from './image-limits.ts';
import {
  imageMimeTypeSchema,
  validateImageBytes,
} from './image-validation.ts';

const blockedHostnames = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
]);
const signedQueryKeys = [
  'x-amz-signature',
  'x-goog-signature',
  'signature',
  'sig',
  'token',
  'expires',
];

export class RemoteImageError extends Error {
  readonly category:
    | 'INVALID_URL'
    | 'UNSAFE_HOST'
    | 'REDIRECT_LIMIT'
    | 'TIMEOUT'
    | 'UNAVAILABLE'
    | 'INVALID_CONTENT';

  constructor(
    category:
      | 'INVALID_URL'
      | 'UNSAFE_HOST'
      | 'REDIRECT_LIMIT'
      | 'TIMEOUT'
      | 'UNAVAILABLE'
      | 'INVALID_CONTENT',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteImageError';
    this.category = category;
  }
}

function ipv4Unsafe(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224
  );
}

export function isUnsafeImageAddress(address: string): boolean {
  if (isIP(address) === 4) return ipv4Unsafe(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  if (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
  ) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  return mapped ? ipv4Unsafe(mapped[1]) : false;
}

export function parseSafeRemoteImageUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteImageError('INVALID_URL', 'Enter a valid HTTPS image URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
  ) {
    throw new RemoteImageError(
      'INVALID_URL',
      'Remote images must use HTTPS without credentials or custom ports.',
    );
  }
  if (
    blockedHostnames.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
  ) {
    throw new RemoteImageError(
      'UNSAFE_HOST',
      'This remote image host is not allowed.',
    );
  }
  if (isIP(hostname) && isUnsafeImageAddress(hostname)) {
    throw new RemoteImageError(
      'UNSAFE_HOST',
      'This remote image host is not allowed.',
    );
  }
  url.hash = '';
  return url;
}

async function assertSafeResolution(
  url: URL,
  resolveHost: (hostname: string) => Promise<string[]>,
) {
  let addresses: string[];
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new RemoteImageError(
      'UNAVAILABLE',
      'The remote image host could not be resolved.',
    );
  }
  if (!addresses.length || addresses.some(isUnsafeImageAddress)) {
    throw new RemoteImageError(
      'UNSAFE_HOST',
      'This remote image host is not allowed.',
    );
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (
    Number.isFinite(declaredLength)
    && declaredLength > SHOPIFY_IMAGE_LIMITS.maximumImageBytes
  ) throw new RemoteImageError('INVALID_CONTENT', 'The remote image is too large.');
  if (!response.body) {
    throw new RemoteImageError('UNAVAILABLE', 'The remote image had no content.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > SHOPIFY_IMAGE_LIMITS.maximumImageBytes) {
      await reader.cancel();
      throw new RemoteImageError(
        'INVALID_CONTENT',
        'The remote image is too large.',
      );
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export interface ValidatedRemoteImage {
  canonicalUrl: string | null;
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  contentHash: string;
}

export async function downloadRemoteImage(
  rawUrl: string,
  options: {
    fetcher?: typeof fetch;
    resolveHost?: (hostname: string) => Promise<string[]>;
    timeoutMs?: number;
    maximumRedirects?: number;
  } = {},
): Promise<ValidatedRemoteImage> {
  const fetcher = options.fetcher ?? fetch;
  const resolveHost = options.resolveHost ?? (async (hostname) => (
    (await lookup(hostname, { all: true, verbatim: true }))
      .map(({ address }) => address)
  ));
  const timeoutMs = options.timeoutMs
    ?? SHOPIFY_IMAGE_LIMITS.remoteDownloadTimeoutMs;
  const maximumRedirects = options.maximumRedirects
    ?? SHOPIFY_IMAGE_LIMITS.maximumRedirects;
  let url = parseSafeRemoteImageUrl(rawUrl);

  for (let redirects = 0; ; redirects += 1) {
    if (redirects > maximumRedirects) {
      throw new RemoteImageError(
        'REDIRECT_LIMIT',
        'The remote image redirected too many times.',
      );
    }
    await assertSafeResolution(url, resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
        signal: controller.signal,
      });
    } catch (error) {
      throw new RemoteImageError(
        error instanceof Error && error.name === 'AbortError'
          ? 'TIMEOUT'
          : 'UNAVAILABLE',
        error instanceof Error && error.name === 'AbortError'
          ? 'The remote image download timed out.'
          : 'The remote image could not be downloaded.',
      );
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new RemoteImageError(
          'UNAVAILABLE',
          'The remote image redirect was invalid.',
        );
      }
      url = parseSafeRemoteImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new RemoteImageError(
        'UNAVAILABLE',
        'The remote image could not be downloaded.',
      );
    }
    const contentType = response.headers.get('content-type')
      ?.split(';')[0].trim().toLowerCase();
    const mimeType = imageMimeTypeSchema.safeParse(contentType);
    if (!mimeType.success) {
      throw new RemoteImageError(
        'INVALID_CONTENT',
        'The remote resource is not a supported image.',
      );
    }
    const bytes = await readBoundedBody(response);
    let validated;
    try {
      validated = validateImageBytes({
        bytes,
        declaredMimeType: mimeType.data,
      });
    } catch {
      throw new RemoteImageError(
        'INVALID_CONTENT',
        'The remote resource is not a valid supported image.',
      );
    }
    const hasSignedQuery = [...url.searchParams.keys()].some(
      (key) => signedQueryKeys.includes(key.toLowerCase()),
    );
    return {
      canonicalUrl: hasSignedQuery ? null : url.toString(),
      bytes,
      ...validated,
    };
  }
}
