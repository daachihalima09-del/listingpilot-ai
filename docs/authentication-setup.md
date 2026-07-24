# Authentication foundation setup

Sprint 1.1 adds the PostgreSQL, Prisma, and Auth.js foundation. It intentionally does not add login, registration, credentials, OAuth, email, invitation, or password-recovery flows.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL 15 or newer
- A PostgreSQL database and user with permission to create tables, indexes, enums, and foreign keys

## Environment

Copy `.env.example` to `.env.local` and set:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
AUTH_SECRET=replace-with-a-cryptographically-random-value-of-at-least-32-characters
AUTH_URL=http://localhost:3000
NODE_ENV=development
OPENAI_API_KEY=replace-with-your-openai-api-key
```

`AUTH_URL` is optional when Auth.js can infer the deployment host, including standard Vercel deployments. Keep it set for local development and deployments whose public URL cannot be inferred.

Generate an Auth.js secret locally with:

```powershell
npx.cmd auth secret
```

Do not commit `.env`, `.env.local`, database credentials, Auth.js secrets, or API keys.

## Install and generate

```powershell
npm.cmd install
npm.cmd run db:generate
```

Prisma reads `.env.local` first and falls back to `.env`.

## Apply migrations

For a local development database:

```powershell
npm.cmd run db:migrate
```

For staging and production:

```powershell
npx.cmd prisma migrate deploy
```

The initial authentication migration is `20260724000000_auth_foundation`.

## Validate the foundation

```powershell
npm.cmd run db:format
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The Auth.js route is available at `/api/auth/[...nextauth]`.

## Route policy

The current public routes remain accessible:

- `/about`
- `/landing`
- `/sign-in`
- `/sign-up`
- `/api/auth/*`

The application home, product analysis API, catalog, workspace, and other application routes require a valid database-backed session and redirect unauthenticated requests to `/sign-in`.

## Merchant authentication experience

Sprint 1.2 adds merchant registration and email/password authentication:

- `/sign-up` creates a user, organization, owner membership, default workspace, and `user.registered` audit event in one transaction.
- Passwords are normalized and validated on the server, then hashed with Argon2id.
- `/sign-in` uses the Auth.js Credentials provider to verify a generic email/password credential exchange.
- The credential exchange creates a Prisma-backed database session. Subsequent session reads and sign-out use the primary Auth.js database strategy.
- `/sign-in` and `/sign-up` redirect authenticated merchants to the application home.
- Protected paths redirect unauthenticated requests to `/sign-in` with a validated internal callback path.
- Sign-out deletes the database session and records an `auth.logout` audit event when audit persistence is available.

Registration and login rate limiting must be added before production launch. Email verification and password reset remain deferred until a transactional email provider is configured.
