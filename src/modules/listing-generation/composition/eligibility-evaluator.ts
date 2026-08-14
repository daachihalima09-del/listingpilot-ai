import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import type { GenerationBlocker, GenerationEligibility, GenerationFact, GenerationReviewRequirement, GenerationStatus, GenerationWarning, ListingGenerationInput } from '../domain/contracts.ts';

function blocker(code: GenerationBlocker['code'], sourceSystem: string, message: string, fieldIds: readonly string[] = [], relatedTruthFindingIds: readonly string[] = []): GenerationBlocker { return { code, severity: code.startsWith('INVALID_') ? 'CRITICAL' : 'HIGH', sourceSystem, fieldIds: [...fieldIds].sort(), message, reviewRequired: true, blocking: true, relatedIssueIds: [], relatedTruthFindingIds: [...relatedTruthFindingIds].sort(), relatedContradictionIds: [], metadata: {} }; }
function reviewId(requirement: Omit<GenerationReviewRequirement, 'id'>): GenerationReviewRequirement { const hash = new DeterministicHasher().hash(requirement); return { id: `generation_review_${hash}`, ...requirement }; }
function statusFor(blockers: readonly GenerationBlocker[], warnings: readonly GenerationWarning[], reviews: readonly GenerationReviewRequirement[]): GenerationStatus {
  if (blockers.some(({ code }) => code.startsWith('INVALID_'))) return 'INVALID_CONFIGURATION';
  if (blockers.some(({ code }) => !['MISSING_PRODUCT_IDENTITY', 'MISSING_REQUIRED_TRUTH'].includes(code))) return 'BLOCKED';
  if (blockers.length) return 'INSUFFICIENT_DATA';
  if (reviews.some(({ blocking }) => blocking)) return 'REVIEW_REQUIRED';
  if (warnings.length || reviews.some(({ type }) => type !== 'PUBLISHING_REVIEW')) return 'READY_WITH_WARNINGS';
  return 'READY';
}
export function evaluateGenerationEligibility(input: ListingGenerationInput, facts: readonly GenerationFact[], factReviews: readonly GenerationReviewRequirement[]): GenerationEligibility {
  const blockers: GenerationBlocker[] = []; const warnings: GenerationWarning[] = []; const reviews = [...factReviews];
  if (!input.project.id || !input.product.id || input.product.id !== input.project.productId || !input.product.title.trim()) blockers.push(blocker('MISSING_PRODUCT_IDENTITY', 'PROJECT', 'A stable project and product identity is required.'));
  if (input.project.status === 'ARCHIVED') blockers.push(blocker('CORRUPTED_PROJECT_STATE', 'PROJECT', 'Archived projects cannot create a generation plan.'));
  if (input.project.version !== input.project.expectedVersion) blockers.push(blocker('STALE_PROJECT_VERSION', 'PROJECT', 'The project version is stale.'));
  const preferences = input.merchantPreferences;
  for (const [key, value, code] of [
    ['catalog', preferences.catalog, 'INVALID_CATALOG_PROFILE'], ['listing', preferences.listing, 'INVALID_LISTING_PROFILE'], ['seo', preferences.seo, 'INVALID_SEO_PROFILE'], ['publishing', preferences.publishing, 'INVALID_PUBLISHING_PROFILE'], ['ai', preferences.ai, 'INVALID_AI_PROFILE'],
  ] as const) if (value.validationStatus === 'INVALID' || !value.complete) blockers.push(blocker(code, 'MERCHANT_PROFILE', `The ${key} profile must be valid and complete.`));
  const analysis = input.productIntelligence.analysis;
  if (analysis?.categoryDetection.status === 'AMBIGUOUS') blockers.push(blocker('AMBIGUOUS_PRODUCT_IDENTITY', 'PRODUCT_INTELLIGENCE', 'Product category identity is ambiguous.'));
  if (analysis?.categoryRequirements.missingIdentityFields.length) blockers.push(blocker('MISSING_REQUIRED_TRUTH', 'PRODUCT_INTELLIGENCE', 'Required identity facts are missing.', analysis.categoryRequirements.missingIdentityFields));
  if (analysis?.categoryValidationFindings.some(({ severity }) => severity === 'CRITICAL')) blockers.push(blocker('INVALID_PRODUCT_INTELLIGENCE_RESULT', 'PRODUCT_INTELLIGENCE', 'A critical category rule is violated.', analysis.categoryValidationFindings.flatMap(({ fieldIds }) => fieldIds)));
  if (!input.productIntelligence.pack) {
    const packPolicy = input.publishingPolicy.blockerPolicy.find(({ condition }) => condition === 'MISSING_PRODUCT_INTELLIGENCE_PACK')?.outcome;
    if (packPolicy === 'BLOCK') blockers.push(blocker('PUBLISHING_POLICY_BLOCK', 'PUBLISHING_PROFILE', 'Publishing policy blocks products without a Product Intelligence Pack.'));
    else warnings.push({ code: 'MISSING_PRODUCT_INTELLIGENCE_PACK', sourceSystem: 'PRODUCT_INTELLIGENCE', fieldIds: [], message: 'Generic category-agnostic generation rules apply because no pack matched.', metadata: {} });
  }
  const criticalConflicts = facts.filter(({ truthStatus, importance }) => truthStatus === 'CONFLICTED' && importance === 'CRITICAL');
  if (criticalConflicts.length) blockers.push(blocker('CRITICAL_TRUTH_CONFLICT', 'PRODUCT_TRUTH', 'Critical Product Truth conflicts must be resolved.', criticalConflicts.map(({ fieldId }) => fieldId), criticalConflicts.map(({ id }) => id)));
  const provenanceMissing = facts.filter(({ selectionStatus, evidenceReferences }) => selectionStatus === 'SELECTED' && evidenceReferences.length === 0);
  if (provenanceMissing.length && input.aiPolicy.evidence.missingProvenanceCeiling === 'OMIT') blockers.push(blocker('MISSING_SOURCE_PROVENANCE', 'PRODUCT_TRUTH', 'Selected facts require traceable provenance.', provenanceMissing.map(({ fieldId }) => fieldId)));
  const unresolvedHighRisk = facts.filter(({ productIntelligenceGuidance, selectionStatus }) => productIntelligenceGuidance.highRisk && !['SELECTED', 'NOT_APPLICABLE'].includes(selectionStatus));
  if (unresolvedHighRisk.some(({ productIntelligenceGuidance }) => productIntelligenceGuidance.requirementLevel === 'IDENTITY_REQUIRED' || productIntelligenceGuidance.requirementLevel === 'CATEGORY_REQUIRED')) blockers.push(blocker('UNRESOLVED_HIGH_RISK_FIELD', 'PRODUCT_INTELLIGENCE', 'Required high-risk facts need stronger evidence.', unresolvedHighRisk.map(({ fieldId }) => fieldId)));
  const selectedIdentityFields = new Set(facts.filter(({ selectionStatus }) => selectionStatus === 'SELECTED').map(({ fieldId }) => fieldId));
  const hasSafeIdentity = selectedIdentityFields.has('title')
    || (selectedIdentityFields.has('brand') && selectedIdentityFields.has('model'))
    || (selectedIdentityFields.has('model') && (selectedIdentityFields.has('product_type') || selectedIdentityFields.has('type')));
  if (!hasSafeIdentity) blockers.push(blocker('MISSING_REQUIRED_TRUTH', 'PRODUCT_TRUTH', 'Verified product identity is required before a safe draft can be generated.', ['brand', 'model', 'product_type']));
  if (!input.product.media.some(({ type }) => type === 'IMAGE')) warnings.push({ code: 'MISSING_OPTIONAL_IMAGES', sourceSystem: 'PRODUCT', fieldIds: [], message: 'Images were not assessed. A text-only draft can still be generated.', metadata: {} });
  if (!input.product.variants.length) warnings.push({ code: 'MISSING_OPTIONAL_VARIANTS', sourceSystem: 'PRODUCT', fieldIds: [], message: 'Variant information is unavailable. Variant claims will be omitted.', metadata: {} });
  const optionalCategoryFields = [...(analysis?.categoryRequirements.missingCategoryFields ?? []), ...(analysis?.categoryRequirements.missingRecommendedFields ?? [])];
  if (optionalCategoryFields.length) warnings.push({ code: 'MISSING_OPTIONAL_CATEGORY_FACTS', sourceSystem: 'PRODUCT_INTELLIGENCE', fieldIds: [...new Set(optionalCategoryFields)].sort(), message: 'Optional category details are missing and will be omitted from the draft.', metadata: {} });
  if (!input.aiPolicy.prohibitedActions.includes('INVENT_FACTS') || !input.aiPolicy.highRisk.requireHumanReview) blockers.push(blocker('AI_POLICY_BLOCK', 'AI_PROFILE', 'AI safety policy does not contain required generation protections.'));
  if (input.publishingPolicy.variantPolicy.deletion !== 'NEVER_DELETE' || input.publishingPolicy.imagePolicy.deletion !== 'NEVER_DELETE') blockers.push(blocker('UNSUPPORTED_DESTRUCTIVE_OPERATION', 'PUBLISHING_PROFILE', 'Generation plans cannot prepare destructive variant or image operations.'));
  const lockedByField = new Map(input.lockedFields.map((lock) => [lock.field, lock])); const hasher = new DeterministicHasher();
  for (const fact of facts.filter(({ selectionStatus }) => selectionStatus === 'SELECTED')) { const lock = lockedByField.get(fact.fieldId); if (lock && fact.displayValue !== null && lock.valueFingerprint !== hasher.hash(fact.displayValue)) { blockers.push(blocker('LOCKED_CONTENT_CONFLICT', 'PROJECT', 'Locked merchant content conflicts with verified Product Truth.', [fact.fieldId], [fact.id])); reviews.push(reviewId({ type: 'FACT_REVIEW', priority: 'CRITICAL', blocking: true, fieldIds: [fact.fieldId], reason: 'Locked content differs from verified truth.', relatedIssueIds: [], relatedFactIds: [fact.id], relatedProfileSection: null, resolutionOptions: ['KEEP_LOCK', 'REVIEW_TRUTH', 'UNLOCK_WITH_APPROVAL'], metadata: {} })); } }
  if (input.aiPolicy.humanReviewThresholds.includes('ALWAYS_REVIEW')) reviews.push(reviewId({ type: 'PUBLISHING_REVIEW', priority: 'HIGH', blocking: false, fieldIds: [], reason: 'The merchant requires review of generated proposals before acceptance.', relatedIssueIds: [], relatedFactIds: [], relatedProfileSection: 'ai', resolutionOptions: ['REVIEW_GENERATED_PROPOSAL'], metadata: {} }));
  const sortedBlockers = blockers.sort((left, right) => left.code.localeCompare(right.code)); const sortedWarnings = warnings.sort((left, right) => left.code.localeCompare(right.code)); const sortedReviews = [...new Map(reviews.sort((left, right) => left.id.localeCompare(right.id)).map((item) => [item.id, item])).values()]; const status = statusFor(sortedBlockers, sortedWarnings, sortedReviews);
  return Object.freeze({ status, allowed: !sortedBlockers.length && !sortedReviews.some(({ blocking }) => blocking), blockers: Object.freeze(sortedBlockers), warnings: Object.freeze(sortedWarnings), reviewRequirements: Object.freeze(sortedReviews), explanationCodes: Object.freeze([...sortedBlockers.map(({ code }) => code), ...sortedWarnings.map(({ code }) => code), ...sortedReviews.map(({ type }) => type)]) });
}
