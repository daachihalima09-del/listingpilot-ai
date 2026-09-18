import type { AiUsageConfiguration, AiWorkspaceLimits } from './config.ts';
import { limitsForWorkspace } from './config.ts';
import { AiProtectionError, safeAiErrorCode, type AiOperationType } from './domain.ts';

export interface AiOperationReservationInput {
  readonly workspaceId: string;
  readonly userId: string;
  readonly projectId: string | null;
  readonly productId: string | null;
  readonly operationType: AiOperationType;
  readonly requestKey: string;
  readonly activeKey: string;
}

export type ReservationDecision =
  | { readonly kind: 'RESERVED'; readonly operationId: string }
  | { readonly kind: 'ALREADY_RUNNING' }
  | { readonly kind: 'ALREADY_COMPLETED' }
  | { readonly kind: 'DAILY_LIMIT' }
  | { readonly kind: 'MONTHLY_LIMIT' }
  | { readonly kind: 'CONCURRENCY_LIMIT' };

export interface AiUsageRepository {
  reserve(input: AiOperationReservationInput & {
    readonly now: Date;
    readonly leaseExpiresAt: Date;
    readonly limits: AiWorkspaceLimits;
  }): Promise<ReservationDecision>;
  markProviderStarted(operationId: string, now: Date): Promise<void>;
  succeed(operationId: string, providerRequestId: string | null, now: Date): Promise<void>;
  fail(operationId: string, errorCode: string, providerRequestId: string | null, now: Date): Promise<void>;
}

export interface AiOperationLease {
  readonly operationId: string;
  markProviderStarted(): Promise<void>;
  succeed(providerRequestId: string | null): Promise<void>;
  fail(errorCode: string, providerRequestId?: string | null): Promise<void>;
}

export async function runReservedAiOperation<T>(input: {
  readonly lease: AiOperationLease;
  readonly execute: () => Promise<{ readonly value: T; readonly providerRequestId: string | null }>;
  readonly providerRequestIdFromError?: (error: unknown) => string | null;
}): Promise<T> {
  await input.lease.markProviderStarted();
  let completed: { readonly value: T; readonly providerRequestId: string | null };
  try {
    completed = await input.execute();
  } catch (error) {
    await input.lease.fail(safeAiErrorCode(error), input.providerRequestIdFromError?.(error) ?? null);
    throw error;
  }
  await input.lease.succeed(completed.providerRequestId);
  return completed.value;
}

export class AiUsageService {
  private readonly repository: AiUsageRepository;
  private readonly configuration: AiUsageConfiguration;
  private readonly clock: () => Date;

  constructor(
    repository: AiUsageRepository,
    configuration: AiUsageConfiguration,
    clock: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.configuration = configuration;
    this.clock = clock;
  }

  async reserve(input: AiOperationReservationInput): Promise<AiOperationLease> {
    const now = this.clock();
    const leaseExpiresAt = new Date(now.getTime() + this.configuration.leaseSeconds * 1_000);
    const limits = this.configuration.enabled
      ? limitsForWorkspace(this.configuration, input.workspaceId)
      : { daily: Number.MAX_SAFE_INTEGER, monthly: Number.MAX_SAFE_INTEGER, concurrent: Number.MAX_SAFE_INTEGER };
    const decision = await this.repository.reserve({ ...input, now, leaseExpiresAt, limits });
    if (decision.kind === 'ALREADY_RUNNING') throw new AiProtectionError('AI_OPERATION_ALREADY_RUNNING');
    if (decision.kind === 'ALREADY_COMPLETED') throw new AiProtectionError('AI_OPERATION_ALREADY_COMPLETED');
    if (decision.kind === 'DAILY_LIMIT') throw new AiProtectionError('DAILY_AI_LIMIT_REACHED');
    if (decision.kind === 'MONTHLY_LIMIT') throw new AiProtectionError('MONTHLY_AI_LIMIT_REACHED');
    if (decision.kind === 'CONCURRENCY_LIMIT') throw new AiProtectionError('AI_CONCURRENCY_LIMIT_REACHED');

    let finalized = false;
    return {
      operationId: decision.operationId,
      markProviderStarted: () => this.repository.markProviderStarted(decision.operationId, this.clock()),
      succeed: async (providerRequestId) => {
        if (finalized) return;
        finalized = true;
        await this.repository.succeed(decision.operationId, providerRequestId, this.clock());
      },
      fail: async (errorCode, providerRequestId = null) => {
        if (finalized) return;
        finalized = true;
        await this.repository.fail(decision.operationId, errorCode, providerRequestId, this.clock());
      },
    };
  }
}

export interface RateLimitRepository {
  consume(input: {
    readonly action: string;
    readonly subjectHash: string;
    readonly workspaceId: string | null;
    readonly maximum: number;
    readonly windowStartedAt: Date;
    readonly now: Date;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number }>;
}

export class DurableRateLimiter {
  private readonly repository: RateLimitRepository;
  private readonly clock: () => Date;

  constructor(repository: RateLimitRepository, clock: () => Date = () => new Date()) {
    this.repository = repository;
    this.clock = clock;
  }

  async enforce(input: {
    readonly action: string;
    readonly subjectHash: string;
    readonly workspaceId?: string | null;
    readonly maximum: number;
    readonly windowSeconds: number;
  }): Promise<void> {
    const now = this.clock();
    const result = await this.repository.consume({
      ...input,
      workspaceId: input.workspaceId ?? null,
      now,
      windowStartedAt: new Date(now.getTime() - input.windowSeconds * 1_000),
    });
    if (!result.allowed) throw new AiProtectionError('REQUEST_RATE_LIMITED', result.retryAfterSeconds);
  }
}
