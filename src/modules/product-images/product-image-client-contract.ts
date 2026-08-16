import type { ShopifyImageConfigurationDto } from '@/modules/shopify/images/image-repository';

export interface ProductSourceImageDto {
  id: string;
  sourceKind: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  status: string;
  quality: string;
  qualityWarning: string | null;
  previewUrl: string;
}

export interface ProductImageImportResponse {
  configuration: ShopifyImageConfigurationDto;
  sources: ProductSourceImageDto[];
}

export function parseProductImageImportResponse(value: unknown): ProductImageImportResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_IMPORT_RESPONSE');
  const record = value as Record<string, unknown>;
  const configuration = record.configuration;
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('INVALID_IMPORT_RESPONSE');
  const images = (configuration as Record<string, unknown>).images;
  if (!Array.isArray(images) || !Array.isArray(record.sources)) throw new Error('INVALID_IMPORT_RESPONSE');
  return value as ProductImageImportResponse;
}
