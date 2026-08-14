import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { DuplicateAssessmentResult, DuplicateCandidate } from './publishing-plan.ts';

export interface DuplicateProductInput {
  readonly productGid: string;
  readonly title: string;
  readonly handle: string;
  readonly vendor: string;
  readonly productType: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, ' ').trim();
}

export function identityFromDraft(draft: ListingDraft) {
  const identityFacts = draft.reviewWorkspace?.facts ?? [];
  const find = (pattern: RegExp) => identityFacts.find((fact) => pattern.test(fact.label))?.value.trim() || null;
  return {
    title: draft.title.value.trim(),
    modelNumber: find(/model(?: number)?/iu),
    sku: find(/sku/iu),
    barcode: find(/(?:barcode|gtin|upc|ean)/iu),
    vendor: draft.catalog.vendor.value.trim(),
    productType: draft.catalog.productType.value.trim(),
  };
}

export function assessDuplicateProducts(
  identity: ReturnType<typeof identityFromDraft>,
  products: readonly DuplicateProductInput[],
): { result: DuplicateAssessmentResult; candidates: DuplicateCandidate[] } {
  if (!identity.title || (!identity.modelNumber && !identity.sku && !identity.barcode)) {
    return { result: 'INSUFFICIENT_IDENTITY', candidates: [] };
  }
  const candidates = products.map((product) => {
    const exactBarcode = Boolean(identity.barcode && normalized(identity.barcode) === normalized(product.barcode));
    const exactSku = Boolean(identity.sku && normalized(identity.sku) === normalized(product.sku));
    const modelInTitle = Boolean(identity.modelNumber && normalized(product.title).includes(normalized(identity.modelNumber)));
    const exactTitle = normalized(identity.title) === normalized(product.title);
    const catalogMatch = normalized(identity.vendor) === normalized(product.vendor)
      || normalized(identity.productType) === normalized(product.productType);
    const score = exactBarcode ? 100 : exactSku ? 95 : exactTitle && modelInTitle ? 90 : modelInTitle && catalogMatch ? 75 : exactTitle ? 60 : 0;
    return { product, score, reason: exactBarcode ? 'Matching barcode' : exactSku ? 'Matching SKU' : modelInTitle ? 'Matching model identity' : exactTitle ? 'Matching title' : '' };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score).slice(0, 5);
  const highest = candidates[0]?.score ?? 0;
  const result: DuplicateAssessmentResult = highest >= 95 ? 'EXACT_MATCH' : highest >= 75 ? 'STRONG_MATCH' : highest > 0 ? 'POSSIBLE_MATCH' : 'NO_MATCH';
  return {
    result,
    candidates: candidates.map(({ product, reason }) => ({
      productGid: product.productGid,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      reason,
    })),
  };
}
