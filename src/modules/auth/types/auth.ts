import type { Session } from 'next-auth';

export type AuthenticatedUser = Session['user'];
