const publicPageRoutes = new Set([
  '/about',
  '/landing',
  '/sign-in',
  '/sign-up',
]);

const authenticationPageRoutes = new Set([
  '/sign-in',
  '/sign-up',
]);

export type RouteAccessDecision =
  | { type: 'allow' }
  | { type: 'redirect-to-authenticated-home' }
  | { type: 'redirect-to-sign-in' };

export function isAuthenticationPage(pathname: string): boolean {
  return authenticationPageRoutes.has(pathname);
}

export function isPublicRoute(pathname: string): boolean {
  return publicPageRoutes.has(pathname)
    || pathname === '/api/auth'
    || pathname.startsWith('/api/auth/');
}

export function getRouteAccessDecision(
  pathname: string,
  isAuthenticated: boolean,
): RouteAccessDecision {
  if (isAuthenticationPage(pathname) && isAuthenticated) {
    return { type: 'redirect-to-authenticated-home' };
  }
  if (isPublicRoute(pathname) || isAuthenticated) {
    return { type: 'allow' };
  }
  return { type: 'redirect-to-sign-in' };
}
