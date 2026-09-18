import { normalizeEmail } from '../validators/credentials.ts';

export interface EarlyAccessRegistrationEnvironment {
  NODE_ENV?: string;
  EARLY_ACCESS_ALLOWED_EMAILS?: string;
}

function allowedEmailSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function canRegisterForEarlyAccess(
  email: string,
  environment: EarlyAccessRegistrationEnvironment,
): boolean {
  if (environment.NODE_ENV !== 'production') {
    return true;
  }

  return allowedEmailSet(environment.EARLY_ACCESS_ALLOWED_EMAILS)
    .has(normalizeEmail(email));
}
