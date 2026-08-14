import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import type { ProductIntelligencePack, ProductTruthFieldDefinition } from '../../product-intelligence/domain/contracts.ts';
import type { FactSelectionInput, FactSelectionStatus, FactUseTarget, GenerationFact, GenerationReviewRequirement } from '../domain/contracts.ts';
import { ListingGenerationError } from '../domain/errors.ts';

const allOutputUses: readonly FactUseTarget[] = ['TITLE', 'DESCRIPTION', 'FEATURES', 'SEO_TITLE', 'SEO_DESCRIPTION', 'URL_HANDLE', 'METAFIELDS', 'ALT_TEXT', 'CATALOG_CLASSIFICATION', 'COMPARISON'];
const commerceFields = new Set(['price', 'compare_at_price', 'inventory', 'inventory_quantity', 'availability', 'warranty']);
function normalize(value: string): string { return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, ''); }
function fieldDefinition(pack: ProductIntelligencePack | null, fieldPath: string, label: string): ProductTruthFieldDefinition | null {
  if (!pack) return null;
  const candidates = new Set([normalize(fieldPath), normalize(label)]);
  return pack.truthFields.find((field) => [field.fieldId, field.canonicalName, field.displayName, ...field.aliases].some((value) => candidates.has(normalize(value)))) ?? null;
}
function statusFor(input: { truthStatus: string; aiStrictness: string; aiAuthorityOnly: boolean; highRisk: boolean; evidenceStrong: boolean }): FactSelectionStatus {
  if (input.truthStatus === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (input.truthStatus === 'CONFLICTED') return 'CONFLICTED';
  if (input.truthStatus === 'UNRESOLVED') return 'UNRESOLVED';
  if (input.truthStatus === 'INSUFFICIENT_EVIDENCE' || input.aiAuthorityOnly) return 'EXCLUDED';
  if (input.highRisk && !input.evidenceStrong) return 'REVIEW_REQUIRED';
  if (input.truthStatus === 'VERIFIED') return 'SELECTED';
  if (input.truthStatus === 'LIKELY') return input.aiStrictness === 'VERIFIED_ONLY' ? 'EXCLUDED' : 'REVIEW_REQUIRED';
  if (input.truthStatus === 'MERCHANT_OVERRIDE') return input.aiStrictness === 'ALLOW_MERCHANT_APPROVED_UNVERIFIED' ? 'REVIEW_REQUIRED' : 'EXCLUDED';
  return 'EXCLUDED';
}
function usesFor(fieldId: string, status: FactSelectionStatus): { allowed: readonly FactUseTarget[]; prohibited: readonly FactUseTarget[] } {
  if (status !== 'SELECTED') return { allowed: ['INTERNAL_ONLY'], prohibited: allOutputUses };
  if (commerceFields.has(fieldId)) return { allowed: ['INTERNAL_ONLY'], prohibited: allOutputUses };
  const allowed = fieldId === 'vendor' || fieldId === 'brand' || fieldId === 'product_type'
    ? allOutputUses
    : allOutputUses.filter((use) => use !== 'CATALOG_CLASSIFICATION');
  return { allowed, prohibited: allOutputUses.filter((use) => !allowed.includes(use)) };
}

export function selectGenerationFacts(input: FactSelectionInput): Readonly<{ facts: readonly GenerationFact[]; reviews: readonly GenerationReviewRequirement[] }> {
  const hasher = new DeterministicHasher(); const ids = new Set<string>(); const reviews: GenerationReviewRequirement[] = [];
  const facts = input.findings.map((finding) => {
    const definition = fieldDefinition(input.pack, finding.fieldPath, finding.claimLabel); const fieldId = definition?.fieldId ?? normalize(finding.fieldPath || finding.claimLabel);
    const highRisk = Boolean(definition && (definition.verificationPolicy !== 'STANDARD' || input.pack?.safetyGuidance.manualReviewFields.includes(definition.fieldId)));
    const official = ['MANUFACTURER_STRUCTURED', 'MANUFACTURER_DOCUMENT', 'AUTHORITATIVE_DISTRIBUTOR', 'HUMAN_REVIEWED', 'MERCHANT_OVERRIDE'].includes(finding.evidenceSummary.strongestAuthority);
    const evidenceStrong = finding.evidenceSummary.independentSourceCount >= input.aiPolicy.evidence.minimumIndependentSourceCount && (!highRisk || official);
    const selectionStatus = statusFor({ truthStatus: finding.status, aiStrictness: input.aiPolicy.factualStrictness, aiAuthorityOnly: finding.evidenceSummary.strongestAuthority === 'AI_DERIVED', highRisk, evidenceStrong });
    const id = `generation_fact_${finding.deterministicFingerprint}`; if (ids.has(id)) throw new ListingGenerationError('DUPLICATE_FACT_ID', 'Product Truth contains duplicate fact identities.', { factId: id }); ids.add(id);
    const uses = usesFor(fieldId, selectionStatus);
    const reviewType = selectionStatus === 'CONFLICTED' ? 'CONFLICT_REVIEW' : finding.status === 'MERCHANT_OVERRIDE' ? 'MERCHANT_OVERRIDE_REVIEW' : highRisk && selectionStatus === 'REVIEW_REQUIRED' ? 'HIGH_RISK_REVIEW' : selectionStatus === 'REVIEW_REQUIRED' ? 'FACT_REVIEW' : null;
    if (reviewType) reviews.push({ id: `generation_review_${hasher.hash({ reviewType, id })}`, type: reviewType, priority: reviewType === 'CONFLICT_REVIEW' || reviewType === 'HIGH_RISK_REVIEW' ? 'CRITICAL' : 'HIGH', blocking: false, fieldIds: [fieldId], reason: finding.explanation, relatedIssueIds: finding.associatedIssueIds, relatedFactIds: [id], relatedProfileSection: reviewType === 'HIGH_RISK_REVIEW' ? 'ai' : null, resolutionOptions: ['OMIT', 'REVIEW_EVIDENCE', 'APPROVE_TRACEABLE_VALUE'], metadata: { safelyOmittedFromGeneration: true } });
    return { id, fieldId, productId: finding.productId, variantId: finding.variantId ?? null, rawValue: finding.selectedValue ?? null, normalizedValue: finding.selectedValue ?? null, displayValue: finding.selectedValue ?? null, truthStatus: finding.status, confidence: finding.confidence.value, importance: finding.importance, sourceReferences: [finding.evidenceSummary.strongestAuthority], evidenceReferences: finding.evidenceSummary.evidenceCount > 0 ? [finding.id] : [], selectionStatus, selectionReason: finding.explanation, allowedUses: uses.allowed, prohibitedUses: uses.prohibited, reviewRequirement: reviewType, productIntelligenceGuidance: { requirementLevel: definition?.requirementLevel ?? null, verificationPolicy: definition?.verificationPolicy ?? null, variantSensitivity: definition?.variantSensitivity ?? null, regionalSensitivity: definition?.regionalSensitivity ?? false, highRisk }, metadata: { truthFindingId: finding.id, claimGroupId: finding.claimGroupId, associatedIssueIds: finding.associatedIssueIds, associatedRecommendationIds: finding.associatedRecommendationIds } } satisfies GenerationFact;
  }).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({ facts: Object.freeze(facts), reviews: Object.freeze(reviews.sort((left, right) => left.id.localeCompare(right.id))) });
}
