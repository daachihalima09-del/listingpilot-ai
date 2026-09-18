import 'server-only';

import { prisma } from '@/lib/prisma';
import { rateLimitPolicy, readAiUsageConfiguration, type RateLimitAction } from './config.ts';
import { secureKey } from './domain.ts';
import { PrismaAiUsageRepository } from './prisma-repository.server.ts';
import { AiUsageService, DurableRateLimiter } from './service.ts';

let usageService: AiUsageService | null = null;
let rateLimiter: DurableRateLimiter | null = null;

export function getAiUsageService(): AiUsageService {
  usageService ??= new AiUsageService(new PrismaAiUsageRepository(prisma), readAiUsageConfiguration());
  return usageService;
}

export async function enforceRateLimit(input: {
  readonly action: RateLimitAction;
  readonly subject: unknown;
  readonly workspaceId?: string | null;
}): Promise<void> {
  rateLimiter ??= new DurableRateLimiter(new PrismaAiUsageRepository(prisma));
  const policy = rateLimitPolicy(input.action);
  await rateLimiter.enforce({
    action: input.action,
    subjectHash: secureKey(input.subject),
    workspaceId: input.workspaceId,
    ...policy,
  });
}
