import type { SourceAuthorityLabel } from './domain/contracts.ts';

const labels: Readonly<Record<string, Omit<SourceAuthorityLabel, 'sourceName' | 'safeReference' | 'verificationStatus' | 'limitations'>>> = Object.freeze({
  MANUFACTURER_STRUCTURED: { category: 'OFFICIAL_TECHNICAL_SPECIFICATION', displayLabel: 'Official Technical Specification', authorityLevel: 'PRIMARY' },
  MANUFACTURER_DOCUMENT: { category: 'OFFICIAL_MANUAL', displayLabel: 'Official Manual', authorityLevel: 'PRIMARY' },
  MANUFACTURER_PAGE: { category: 'OFFICIAL_MANUFACTURER', displayLabel: 'Official Manufacturer', authorityLevel: 'PRIMARY' },
  AUTHORIZED_DISTRIBUTOR: { category: 'AUTHORIZED_DISTRIBUTOR', displayLabel: 'Authorized Distributor', authorityLevel: 'STRONG' },
  AUTHORITATIVE_DISTRIBUTOR: { category: 'AUTHORIZED_DISTRIBUTOR', displayLabel: 'Authorized Distributor', authorityLevel: 'STRONG' },
  RETAILER_STRUCTURED: { category: 'TRUSTED_RETAILER', displayLabel: 'Trusted Retailer', authorityLevel: 'SUPPORTING' },
  RETAILER_PAGE: { category: 'TRUSTED_RETAILER', displayLabel: 'Trusted Retailer', authorityLevel: 'SUPPORTING' },
  MARKETPLACE_LISTING: { category: 'MARKETPLACE_LISTING', displayLabel: 'Marketplace Listing', authorityLevel: 'UNVERIFIED' },
  MERCHANT_LISTING: { category: 'MERCHANT_PROVIDED', displayLabel: 'Merchant-Provided', authorityLevel: 'MERCHANT' },
  MERCHANT_OVERRIDE: { category: 'MERCHANT_PROVIDED', displayLabel: 'Merchant-Provided', authorityLevel: 'MERCHANT' },
  HUMAN_REVIEWED: { category: 'MERCHANT_PROVIDED', displayLabel: 'Merchant-Provided', authorityLevel: 'MERCHANT' },
  SHOPIFY_IMPORT: { category: 'SHOPIFY_IMPORT', displayLabel: 'Imported from Shopify', authorityLevel: 'MERCHANT' },
  PRODUCT_INTELLIGENCE: { category: 'PRODUCT_INTELLIGENCE_RULE', displayLabel: 'Product Intelligence Rule', authorityLevel: 'SUPPORTING' },
});

export function projectSafeSourceAuthority(
  trustedAuthority: string | null | undefined,
  verificationStatus: string,
): SourceAuthorityLabel {
  const authority = trustedAuthority ? labels[trustedAuthority.toLocaleUpperCase('en-US')] : undefined;
  const selected = authority ?? { category: 'UNKNOWN_SOURCE' as const, displayLabel: 'Unknown Source', authorityLevel: 'UNVERIFIED' as const };
  return Object.freeze({
    ...selected,
    sourceName: null,
    safeReference: null,
    verificationStatus,
    limitations: Object.freeze(selected.category === 'PRODUCT_INTELLIGENCE_RULE'
      ? ['Guidance only; Product Truth remains authoritative.']
      : selected.category === 'UNKNOWN_SOURCE'
        ? ['Source authority could not be safely established.']
        : []),
  });
}
