import 'server-only';

import type { Session } from 'next-auth';
import { auth } from '@/modules/auth/server/auth';
import type { AuthenticatedUser } from '@/modules/auth/types/auth';
import { UnauthenticatedError } from '@/modules/auth/types/errors';

export async function getCurrentSession(): Promise<Session | null> {
  return auth();
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthenticatedError();
  }

  return user;
}
