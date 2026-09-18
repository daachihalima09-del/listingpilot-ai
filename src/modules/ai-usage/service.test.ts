import assert from 'node:assert/strict';
import test from 'node:test';
import { limitsForWorkspace, readAiUsageConfiguration, type AiUsageConfiguration, type AiWorkspaceLimits } from './config.ts';
import { AiProtectionError, secureKey } from './domain.ts';
import type { AiOperationReservationInput, AiUsageRepository, ReservationDecision } from './service.ts';
import { AiUsageService, runReservedAiOperation } from './service.ts';

type RecordState = AiOperationReservationInput & {
  id: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  providerStartedAt: Date | null; leaseExpiresAt: Date; createdAt: Date; errorCode: string | null;
};

class MemoryUsageRepository implements AiUsageRepository {
  readonly records = new Map<string, RecordState>();
  private serial = 0;

  async reserve(input: AiOperationReservationInput & { now: Date; leaseExpiresAt: Date; limits: AiWorkspaceLimits }): Promise<ReservationDecision> {
    for (const record of this.records.values()) {
      if (record.workspaceId === input.workspaceId && record.status === 'RUNNING' && record.leaseExpiresAt <= input.now) {
        record.status = 'EXPIRED'; record.errorCode = 'AI_OPERATION_LEASE_EXPIRED';
      }
    }
    const key = `${input.workspaceId}:${input.requestKey}`;
    const existing = this.records.get(key);
    if (existing?.status === 'RUNNING') return { kind: 'ALREADY_RUNNING' };
    if (existing?.status === 'SUCCEEDED') return { kind: 'ALREADY_COMPLETED' };
    if (existing?.providerStartedAt) return { kind: 'ALREADY_COMPLETED' };
    const consumed = [...this.records.values()].filter((record) => record.workspaceId === input.workspaceId
      && (record.providerStartedAt || record.status === 'RUNNING'));
    const alreadyConsumed = Boolean(existing?.providerStartedAt);
    const dayStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate());
    const monthStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1);
    if (!alreadyConsumed && consumed.filter((record) => record.createdAt.getTime() >= dayStart).length >= input.limits.daily) return { kind: 'DAILY_LIMIT' };
    if (!alreadyConsumed && consumed.filter((record) => record.createdAt.getTime() >= monthStart).length >= input.limits.monthly) return { kind: 'MONTHLY_LIMIT' };
    if (consumed.filter((record) => record.status === 'RUNNING').length >= input.limits.concurrent) return { kind: 'CONCURRENCY_LIMIT' };
    if ([...this.records.values()].some((record) => record.status === 'RUNNING' && record.activeKey === input.activeKey)) return { kind: 'ALREADY_RUNNING' };
    const record: RecordState = existing ?? {
      ...input, id: `operation-${++this.serial}`, status: 'RUNNING', providerStartedAt: null,
      leaseExpiresAt: input.leaseExpiresAt, createdAt: input.now, errorCode: null,
    };
    Object.assign(record, input, { status: 'RUNNING', leaseExpiresAt: input.leaseExpiresAt, errorCode: null });
    this.records.set(key, record);
    return { kind: 'RESERVED', operationId: record.id };
  }

  async markProviderStarted(id: string, now: Date) { this.byId(id).providerStartedAt ??= now; }
  async succeed(id: string) { this.byId(id).status = 'SUCCEEDED'; }
  async fail(id: string, errorCode: string) { const record = this.byId(id); record.status = 'FAILED'; record.errorCode = errorCode; }
  private byId(id: string) { return [...this.records.values()].find((record) => record.id === id)!; }
}

const baseConfiguration: AiUsageConfiguration = {
  enabled: true, defaults: { daily: 5, monthly: 20, concurrent: 2 }, overrides: {}, leaseSeconds: 300,
};
const baseInput: AiOperationReservationInput = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  projectId: '30000000-0000-4000-8000-000000000001',
  productId: '40000000-0000-4000-8000-000000000001',
  operationType: 'PRODUCT_ANALYSIS', requestKey: secureKey('request-1'), activeKey: secureKey('product-1'),
};

function expectCode(error: unknown, code: string) {
  return error instanceof AiProtectionError && error.code === code;
}

test('successful and provider-failed operations consume durable usage while pre-provider failures do not', async () => {
  const repository = new MemoryUsageRepository();
  const service = new AiUsageService(repository, baseConfiguration, () => new Date('2026-08-29T12:00:00Z'));
  const success = await service.reserve(baseInput); await success.markProviderStarted(); await success.succeed('provider-1');
  const providerFailure = await service.reserve({ ...baseInput, requestKey: secureKey('request-2') });
  await providerFailure.markProviderStarted(); await providerFailure.fail('REQUEST_FAILED');
  const preProvider = await service.reserve({ ...baseInput, requestKey: secureKey('request-3') });
  await preProvider.fail('VALIDATION_FAILED');
  const records = [...repository.records.values()];
  assert.equal(records.filter((record) => record.providerStartedAt).length, 2);
  assert.equal(records.find((record) => record.requestKey === secureKey('request-3'))?.providerStartedAt, null);
});

test('reserved integration orders provider work before persistence finalization and records failure safely', async () => {
  const events: string[] = [];
  const lease = {
    operationId: 'operation',
    markProviderStarted: async () => { events.push('provider-started'); },
    succeed: async () => { events.push('usage-succeeded'); },
    fail: async () => { events.push('usage-failed'); },
  };
  const value = await runReservedAiOperation({
    lease,
    execute: async () => {
      events.push('provider-called');
      events.push('result-persisted');
      return { value: 'saved', providerRequestId: 'provider-1' };
    },
  });
  assert.equal(value, 'saved');
  assert.deepEqual(events, ['provider-started', 'provider-called', 'result-persisted', 'usage-succeeded']);
  await assert.rejects(runReservedAiOperation({
    lease: { ...lease, markProviderStarted: async () => { events.push('second-provider-started'); } },
    execute: async () => { throw Object.assign(new Error('failed'), { code: 'PROVIDER_FAILED' }); },
  }));
  assert.equal(events.at(-1), 'usage-failed');
});

