export type GenerationInstructionErrorCode =
  | 'INVALID_SOURCE_PLAN'
  | 'INVALID_INSTRUCTION_PACKAGE'
  | 'UNSUPPORTED_INSTRUCTION_VERSION'
  | 'MISSING_SELECTED_FACT'
  | 'FORBIDDEN_FACT_PROJECTED'
  | 'MISSING_PROHIBITED_OUTPUT'
  | 'MISSING_REVIEW_REQUIREMENT'
  | 'MISSING_MERCHANT_LOCK'
  | 'FINGERPRINT_MISMATCH';

export class GenerationInstructionError extends Error {
  readonly code: GenerationInstructionErrorCode;
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(
    code: GenerationInstructionErrorCode,
    message: string,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'GenerationInstructionError';
    this.code = code;
    this.metadata = metadata;
  }
}
