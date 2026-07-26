import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CoordinatorProjectContext,
  CoordinatorRepository,
  StoredCoordinatorExecution,
} from './coordinator-repository.ts';
import { buildCoordinatorDto, runCoordinator } from './coordinator-service.ts';
import {
  emptyCounts,
  SHOPIFY_PUBLICATION_STEPS,
  type CoordinatorStep,
  type NormalizedStepResult,
} from './coordinator-types.ts';
import type { CoordinatorStepAdapter } from './step-adapters.ts';

const project = (
  overrides: Partial<CoordinatorProjectContext> = {},
): CoordinatorProjectContext => ({
  actorUserId: 'user', organizationId: 'org', workspaceId: 'workspace',
  projectId: 'project', role: 'OWNER', archived: false,
  shopifyStoreId: 'store', connected: true,
  productInput: { title: 'Product' },
  applicability: {
    productReady: true, hasVariantConfiguration: true,
    hasEnabledMappedMetafields: true, hasActiveImages: true,
    freshness: {
      PRODUCT: 'p1', VARIANTS: 'v1', METAFIELDS: 'm1', IMAGES: 'i1',
    },
  },
  ...overrides,
});

function execution(): StoredCoordinatorExecution {
  return {
    id: 'execution', status: 'RUNNING', triggerType: 'MANUAL_FULL',
    executionNumber: 1, startedAt: new Date(), completedAt: null,
    lastHeartbeatAt: new Date(),
    steps: SHOPIFY_PUBLICATION_STEPS.map((step) => ({
      step, status: 'NOT_STARTED', attemptNumber: 0, startedAt: null,
      completedAt: null, retryable: false, blocking: false,
      safeErrorCategory: null, safeMessage: null, resultSummary: null,
      freshnessKey: null,
    })),
  };
}

function setup(results: Partial<Record<CoordinatorStep, NormalizedStepResult>>) {
  const events: string[] = [];
  const repository: CoordinatorRepository = {
    async resolveProject() { return project(); },
    async latest() { return null; },
    async acquire() {
      return { execution: execution(), coalesced: false, staleRecovered: false };
    },
    async beginStep(_id, step) { events.push(`begin:${step}`); return 1; },
    async finishStep(_id, result) {
      events.push(`finish:${result.step}:${result.status}`);
    },
    async completeExecution(_id, status) { events.push(`complete:${status}`); },
    async audit(input) { events.push(`audit:${input.action}`); },
  };
  const adapters: CoordinatorStepAdapter[] = SHOPIFY_PUBLICATION_STEPS.map((step) => ({
    step,
    async execute() {
      events.push(`execute:${step}`);
      return results[step] ?? {
        step, status: 'SUCCEEDED', startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(), attemptNumber: 1,
        counts: emptyCounts(), safeMessage: 'Done', safeErrorCategory: null,
        retryable: false, blocking: false, applicable: true,
        freshnessKey: `${step}:1`,
      };
    },
  }));
  return { repository, adapters, events };
}

test('pipeline persists deterministic product-first order', async () => {
  const mock = setup({});
  const result = await runCoordinator(mock, project(), 'MANUAL_FULL');
  assert.equal(result.overallStatus, 'COMPLETED');
  assert.deepEqual(
    mock.events.filter((event) => event.startsWith('execute:')),
    SHOPIFY_PUBLICATION_STEPS.map((step) => `execute:${step}`),
  );
  for (const step of SHOPIFY_PUBLICATION_STEPS) {
    assert.ok(
      mock.events.indexOf(`begin:${step}`)
      < mock.events.findIndex((value) => value.startsWith(`finish:${step}:`)),
    );
  }
});

test('product failure blocks all dependents', async () => {
  const mock = setup({
    PRODUCT: {
      step: 'PRODUCT', status: 'FAILED', startedAt: null, completedAt: null,
      attemptNumber: 1, counts: { ...emptyCounts(), failed: 1 },
      safeMessage: 'Failed', safeErrorCategory: 'linkage', retryable: true,
      blocking: true, applicable: true, freshnessKey: 'p1',
    },
  });
  const result = await runCoordinator(mock, project(), 'MANUAL_FULL');
  assert.equal(result.overallStatus, 'FAILED');
  assert.deepEqual(mock.events.filter((value) => value.startsWith('execute:')), [
    'execute:PRODUCT',
  ]);
  assert.equal(result.steps.slice(1).every(({ status }) => status === 'BLOCKED'), true);
});

test('non-blocking variant/metafield partial results permit images', async () => {
  const partial = (step: CoordinatorStep): NormalizedStepResult => ({
    step, status: 'PARTIAL', startedAt: null, completedAt: null,
    attemptNumber: 1, counts: { ...emptyCounts(), failed: 1 },
    safeMessage: 'Partial', safeErrorCategory: 'conflict', retryable: true,
    blocking: false, applicable: true, freshnessKey: `${step}:1`,
  });
  const mock = setup({
    VARIANTS: partial('VARIANTS'),
    METAFIELDS: partial('METAFIELDS'),
  });
  const result = await runCoordinator(mock, project(), 'MANUAL_FULL');
  assert.equal(result.overallStatus, 'PARTIAL');
  assert.equal(mock.events.includes('execute:IMAGES'), true);
});

test('DTO restores read-only, ready and pending states safely', () => {
  assert.equal(buildCoordinatorDto(project({ role: 'VIEWER' }), null).canPublish, false);
  const pending = execution();
  pending.status = 'PENDING';
  pending.steps[3].status = 'PENDING';
  pending.steps[3].retryable = true;
  const dto = buildCoordinatorDto(project(), pending);
  assert.equal(dto.canRefresh, true);
  assert.equal(dto.hasPendingWork, true);
});

test('fresh active execution coalesces server-side', async () => {
  const mock = setup({});
  mock.repository.acquire = async () => ({
    execution: execution(), coalesced: true, staleRecovered: false,
  });
  const result = await runCoordinator(mock, project(), 'MANUAL_FULL');
  assert.equal(result.isRunning, true);
  assert.equal(mock.events.length, 0);
});