test('parallel duplicate reservations call the provider at most once and completed duplicates stay deduplicated', async () => {
  const repository = new MemoryUsageRepository();
  const service = new AiUsageService(repository, baseConfiguration);
  const results = await Promise.allSettled([service.reserve(baseInput), service.reserve(baseInput)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && expectCode(result.reason, 'AI_OPERATION_ALREADY_RUNNING')).length, 1);
  const fulfilled = results.find((result) => result.status === 'fulfilled');
  assert.ok(fulfilled?.status === 'fulfilled');
  await fulfilled.value.markProviderStarted(); await fulfilled.value.succeed(null);
  await assert.rejects(service.reserve(baseInput), (error) => expectCode(error, 'AI_OPERATION_ALREADY_COMPLETED'));
});

test('a provider-started failure cannot be replayed for free but an explicit new request is separately accounted', async () => {
  const repository = new MemoryUsageRepository();
  const service = new AiUsageService(repository, baseConfiguration);
  const failed = await service.reserve(baseInput); await failed.markProviderStarted(); await failed.fail('REQUEST_FAILED');
  await assert.rejects(service.reserve(baseInput), (error) => expectCode(error, 'AI_OPERATION_ALREADY_COMPLETED'));
  const explicitRetry = await service.reserve({ ...baseInput, requestKey: secureKey('explicit-retry') });
  assert.notEqual(explicitRetry.operationId, failed.operationId);
});

test('daily and monthly limits are atomic, workspace scoped, and reset at UTC boundaries', async () => {
  let now = new Date('2026-08-29T23:50:00Z');
  const repository = new MemoryUsageRepository();
  const configuration = { ...baseConfiguration, defaults: { daily: 1, monthly: 1, concurrent: 2 } };
  const service = new AiUsageService(repository, configuration, () => now);
  const first = await service.reserve(baseInput); await first.markProviderStarted(); await first.succeed(null);
  await assert.rejects(service.reserve({ ...baseInput, requestKey: secureKey('daily-2') }), (error) => expectCode(error, 'DAILY_AI_LIMIT_REACHED'));
  const otherWorkspace = await service.reserve({ ...baseInput, workspaceId: '10000000-0000-4000-8000-000000000002', requestKey: secureKey('other'), activeKey: secureKey('other-product') });
  await otherWorkspace.fail('PRE_PROVIDER');
  now = new Date('2026-09-01T00:01:00Z');
  const nextMonth = await service.reserve({ ...baseInput, requestKey: secureKey('next-month'), activeKey: secureKey('next-month-product') });
  await nextMonth.fail('PRE_PROVIDER');
});

test('workspace concurrency permits independent Products only within the configured cap', async () => {
  const repository = new MemoryUsageRepository();
  const service = new AiUsageService(repository, { ...baseConfiguration, defaults: { daily: 10, monthly: 10, concurrent: 2 } });
  await service.reserve(baseInput);
  await service.reserve({ ...baseInput, productId: '40000000-0000-4000-8000-000000000002', requestKey: secureKey('product-2'), activeKey: secureKey('product-2') });
  await assert.rejects(service.reserve({ ...baseInput, productId: '40000000-0000-4000-8000-000000000003', requestKey: secureKey('product-3'), activeKey: secureKey('product-3') }), (error) => expectCode(error, 'AI_CONCURRENCY_LIMIT_REACHED'));
});

test('stale leases expire without deletion and allow a safe retry of the same operation', async () => {
  let now = new Date('2026-08-29T12:00:00Z');
  const repository = new MemoryUsageRepository();
  const service = new AiUsageService(repository, baseConfiguration, () => now);
  await service.reserve(baseInput);
  now = new Date('2026-08-29T12:06:00Z');
  const recovered = await service.reserve(baseInput);
  assert.equal(recovered.operationId, [...repository.records.values()][0].id);
});

test('server-known hashes isolate Product and workspace identities without storing raw input', () => {
  assert.notEqual(secureKey({ workspace: 'A', product: '1', version: 1 }), secureKey({ workspace: 'A', product: '2', version: 1 }));
  assert.notEqual(secureKey({ workspace: 'A', product: '1', version: 1 }), secureKey({ workspace: 'B', product: '1', version: 1 }));
  assert.equal(secureKey({ b: 2, a: 1 }), secureKey({ a: 1, b: 2 }));
});

test('configuration is protected by default and accepts bounded founder workspace overrides', () => {
  const configuration = readAiUsageConfiguration({
    AI_USAGE_DAILY_LIMIT: '25', AI_USAGE_MONTHLY_LIMIT: '300', AI_USAGE_MAX_CONCURRENT: '2',
    AI_USAGE_WORKSPACE_OVERRIDES: JSON.stringify({ [baseInput.workspaceId]: { daily: 40 } }),
  });
  assert.equal(configuration.enabled, true);
  assert.deepEqual(limitsForWorkspace(configuration, baseInput.workspaceId), { daily: 40, monthly: 300, concurrent: 2 });
  assert.throws(() => readAiUsageConfiguration({ AI_USAGE_DAILY_LIMIT: '0' }));
  assert.throws(() => readAiUsageConfiguration({ AI_USAGE_WORKSPACE_OVERRIDES: '{invalid' }));
});
