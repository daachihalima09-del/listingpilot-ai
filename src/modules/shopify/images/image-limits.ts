export const SHOPIFY_IMAGE_LIMITS = {
  maximumImages: 20,
  maximumImageBytes: 20_000_000,
  maximumTotalBytes: 100_000_000,
  maximumFilenameLength: 255,
  maximumAltTextLength: 512,
  uploadSessionLifetimeMs: 10 * 60 * 1_000,
  remoteDownloadTimeoutMs: 8_000,
  maximumRedirects: 3,
  processingPollAttempts: 3,
  processingPollDelayMs: 250,
} as const;

export const SHOPIFY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ShopifyImageMimeType =
  typeof SHOPIFY_IMAGE_MIME_TYPES[number];

