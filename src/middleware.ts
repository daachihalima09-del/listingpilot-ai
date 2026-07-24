export { auth as default } from '@/modules/auth/server/auth';

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
