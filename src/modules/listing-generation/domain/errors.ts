export type ListingGenerationErrorCode = 'INVALID_GENERATION_INPUT' | 'INVALID_PRODUCT_TRUTH' | 'INVALID_MERCHANT_PROFILE' | 'INVALID_PRODUCT_INTELLIGENCE_REFERENCE' | 'UNSUPPORTED_PLAN_VERSION' | 'DUPLICATE_FACT_ID' | 'UNKNOWN_FACT_REFERENCE' | 'INVALID_FIELD_PLAN' | 'INVALID_REVIEW_REQUIREMENT' | 'LOCK_CONFLICT' | 'IMPOSSIBLE_POLICY_COMBINATION' | 'PLAN_COMPOSITION_FAILED';
export class ListingGenerationError extends Error {
  readonly code: ListingGenerationErrorCode;
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(
    code: ListingGenerationErrorCode,
    message: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ListingGenerationError';
    this.code = code;
    this.metadata = metadata;
  }
}
