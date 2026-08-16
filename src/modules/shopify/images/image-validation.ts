import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  SHOPIFY_IMAGE_LIMITS,
  SHOPIFY_IMAGE_MIME_TYPES,
  type ShopifyImageMimeType,
} from './image-limits.ts';

const controlCharacters = /[\u0000-\u001F\u007F]/;
const extensionByMime: Record<ShopifyImageMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

export const imageAltTextSchema = z.string()
  .trim()
  .max(SHOPIFY_IMAGE_LIMITS.maximumAltTextLength)
  .refine((value) => !controlCharacters.test(value), {
    message: 'Alt text contains unsupported control characters.',
  })
  .transform((value) => value || null)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const imageFilenameSchema = z.string()
  .trim()
  .min(1)
  .max(SHOPIFY_IMAGE_LIMITS.maximumFilenameLength)
  .refine((value) => (
    !value.startsWith('.')
    && !value.includes('/')
    && !value.includes('\\')
    && !controlCharacters.test(value)
  ), { message: 'Image filename is invalid.' });

export const imageMimeTypeSchema = z.enum(SHOPIFY_IMAGE_MIME_TYPES);
export const imageByteSizeSchema = z.number().int().positive()
  .max(SHOPIFY_IMAGE_LIMITS.maximumImageBytes);

export const remoteImageInputSchema = z.object({
  url: z.string().max(4_096),
  altText: imageAltTextSchema,
}).strict();

export const uploadInitiationInputSchema = z.object({
  filename: imageFilenameSchema,
  mimeType: imageMimeTypeSchema,
  byteSize: imageByteSizeSchema,
  altText: imageAltTextSchema,
}).strict().superRefine((value, context) => {
  const extension = value.filename.split('.').pop()?.toLowerCase() ?? '';
  if (!extensionByMime[value.mimeType].includes(extension)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['filename'],
      message: 'Filename extension does not match the image MIME type.',
    });
  }
});

export const imageConfigurationInputSchema = z.object({
  version: z.number().int().min(0),
  images: z.array(z.object({
    localId: z.string().uuid(),
    altText: imageAltTextSchema,
    position: z.number().int().min(0).max(
      SHOPIFY_IMAGE_LIMITS.maximumImages - 1,
    ),
    isPrimary: z.boolean(),
    active: z.boolean(),
  }).strict()).max(SHOPIFY_IMAGE_LIMITS.maximumImages),
}).strict().superRefine((value, context) => {
  const localIds = new Set<string>();
  const active = value.images.filter(({ active: enabled }) => enabled);
  const positions = active.map(({ position }) => position).sort((a, b) => a - b);
  for (const [index, image] of value.images.entries()) {
    if (localIds.has(image.localId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['images', index, 'localId'],
        message: 'Duplicate image reference.',
      });
    }
    localIds.add(image.localId);
    if (image.isPrimary && !image.active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['images', index, 'isPrimary'],
        message: 'An inactive image cannot be primary.',
      });
    }
  }
  if (active.filter(({ isPrimary }) => isPrimary).length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['images'],
      message: 'Only one image can be primary.',
    });
  }
  if (positions.some((position, index) => position !== index)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['images'],
      message: 'Active image positions must be contiguous and unique.',
    });
  }
  const primary = active.find(({ isPrimary }) => isPrimary);
  if (primary && primary.position !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['images'],
      message: 'The primary image must be first.',
    });
  }
});

export function validateFilenameAndMime(
  filename: string,
  mimeType: string,
) {
  const parsedFilename = imageFilenameSchema.parse(filename);
  const parsedMime = imageMimeTypeSchema.parse(mimeType);
  const extension = parsedFilename.split('.').pop()?.toLowerCase() ?? '';
  if (!extensionByMime[parsedMime].includes(extension)) {
    throw new Error('Filename extension does not match the image MIME type.');
  }
  return { filename: parsedFilename, mimeType: parsedMime };
}

export function detectImageMimeType(bytes: Uint8Array): ShopifyImageMimeType | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF'
    && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return null;
}

export function validateImageBytes(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  filename?: string;
}) {
  if (!input.bytes.length) throw new Error('Image file is empty.');
  if (input.bytes.length > SHOPIFY_IMAGE_LIMITS.maximumImageBytes) {
    throw new Error('Image file is too large.');
  }
  const mimeType = imageMimeTypeSchema.parse(input.declaredMimeType);
  if (detectImageMimeType(input.bytes) !== mimeType) {
    throw new Error('Image content does not match its MIME type.');
  }
  if (input.filename) validateFilenameAndMime(input.filename, mimeType);
  return {
    mimeType,
    byteSize: input.bytes.length,
    contentHash: createHash('sha256').update(input.bytes).digest('hex'),
    ...readImageDimensions(input.bytes, mimeType),
  };
}

export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: ShopifyImageMimeType,
): { width: number | null; height: number | null } {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === 'image/jpeg') {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (bytes[offset + 5]! << 8) + bytes[offset + 6]!,
          width: (bytes[offset + 7]! << 8) + bytes[offset + 8]!,
        };
      }
      offset += length + 2;
    }
  }
  if (mimeType === 'image/webp' && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === 'VP8X') {
      const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
      return { width, height };
    }
  }
  return { width: null, height: null };
}

export function imageQuality(input: { width: number | null; height: number | null; byteSize: number }) {
  if (input.width === null || input.height === null) return { status: 'NEEDS_ATTENTION' as const, warning: 'Dimensions could not be verified.' };
  if (input.width < 800 || input.height < 800) return { status: 'LOW_RESOLUTION' as const, warning: 'Resolution is below 800 × 800 pixels.' };
  const ratio = Math.max(input.width / input.height, input.height / input.width);
  if (input.width < 1_200 || input.height < 1_200 || ratio > 3) return { status: 'NEEDS_ATTENTION' as const, warning: ratio > 3 ? 'The image has an unusually wide or tall aspect ratio.' : 'A larger image may look sharper in ecommerce layouts.' };
  return { status: 'GOOD' as const, warning: null };
}

export type ImageConfigurationInput = z.infer<
  typeof imageConfigurationInputSchema
>;
export type RemoteImageInput = z.infer<typeof remoteImageInputSchema>;
export type UploadInitiationInput = z.infer<
  typeof uploadInitiationInputSchema
>;
