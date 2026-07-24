import type { UserStatus } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      status: UserStatus;
    } & DefaultSession['user'];
  }

  interface User {
    status: UserStatus;
  }
}

declare module '@auth/core/adapters' {
  interface AdapterUser {
    status: UserStatus;
  }
}
