import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher, SequenceIdGenerator } from '../deterministic/services.ts';
import { contextFixture, issueFixture, recommendationFixture } from '../testing/fixtures.ts';
import {
  NoopRecommendationStrategy,
  RecommendationEngine,
  RecommendationStrategyRegistry,
  type RecommendationStrategy,
} from './engine.ts';

function strategy(
  id: string,
  recommendations: ReturnType<typeof recommendationFixture>[],
  priority = 100,
): RecommendationStrategy {
  return {
    id,
    version: '1.0.0',
    priority,
    enabled: true,
    recommend: () => recommendations,
  };
}

function setup(...strategies: RecommendationStrategy[]) {
  const registry = new RecommendationStrategyRegistry();
  for (const item of strategies) registry.register(item);
  return {
    registry,
    engine: new RecommendationEngine(
      registry,
      new SequenceIdGenerator(),
      new DeterministicHasher(),
    ),
  };
}

test('one issue can produce one recommendation', async () => {
  const { engine } = setup(strategy('strategy', [recommendationFixture()]));
  const recommendations = await engine.generate([issueFixture()], contextFixture());
  assert.equal(recommendations.length, 1);
  assert.deepEqual(recommendations[0].issueIds, ['issue-1']);
});

test('one issue can produce multiple distinct recommendations', async () => {
  const { engine } = setup(strategy('strategy', [
    recommendationFixture({ id: 'recommendation-1', title: 'First', actionType: 'REVIEW' }),
    recommendationFixture({ id: 'recommendation-2', title: 'Second', actionType: 'VERIFY' }),
  ]));
  const recommendations = await engine.generate([issueFixture()], contextFixture());
  assert.equal(recommendations.length, 2);
});

test('multiple issues can produce one consolidated recommendation', async () => {
  const issues = [issueFixture(), issueFixture({ id: 'issue-2', affectedFields: ['description'] })];
  const { engine } = setup(strategy('strategy', [
    recommendationFixture({ issueIds: ['issue-1', 'issue-2'] }),
  ]));
  const recommendations = await engine.generate(issues, contextFixture());
  assert.deepEqual(recommendations[0].issueIds, ['issue-1', 'issue-2']);
});

test('a neutral strategy can produce no recommendations', async () => {
  const { engine } = setup(new NoopRecommendationStrategy());
  assert.deepEqual(await engine.generate([issueFixture()], contextFixture()), []);
});

test('strategy registration and execution order are deterministic', () => {
  const { registry } = setup(
    strategy('later', [], 20),
    strategy('b-first', [], 10),
    strategy('a-first', [], 10),
  );
  assert.deepEqual(registry.ordered().map(({ id }) => id), ['a-first', 'b-first', 'later']);
});

test('equivalent recommendations are deduplicated and retain issue traceability', async () => {
  const issues = [issueFixture(), issueFixture({ id: 'issue-2', affectedFields: ['description'] })];
  const { engine } = setup(
    strategy('first', [recommendationFixture({ issueIds: ['issue-1'] })]),
    strategy('second', [recommendationFixture({
      id: 'recommendation-2',
      issueIds: ['issue-2'],
    })]),
  );
  const recommendations = await engine.generate(issues, contextFixture());
  assert.equal(recommendations.length, 1);
  assert.deepEqual(recommendations[0].issueIds, ['issue-1', 'issue-2']);
  assert.deepEqual(recommendations[0].metadata.originatingStrategyIds, ['first', 'second']);
});

test('invalid recommendation references are rejected', async () => {
  const { engine } = setup(strategy('strategy', [
    recommendationFixture({ issueIds: ['unknown'] }),
  ]));
  await assert.rejects(
    () => engine.generate([issueFixture()], contextFixture()),
    /unknown issue/,
  );
});

test('recommendation strategy duplicates and enable state are controlled', async () => {
  const { registry, engine } = setup(strategy('strategy', [recommendationFixture()]));
  assert.throws(
    () => registry.register(strategy('strategy', [])),
    /already registered/,
  );
  registry.disable('strategy');
  assert.deepEqual(await engine.generate([issueFixture()], contextFixture()), []);
  registry.enable('strategy');
  assert.equal((await engine.generate([issueFixture()], contextFixture())).length, 1);
});
