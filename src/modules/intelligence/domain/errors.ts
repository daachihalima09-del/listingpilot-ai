export type IntelligenceDomainErrorCode =
  | 'INVALID_IDENTITY'
  | 'DUPLICATE_PRODUCT_ID'
  | 'INVALID_CONFIDENCE'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_MONEY'
  | 'INVALID_EVIDENCE'
  | 'INVALID_ISSUE'
  | 'INVALID_RECOMMENDATION'
  | 'INVALID_CONTEXT'
  | 'DUPLICATE_REGISTRY_ENTRY'
  | 'MISSING_DEPENDENCY'
  | 'INVALID_DETECTOR'
  | 'DETECTOR_EXECUTION_FAILED';

export class IntelligenceDomainError extends Error {
  readonly code: IntelligenceDomainErrorCode;
  readonly details: Readonly<Record<string, string>>;

  constructor(
    code: IntelligenceDomainErrorCode,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'IntelligenceDomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class DetectorExecutionError extends Error {
  readonly code: string;
  readonly expected: boolean;

  constructor(code: string, message: string, expected = true) {
    super(message);
    this.name = 'DetectorExecutionError';
    this.code = code;
    this.expected = expected;
  }
}
