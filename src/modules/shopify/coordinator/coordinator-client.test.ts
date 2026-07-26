import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoordinatorClient } from './coordinator-client.ts';

test('duplicate browser submissions coalesce without resource or step injection', async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const client = createCoordinatorClient(async (_url, init) => {
    calls += 1;
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, undefined);
    await gate;
    return Response.json({ coordinator: {
      overallStatus: 'COMPLETED', executionStartedAt: null,
      executionCompletedAt: null, canPublish: true, canRetry: false,
      canRefresh: false, isRunning: false, hasPendingWork: false,
      safeSummary: 'Done', steps: [],
    } });
  });
  const first = client.run('project', 'publish');
  const second = client.run('project', 'publish');
  assert.equal(first, second);
  release();
  await first;
  assert.equal(calls, 1);
});
