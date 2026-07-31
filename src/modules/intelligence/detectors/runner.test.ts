import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DetectorExecutionError } from '../domain/errors.ts';
import {
  DeterministicHasher,
  FixedIntelligenceClock,
  SequenceIdGenerator,
} from '../deterministic/services.ts';
import { contextFixture, detectorFixture, issueFixture } from '../testing/fixtures.ts';
import { DetectorRegistry } from './registry.ts';
import { DetectorRunner } from './runner.ts';
import { getPriorDetectorMetadata } from './execution-metadata.ts';

function setup(detectors = [] as ReturnType<typeof detectorFixture>[]) {
  const registry = new DetectorRegistry();
  for (const detector of detectors) registry.register(detector);
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const runner = new DetectorRunner(registry, {
    clock,
    ids: new SequenceIdGenerator(),
    hasher: new DeterministicHasher(),
  });
  return { registry, clock, runner };
}

test('runner handles an empty detector collection', async () => {
  const { runner } = setup();
  const output = await runner.run(contextFixture());
  assert.deepEqual(output.issues, []);
  assert.deepEqual(output.executions, []);
});

test('runner executes one detector and aggregates issues', async () => {
  const detector = detectorFixture({ result: { issues: [issueFixture()] } });
  const { runner } = setup([detector]);
  const output = await runner.run(contextFixture());
  assert.equal(output.issues.length, 1);
  assert.equal(output.executions[0].status, 'COMPLETED');
});

test('multiple detectors execute sequentially in deterministic order', async () => {
  const order: string[] = [];
  const detectors = [
    detectorFixture({ id: 'later', priority: 20, execute: () => {
      order.push('later');
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    } }),
    detectorFixture({ id: 'first', priority: 10, execute: () => {
      order.push('first');
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    } }),
  ];
  const { runner } = setup(detectors);
  await runner.run(contextFixture());
  assert.deepEqual(order, ['first', 'later']);
});

test('later detectors can read immutable metadata from completed detectors', async () => {
  let observed: unknown;
  const context = contextFixture();
  const before = JSON.stringify(context);
  const { runner } = setup([
    detectorFixture({
      id: 'producer',
      priority: 1,
      result: { metadata: { report: { fingerprint: 'stable' } } },
    }),
    detectorFixture({
      id: 'consumer',
      priority: 2,
      execute: (activeContext) => {
        observed = getPriorDetectorMetadata(activeContext, 'producer')?.report;
        return { issues: [], warnings: [], metrics: {}, metadata: {} };
      },
    }),
  ]);
  await runner.run(context);
  assert.deepEqual(observed, { fingerprint: 'stable' });
  assert.equal(JSON.stringify(context), before);
  assert.deepEqual(context.execution.metadata, {});
});

test('failed detector metadata is never exposed to later detectors', async () => {
  let observed: unknown = 'unset';
  const { runner } = setup([
    detectorFixture({
      id: 'producer',
      priority: 1,
      execute: () => {
        throw new Error('failure');
      },
    }),
    detectorFixture({
      id: 'consumer',
      priority: 2,
      execute: (activeContext) => {
        observed = getPriorDetectorMetadata(activeContext, 'producer');
        return { issues: [], warnings: [], metrics: {}, metadata: {} };
      },
    }),
  ]);
  await runner.run(contextFixture());
  assert.equal(observed, undefined);
});

test('detector failure is isolated when fail-fast is disabled', async () => {
  let secondRan = false;
  const { runner } = setup([
    detectorFixture({ id: 'failing', priority: 1, execute: () => {
      throw new DetectorExecutionError('EXPECTED_DATA_FAILURE', 'Expected.');
    } }),
    detectorFixture({ id: 'second', priority: 2, execute: () => {
      secondRan = true;
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    } }),
  ]);
  const output = await runner.run(contextFixture());
  assert.equal(secondRan, true);
  assert.deepEqual(output.failedDetectorIds, ['failing']);
  assert.equal(output.executions[0].reasonCode, 'EXPECTED_DATA_FAILURE');
});

test('fail-fast stops after the first detector failure', async () => {
  let secondRan = false;
  const { runner } = setup([
    detectorFixture({ id: 'failing', priority: 1, execute: () => {
      throw new Error('failure');
    } }),
    detectorFixture({ id: 'second', priority: 2, execute: () => {
      secondRan = true;
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    } }),
  ]);
  const output = await runner.run(contextFixture({
    options: { ...contextFixture().options, failFast: true },
  }));
  assert.equal(secondRan, false);
  assert.equal(output.executions.length, 1);
});

test('per-detector timeout is enforced without destroying the run', async () => {
  const { runner } = setup([
    detectorFixture({
      id: 'slow',
      metadata: { timeoutMs: 5 },
      execute: async () => new Promise((resolve) => setTimeout(() => resolve({
        issues: [],
        warnings: [],
        metrics: {},
        metadata: {},
      }), 30)),
    }),
  ]);
  const output = await runner.run(contextFixture());
  assert.equal(output.executions[0].status, 'TIMED_OUT');
  assert.deepEqual(output.failedDetectorIds, ['slow']);
});

test('global cancellation skips eligible detectors', async () => {
  const { runner } = setup([detectorFixture()]);
  const output = await runner.run(contextFixture({
    cancellation: { isCancellationRequested: true, reason: 'test' },
  }));
  assert.equal(output.executions.length, 0);
  assert.equal(output.skipped[0].reasonCode, 'CANCELLED');
});

test('global timeout skips remaining detectors deterministically', async () => {
  const { clock, runner } = setup([
    detectorFixture({ id: 'first', priority: 1, execute: () => {
      clock.advance(101);
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    } }),
    detectorFixture({ id: 'second', priority: 2 }),
  ]);
  const base = contextFixture();
  const output = await runner.run(contextFixture({
    options: { ...base.options, detectorTimeoutMs: 100, globalTimeoutMs: 100 },
  }));
  assert.equal(output.executions.length, 1);
  assert.equal(output.skipped[0].detectorId, 'second');
  assert.equal(output.skipped[0].reasonCode, 'GLOBAL_TIMEOUT');
});

test('disabled, unsupported-scope, and missing-capability detectors are reported as skipped', async () => {
  const disabled = detectorFixture({ id: 'disabled' });
  const unsupported = detectorFixture({
    id: 'unsupported',
    metadata: { supportedScopes: ['SINGLE_PRODUCT'] },
  });
  const missingCapability = detectorFixture({
    id: 'missing-capability',
    metadata: { requiredCapabilities: ['missing'] },
  });
  const { registry, runner } = setup([disabled, unsupported, missingCapability]);
  registry.disable('disabled');
  const output = await runner.run(contextFixture());
  assert.deepEqual(
    output.skipped.map(({ reasonCode }) => reasonCode).sort(),
    ['DISABLED', 'MISSING_CAPABILITY', 'UNSUPPORTED_SCOPE'],
  );
});

test('runner preserves detector metrics and warning collection', async () => {
  const { clock, runner } = setup([
    detectorFixture({ execute: () => {
      clock.advance(12);
      return {
        issues: [],
        warnings: ['Fixture warning'],
        metrics: { inspectedProducts: 3 },
        metadata: { fixture: true },
      };
    } }),
  ]);
  const output = await runner.run(contextFixture());
  assert.deepEqual(output.warnings, ['Fixture warning']);
  assert.equal(output.executions[0].durationMs, 12);
  assert.equal(output.executions[0].metrics.inspectedProducts, 3);
});
