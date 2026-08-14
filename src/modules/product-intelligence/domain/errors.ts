export type ProductIntelligenceErrorCode =
  | 'DUPLICATE_PACK_ID'
  | 'DUPLICATE_CATEGORY'
  | 'INVALID_PACK_ID'
  | 'INVALID_PACK_VERSION'
  | 'INVALID_PACK'
  | 'UNKNOWN_PACK'
  | 'UNSUPPORTED_CATEGORY'
  | 'INVALID_FIELD'
  | 'DUPLICATE_FIELD'
  | 'DUPLICATE_ALIAS'
  | 'INVALID_DETECTION_RULE'
  | 'INVALID_VALIDATION_RULE'
  | 'UNKNOWN_FIELD_REFERENCE'
  | 'INVALID_PRIORITY'
  | 'INVALID_METAFIELD_MAPPING'
  | 'INVALID_SAFETY_GUIDANCE'
  | 'DETECTOR_CONFIGURATION_ERROR'
  | 'AMBIGUOUS_CATEGORY';

export class ProductIntelligenceError extends Error {
  readonly code: ProductIntelligenceErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ProductIntelligenceErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'ProductIntelligenceError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
