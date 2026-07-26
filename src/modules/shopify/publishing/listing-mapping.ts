import { z } from 'zod';
import {
  shopifyProductCreateInputSchema,
  type ShopifyProductCreateInput,
} from '../products/product-validation.ts';
import {
  shopifyProductUpdateInputSchema,
  type ShopifyProductUpdateInput,
} from '../products/product-update-validation.ts';

export interface ListingPilotPublishSource {
  listing: {
    title: string;
    description: string;
    tags: string;
  };
  product: {
    brand: string;
  };
}

export type ShopifyPublishStatus = 'ACTIVE' | 'DRAFT';
export const DEFAULT_SHOPIFY_PUBLISH_STATUS: ShopifyPublishStatus = 'DRAFT';

export interface ShopifyMappedProduct {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: ShopifyPublishStatus;
}

function normalizeTags(value: string): string[] {
  return [...new Set(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )];
}

export function mapListingToShopifyProduct(
  source: ListingPilotPublishSource,
  status: ShopifyPublishStatus,
): ShopifyMappedProduct {
  return {
    title: source.listing.title.trim(),
    descriptionHtml: source.listing.description,
    vendor: source.product.brand.trim() === 'Missing'
      ? ''
      : source.product.brand.trim(),
    productType: '',
    tags: normalizeTags(source.listing.tags),
    status,
  };
}

export function validateMappedShopifyProduct(
  product: ShopifyMappedProduct,
  mode: 'create',
): ShopifyProductCreateInput;
export function validateMappedShopifyProduct(
  product: ShopifyMappedProduct,
  mode: 'update',
): ShopifyProductUpdateInput;
export function validateMappedShopifyProduct(
  product: ShopifyMappedProduct,
  mode: 'create' | 'update',
): ShopifyProductCreateInput | ShopifyProductUpdateInput {
  return mode === 'create'
    ? shopifyProductCreateInputSchema.parse(product)
    : shopifyProductUpdateInputSchema.parse(product);
}

export function isMappedShopifyProductValid(
  product: ShopifyMappedProduct,
  mode: 'create' | 'update',
): boolean {
  try {
    if (mode === 'create') {
      validateMappedShopifyProduct(product, 'create');
    } else {
      validateMappedShopifyProduct(product, 'update');
    }
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) return false;
    throw error;
  }
}
