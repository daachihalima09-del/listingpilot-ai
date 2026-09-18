import { env } from '@/lib/env';

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function shouldUseSecureAuthCookies(): boolean {
  if (env.NODE_ENV === 'production') {
    return true;
  }

  if (env.AUTH_URL) {
    return new URL(env.AUTH_URL).protocol === 'https:';
  }
  return false;
}

export function authSessionCookieName(): string {
  return `${shouldUseSecureAuthCookies() ? '__Secure-' : ''}authjs.session-token`;
}
