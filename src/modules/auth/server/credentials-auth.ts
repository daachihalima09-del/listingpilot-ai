import 'server-only';

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { env } from '@/lib/env';
import { credentialUserRepository } from '@/modules/auth/repositories/credential-user-repository';
import { authenticateCredentials } from '@/modules/auth/services/credentials';
import {
  getDummyPasswordHash,
  verifyPassword,
} from '@/modules/auth/services/password';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  shouldUseSecureAuthCookies,
} from '@/modules/auth/server/session-config';
import { createDatabaseSession } from '@/modules/auth/server/session';
import { signInSchema } from '@/modules/auth/validators/credentials';

const DATABASE_SESSION_TOKEN_CLAIM = 'databaseSessionToken';

const credentialsAuthConfig = {
  secret: env.AUTH_SECRET,
  useSecureCookies: shouldUseSecureAuthCookies(),
  session: {
    // Auth.js v5 requires JWT mode during the Credentials callback. The custom
    // encoder writes the new database token into the standard session cookie;
    // the primary Auth.js configuration reads it with the database strategy.
    strategy: 'jwt',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: {
          label: 'Email address',
          type: 'email',
        },
        password: {
          label: 'Password',
          type: 'password',
        },
      },
      async authorize(credentials) {
        const result = signInSchema.safeParse({
          email: credentials.email,
          password: credentials.password,
        });
        if (!result.success) {
          return null;
        }

        return authenticateCredentials(
          credentialUserRepository,
          result.data,
          verifyPassword,
          await getDummyPasswordHash(),
        );
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (trigger !== 'signIn' || !user?.id) {
        return token;
      }

      const session = await createDatabaseSession(user.id, { recordLogin: true });
      return {
        ...token,
        [DATABASE_SESSION_TOKEN_CLAIM]: session.sessionToken,
      };
    },
  },
  jwt: {
    async encode({ token }) {
      const sessionToken = token?.[DATABASE_SESSION_TOKEN_CLAIM];
      if (typeof sessionToken !== 'string') {
        throw new Error('Database session token was not created.');
      }
      return sessionToken;
    },
    async decode() {
      // Credential exchange responses are consumed by the database-session
      // configuration, so this JWT-only compatibility path never reads tokens.
      return null;
    },
  },
} satisfies NextAuthConfig;

export const { signIn: signInWithCredentials } = NextAuth(credentialsAuthConfig);
