import 'server-only';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  authSessionCookieName,
  shouldUseSecureAuthCookies,
} from '@/modules/auth/server/session-config';

interface CreateDatabaseSessionOptions {
  recordLogin?: boolean;
}

export async function createDatabaseSession(
  userId: string,
  options: CreateDatabaseSessionOptions = {},
) {
  const sessionToken = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1_000);

  await prisma.$transaction(
    async (transaction) => {
      if (options.recordLogin) {
        await transaction.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date() },
        });
      }

      await transaction.session.create({
        data: {
          sessionToken,
          userId,
          expires,
        },
      });

      if (options.recordLogin) {
        await transaction.auditLog.create({
          data: {
            userId,
            action: 'auth.login.succeeded',
            entityType: 'User',
            entityId: userId,
          },
        });
      }
    },
    {
      maxWait: 30_000,
      timeout: 15_000,
    },
  );

  return { sessionToken, expires };
}

export async function setDatabaseSessionCookie(
  session: Awaited<ReturnType<typeof createDatabaseSession>>,
) {
  const cookieStore = await cookies();
  cookieStore.set(authSessionCookieName(), session.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: shouldUseSecureAuthCookies(),
    expires: session.expires,
  });
}
