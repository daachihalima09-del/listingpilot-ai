export const settingsErrorCodes = {
  forbidden: 'SETTINGS_FORBIDDEN',
  notFound: 'SETTINGS_NOT_FOUND',
  duplicateOrganizationSlug: 'SETTINGS_DUPLICATE_ORGANIZATION_SLUG',
} as const;

export type SettingsErrorCode =
  (typeof settingsErrorCodes)[keyof typeof settingsErrorCodes];

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;
  readonly statusCode: 403 | 404 | 409;

  constructor(
    code: SettingsErrorCode,
    message: string,
    statusCode: 403 | 404 | 409,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SettingsError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class SettingsForbiddenError extends SettingsError {
  constructor() {
    super(
      settingsErrorCodes.forbidden,
      'Only an organization owner may perform this action.',
      403,
    );
    this.name = 'SettingsForbiddenError';
  }
}

export class SettingsNotFoundError extends SettingsError {
  constructor(message = 'The requested settings resource was not found.') {
    super(settingsErrorCodes.notFound, message, 404);
    this.name = 'SettingsNotFoundError';
  }
}

export class DuplicateOrganizationSlugError extends SettingsError {
  constructor(options?: ErrorOptions) {
    super(
      settingsErrorCodes.duplicateOrganizationSlug,
      'That organization slug is already in use.',
      409,
      options,
    );
    this.name = 'DuplicateOrganizationSlugError';
  }
}
