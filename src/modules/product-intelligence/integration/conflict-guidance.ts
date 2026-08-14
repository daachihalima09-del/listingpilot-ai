import type { ConflictGuidanceRule, ProductCategoryId } from '../domain/contracts.ts';
import type { ProductIntelligenceRegistry } from '../registry/product-intelligence-registry.ts';

export interface ResolvedProductConflictGuidance {
  readonly packId: string;
  readonly packVersion: string;
  readonly category: ProductCategoryId;
  readonly guidance: ConflictGuidanceRule;
}

export function getProductConflictGuidance(input: {
  readonly category: ProductCategoryId;
  readonly fieldId: string;
  readonly registry: ProductIntelligenceRegistry;
}): ResolvedProductConflictGuidance | null {
  const pack = input.registry.getByCategory(input.category);
  const fieldId = pack ? input.registry.resolveFieldId(pack.identity.id, input.fieldId) : undefined;
  const guidance = fieldId ? pack?.conflictGuidance.find((candidate) => candidate.fieldId === fieldId) : undefined;
  return pack && guidance ? Object.freeze({
    packId: pack.identity.id,
    packVersion: pack.identity.version,
    category: pack.identity.categoryId,
    guidance,
  }) : null;
}

export function productConflictRequiresManualReview(input: {
  readonly category: ProductCategoryId;
  readonly fieldId: string;
  readonly registry: ProductIntelligenceRegistry;
}): boolean {
  return getProductConflictGuidance(input)?.guidance.requiresManualReview ?? false;
}
