export type MerchantPreferenceErrorCode =
  | 'PROFILE_NOT_FOUND'
  | 'SECTION_NOT_FOUND'
  | 'UNSUPPORTED_SECTION'
  | 'UNSUPPORTED_SECTION_VERSION'
  | 'INVALID_PREFERENCE_PAYLOAD'
  | 'INCOMPLETE_REQUIRED_SECTION'
  | 'PREFERENCE_CONCURRENCY_CONFLICT'
  | 'WORKSPACE_FORBIDDEN'
  | 'CORRUPTED_PREFERENCE_SECTION'
  | 'INVALID_COMPLETION_TRANSITION';

export class MerchantPreferenceError extends Error {
  readonly code: MerchantPreferenceErrorCode;
  readonly statusCode: 400 | 401 | 403 | 404 | 409 | 500;

  constructor(
    code: MerchantPreferenceErrorCode,
    statusCode: 400 | 401 | 403 | 404 | 409 | 500,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MerchantPreferenceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class MerchantPreferenceConcurrencyError
  extends MerchantPreferenceError {
  constructor() {
    super(
      'PREFERENCE_CONCURRENCY_CONFLICT',
      409,
      'These merchant preferences were updated elsewhere. Reload before saving again.',
    );
    this.name = 'MerchantPreferenceConcurrencyError';
  }
}
