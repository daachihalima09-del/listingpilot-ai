export const AUTHENTICATED_HOME_PATH = '/';

const blockedCallbackPaths = new Set(['/sign-in', '/sign-up']);

export function getSafeCallbackPath(
  value: string | null | undefined,
  fallback = AUTHENTICATED_HOME_PATH,
): string {
  if (
    !value
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return fallback;
  }

  try {
    const baseUrl = new URL('https://listingpilot.invalid');
    const callbackUrl = new URL(value, baseUrl);
    if (callbackUrl.origin !== baseUrl.origin || blockedCallbackPaths.has(callbackUrl.pathname)) {
      return fallback;
    }

    return `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`;
  } catch {
    return fallback;
  }
}
