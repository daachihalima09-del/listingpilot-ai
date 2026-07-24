export const authenticationErrorCodes = {
  unauthenticated: 'AUTH_UNAUTHENTICATED',
  forbidden: 'AUTH_FORBIDDEN',
  invalidInput: 'AUTH_INVALID_INPUT',
  duplicateEmail: 'AUTH_DUPLICATE_EMAIL',
  auditLogWriteFailed: 'AUTH_AUDIT_LOG_WRITE_FAILED',
} as const;

export type AuthenticationErrorCode =
  (typeof authenticationErrorCodes)[keyof typeof authenticationErrorCodes];

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode;
  readonly statusCode: 400 | 401 | 403 | 500;

  constructor(
    code: AuthenticationErrorCode,
    message: string,
    statusCode: 400 | 401 | 403 | 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class UnauthenticatedError extends AuthenticationError {
  constructor() {
    super(
      authenticationErrorCodes.unauthenticated,
      'Authentication is required.',
      401,
    );
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AuthenticationError {
  constructor() {
    super(
      authenticationErrorCodes.forbidden,
      'You do not have permission to perform this action.',
      403,
    );
    this.name = 'ForbiddenError';
  }
}

export class InvalidAuthenticationInputError extends AuthenticationError {
  constructor() {
    super(
      authenticationErrorCodes.invalidInput,
      'The authentication input is invalid.',
      400,
    );
    this.name = 'InvalidAuthenticationInputError';
  }
}

export class DuplicateEmailRegistrationError extends AuthenticationError {
  constructor(options?: ErrorOptions) {
    super(
      authenticationErrorCodes.duplicateEmail,
      'An account with this email address already exists.',
      400,
      options,
    );
    this.name = 'DuplicateEmailRegistrationError';
  }
}

export class AuditLogWriteError extends AuthenticationError {
  constructor(options?: ErrorOptions) {
    super(
      authenticationErrorCodes.auditLogWriteFailed,
      'The audit event could not be recorded.',
      500,
      options,
    );
    this.name = 'AuditLogWriteError';
  }
}
