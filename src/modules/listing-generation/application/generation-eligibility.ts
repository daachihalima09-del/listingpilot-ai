import type {
  GenerationBlocker,
  GenerationReviewRequirement,
  GenerationWarning,
  ListingGenerationPlan,
} from '../domain/contracts.ts';

export type GenerationFindingKind = 'BLOCKING' | 'WARNING' | 'INFORMATIONAL';
export type GenerationResolutionArea = 'PRODUCT_TRUTH' | 'MERCHANT_PROFILE' | 'PROJECT';

export interface GenerationEligibilityFinding {
  readonly id: string;
  readonly kind: GenerationFindingKind;
  readonly code: string;
  readonly title: string;
  readonly explanation: string;
  readonly fieldIds: readonly string[];
  readonly resolutionArea: GenerationResolutionArea;
}

export interface CanonicalGenerationEligibility {
  readonly canGenerate: boolean;
  readonly status: ListingGenerationPlan['generationStatus'];
  readonly blockingFindings: readonly GenerationEligibilityFinding[];
  readonly warnings: readonly GenerationEligibilityFinding[];
  readonly informationalFindings: readonly GenerationEligibilityFinding[];
}

function label(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase('en-US'));
}

function resolutionArea(sourceSystem: string): GenerationResolutionArea {
  if (sourceSystem === 'MERCHANT_PROFILE' || sourceSystem.endsWith('_PROFILE')) return 'MERCHANT_PROFILE';
  if (sourceSystem === 'PROJECT') return 'PROJECT';
  return 'PRODUCT_TRUTH';
}

const merchantTitles: Readonly<Record<string, string>> = {
  MISSING_OPTIONAL_IMAGES: 'Images not assessed',
  MISSING_OPTIONAL_VARIANTS: 'Variant information unavailable',
  MISSING_OPTIONAL_CATEGORY_FACTS: 'Some optional product details are unavailable',
  MISSING_PRODUCT_INTELLIGENCE_PACK: 'Category-specific guidance unavailable',
  CATALOG_REVIEW: 'Catalog details need review',
  DESCRIPTION_REVIEW: 'Structured details need review',
  PUBLISHING_REVIEW: 'Review required before publishing',
  CRITICAL_TRUTH_CONFLICT: 'Product facts conflict',
  MISSING_REQUIRED_TRUTH: 'Required product identity is missing',
  PUBLISHING_POLICY_BLOCK: 'Publishing policy needs attention',
  AI_POLICY_BLOCK: 'AI safety settings need attention',
};

function merchantTitle(code: string): string {
  return merchantTitles[code] ?? label(code);
}

function merchantExplanation(code: string, fallback: string): string {
  if (code === 'MISSING_PRODUCT_INTELLIGENCE_PACK') {
    return 'Generic verified-fact generation rules will be used for this product.';
  }
  return fallback;
}

function blockerFinding(value: GenerationBlocker): GenerationEligibilityFinding {
  const fieldContext = value.fieldIds.length ? ` (${value.fieldIds.map(label).join(', ')})` : '';
  return {
    id: `blocker:${value.code}:${value.fieldIds.join(',')}`,
    kind: 'BLOCKING',
    code: value.code,
    title: `${merchantTitle(value.code)}${fieldContext}`,
    explanation: merchantExplanation(value.code, value.message),
    fieldIds: value.fieldIds,
    resolutionArea: resolutionArea(value.sourceSystem),
  };
}

function reviewFinding(value: GenerationReviewRequirement): GenerationEligibilityFinding {
  return {
    id: `review:${value.id}`,
    kind: value.blocking ? 'BLOCKING' : 'WARNING',
    code: value.type,
    title: merchantTitle(value.type),
    explanation: merchantExplanation(value.type, value.reason),
    fieldIds: value.fieldIds,
    resolutionArea: value.relatedProfileSection ? 'MERCHANT_PROFILE' : 'PRODUCT_TRUTH',
  };
}

function warningFinding(value: GenerationWarning): GenerationEligibilityFinding {
  return {
    id: `warning:${value.code}:${value.fieldIds.join(',')}`,
    kind: 'WARNING',
    code: value.code,
    title: merchantTitle(value.code),
    explanation: merchantExplanation(value.code, value.message),
    fieldIds: value.fieldIds,
    resolutionArea: resolutionArea(value.sourceSystem),
  };
}

export function canonicalGenerationEligibility(
  plan: ListingGenerationPlan,
): CanonicalGenerationEligibility {
  const blockingReviews = plan.reviewRequirements.filter(({ blocking }) => blocking);
  const nonBlockingReviews = plan.reviewRequirements.filter(({ blocking }) => !blocking);
  return Object.freeze({
    canGenerate: plan.generationEligibility.allowed,
    status: plan.generationStatus,
    blockingFindings: Object.freeze([
      ...plan.blockers.map(blockerFinding),
      ...blockingReviews.map(reviewFinding),
    ]),
    warnings: Object.freeze([
      ...plan.warnings.map(warningFinding),
      ...nonBlockingReviews.map(reviewFinding),
    ]),
    informationalFindings: Object.freeze([]),
  });
}
