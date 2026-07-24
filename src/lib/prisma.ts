import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '@/lib/env';

const globalForPrisma = globalThis as typeof globalThis & {
  listingPilotPrisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.listingPilotPrisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.listingPilotPrisma = prisma;
}
