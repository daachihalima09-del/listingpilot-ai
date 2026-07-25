import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { getSafeCallbackPath } from '@/modules/auth/server/redirects';
import { isProjectPageAvailableToUser } from '@/modules/projects/server/project-page-access';
import {
  getRouteAccessDecision,
} from '@/modules/auth/server/route-policy';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  shouldUseSecureAuthCookies,
} from '@/modules/auth/server/session-config';

const authConfig = {
  adapter: PrismaAdapter(prisma),
  secret: env.AUTH_SECRET,
  useSecureCookies: shouldUseSecureAuthCookies(),
  session: {
    strategy: 'database',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/sign-in',
  },
  providers: [],
  callbacks: {
    async authorized({ auth, request }) {
      const isAuthenticated = auth?.user?.status === 'ACTIVE';
      const decision = getRouteAccessDecision(
        request.nextUrl.pathname,
        isAuthenticated,
      );

      if (decision.type === 'allow') {
        const projectRoute = request.nextUrl.pathname.match(
          /^\/workspace\/([^/]+)$/,
        );
        if (isAuthenticated && projectRoute) {
          const isAvailable = await isProjectPageAvailableToUser(
            auth.user.id,
            {
              projectId: projectRoute[1],
              workspaceId: request.nextUrl.searchParams.get('workspaceId')
                ?? undefined,
            },
          );
          if (!isAvailable) {
            return new Response(null, { status: 404 });
          }
        }
        return true;
      }

      const redirectUrl = request.nextUrl.clone();
      if (decision.type === 'redirect-to-authenticated-home') {
        redirectUrl.pathname = '/';
        redirectUrl.search = '';
        return Response.redirect(redirectUrl);
      }

      const callbackPath = getSafeCallbackPath(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      redirectUrl.pathname = '/sign-in';
      redirectUrl.search = '';
      redirectUrl.searchParams.set('callbackUrl', callbackPath);
      return Response.redirect(redirectUrl);
    },
    session({ session, user }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          email: user.email,
          status: user.status,
        },
      };
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signOut } = NextAuth(authConfig);
