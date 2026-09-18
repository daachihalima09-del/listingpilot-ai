import 'server-only';

import { Prisma, type PrismaClient } from '@prisma/client';
import type { AiUsageRepository, RateLimitRepository, ReservationDecision } from './service.ts';

type DatabaseClient = Pick<PrismaClient, '$transaction'>;

type ExistingOperation = {
  id: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  providerStartedAt: Date | null;
  leaseExpiresAt: Date;
};

type CountRow = { count: bigint };
type OldestRateEvent = { createdAt: Date };

function isSerializableConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2034');
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class PrismaAiUsageRepository implements AiUsageRepository, RateLimitRepository {
  constructor(private readonly database: DatabaseClient) {}

  async reserve(input: Parameters<AiUsageRepository['reserve']>[0]): Promise<ReservationDecision> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'ai-usage:' + input.workspaceId}))`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ai_usage_operations"
        SET "status" = 'EXPIRED', "active_key" = NULL, "completed_at" = ${input.now},
            "error_code" = 'AI_OPERATION_LEASE_EXPIRED', "updated_at" = ${input.now}
        WHERE "workspace_id" = ${input.workspaceId}::uuid
          AND "status" = 'RUNNING' AND "lease_expires_at" <= ${input.now}
      `);

      const existing = (await tx.$queryRaw<ExistingOperation[]>(Prisma.sql`
        SELECT "id", "status", "provider_started_at" AS "providerStartedAt", "lease_expires_at" AS "leaseExpiresAt"
        FROM "ai_usage_operations"
        WHERE "workspace_id" = ${input.workspaceId}::uuid AND "request_key" = ${input.requestKey}
        LIMIT 1
      `))[0];
      if (existing?.status === 'RUNNING') return { kind: 'ALREADY_RUNNING' };
      if (existing?.status === 'SUCCEEDED') return { kind: 'ALREADY_COMPLETED' };
      if (existing?.providerStartedAt) return { kind: 'ALREADY_COMPLETED' };
      const activeConflict = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ai_usage_operations"
        WHERE "active_key" = ${input.activeKey} AND "status" = 'RUNNING'
        LIMIT 1
      `);
      if (activeConflict.length > 0) return { kind: 'ALREADY_RUNNING' };

      const [daily, monthly, concurrent] = await Promise.all([
        tx.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count" FROM "ai_usage_operations"
          WHERE "workspace_id" = ${input.workspaceId}::uuid AND "created_at" >= ${startOfUtcDay(input.now)}
            AND ("provider_started_at" IS NOT NULL OR "status" = 'RUNNING')
        `),
        tx.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count" FROM "ai_usage_operations"
          WHERE "workspace_id" = ${input.workspaceId}::uuid AND "created_at" >= ${startOfUtcMonth(input.now)}
            AND ("provider_started_at" IS NOT NULL OR "status" = 'RUNNING')
        `),
        tx.$queryRaw<CountRow[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count" FROM "ai_usage_operations"
          WHERE "workspace_id" = ${input.workspaceId}::uuid AND "status" = 'RUNNING'
        `),
      ]);
      const existingAlreadyConsumed = Boolean(existing?.providerStartedAt);
      if (!existingAlreadyConsumed && Number(daily[0]?.count ?? 0) >= input.limits.daily) return { kind: 'DAILY_LIMIT' };
      if (!existingAlreadyConsumed && Number(monthly[0]?.count ?? 0) >= input.limits.monthly) return { kind: 'MONTHLY_LIMIT' };
      if (Number(concurrent[0]?.count ?? 0) >= input.limits.concurrent) return { kind: 'CONCURRENCY_LIMIT' };

      if (existing) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ai_usage_operations"
          SET "status" = 'RUNNING', "active_key" = ${input.activeKey},
              "attempt_count" = "attempt_count" + 1, "lease_expires_at" = ${input.leaseExpiresAt},
              "started_at" = ${input.now}, "completed_at" = NULL, "error_code" = NULL, "updated_at" = ${input.now}
          WHERE "id" = ${existing.id}::uuid
        `);
        return { kind: 'RESERVED', operationId: existing.id };
      }

      const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "ai_usage_operations" (
          "id", "workspace_id", "user_id", "project_id", "product_id", "operation_type",
          "request_key", "active_key", "status", "lease_expires_at", "started_at", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(), ${input.workspaceId}::uuid, ${input.userId}::uuid,
          ${input.projectId}::uuid, ${input.productId}::uuid, ${input.operationType}::"AiUsageOperationType",
          ${input.requestKey}, ${input.activeKey}, 'RUNNING', ${input.leaseExpiresAt}, ${input.now}, ${input.now}, ${input.now}
        ) RETURNING "id"
      `);
      return { kind: 'RESERVED', operationId: created[0].id };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 20_000 });
      } catch (error) {
        if (!isSerializableConflict(error) || attempt === 3) throw error;
      }
    }
    throw new Error('AI usage reservation retry limit reached.');
  }

  async markProviderStarted(operationId: string, now: Date): Promise<void> {
    await this.database.$transaction((tx) => tx.$executeRaw(Prisma.sql`
      UPDATE "ai_usage_operations" SET "provider_started_at" = COALESCE("provider_started_at", ${now}), "updated_at" = ${now}
      WHERE "id" = ${operationId}::uuid AND "status" = 'RUNNING'
    `));
  }

  async succeed(operationId: string, providerRequestId: string | null, now: Date): Promise<void> {
    await this.finalize(operationId, 'SUCCEEDED', null, providerRequestId, now);
  }

  async fail(operationId: string, errorCode: string, providerRequestId: string | null, now: Date): Promise<void> {
    await this.finalize(operationId, 'FAILED', errorCode.slice(0, 100), providerRequestId, now);
  }

  private async finalize(operationId: string, status: 'SUCCEEDED' | 'FAILED', errorCode: string | null, providerRequestId: string | null, now: Date): Promise<void> {
    await this.database.$transaction((tx) => tx.$executeRaw(Prisma.sql`
      UPDATE "ai_usage_operations"
      SET "status" = ${status}::"AiUsageOperationStatus", "active_key" = NULL,
          "provider_request_id" = COALESCE(${providerRequestId}, "provider_request_id"),
          "error_code" = ${errorCode}, "completed_at" = ${now}, "updated_at" = ${now}
      WHERE "id" = ${operationId}::uuid AND "status" = 'RUNNING'
    `));
  }

  async consume(input: Parameters<RateLimitRepository['consume']>[0]): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.database.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'rate:' + input.action + ':' + input.subjectHash}))`);
      const events = await tx.$queryRaw<OldestRateEvent[]>(Prisma.sql`
        SELECT "created_at" AS "createdAt" FROM "ai_rate_limit_events"
        WHERE "action" = ${input.action} AND "subject_hash" = ${input.subjectHash}
          AND "created_at" >= ${input.windowStartedAt}
        ORDER BY "created_at" ASC
      `);
      if (events.length >= input.maximum) {
        const retryAt = events[0].createdAt.getTime() + (input.now.getTime() - input.windowStartedAt.getTime());
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - input.now.getTime()) / 1_000)) };
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ai_rate_limit_events" ("id", "workspace_id", "subject_hash", "action", "created_at")
        VALUES (gen_random_uuid(), ${input.workspaceId}::uuid, ${input.subjectHash}, ${input.action}, ${input.now})
      `);
      return { allowed: true, retryAfterSeconds: 0 };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 10_000 });
      } catch (error) {
        if (!isSerializableConflict(error) || attempt === 3) throw error;
      }
    }
    throw new Error('Rate-limit transaction retry limit reached.');
  }
}
