import type { Session } from 'next-auth';
import type {
  getCurrentSession,
  getCurrentUser,
  requireAuthenticatedUser,
} from '@/modules/auth/server/context';
import type { AuthenticatedUser } from '@/modules/auth/types/auth';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Assert<Value extends true> = Value;

export type GetCurrentSessionContract = Assert<
  Equal<Awaited<ReturnType<typeof getCurrentSession>>, Session | null>
>;

export type GetCurrentUserContract = Assert<
  Equal<Awaited<ReturnType<typeof getCurrentUser>>, AuthenticatedUser | null>
>;

export type RequireAuthenticatedUserContract = Assert<
  Equal<Awaited<ReturnType<typeof requireAuthenticatedUser>>, AuthenticatedUser>
>;
