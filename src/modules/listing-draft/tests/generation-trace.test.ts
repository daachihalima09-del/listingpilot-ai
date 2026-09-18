import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ListingDraftError } from '../domain/errors.ts';
import { createListingGenerationTrace, readGenerationTrace } from '../persistence/generation-trace.server.ts';

test('development generation traces persist bounded validator diagnostics and are queryable after completion', async () => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  const trace = createListingGenerationTrace({ requestId, projectId: randomUUID() });
  trace.context({ workspaceId: randomUUID(), projectVersion: 3, product: { brand: 'Example Brand', model: 'Model 100', type: 'Air treatment' }, instructionFingerprint: 'fingerprint' });
  trace.start('factual_validation');
  trace.fail(new ListingDraftError('DRAFT_INVENTED_VALUE', 'A generated product detail did not match verified information.', 422, { outputField: 'title', generatedText: 'x'.repeat(700), citedFactIds: ['fact-1'], productTruthValues: ['Verified value'], factRoles: ['REQUIRED_VISIBLE'], reason: 'CITATION_NOT_REPRESENTED' }));
  trace.start('response'); trace.complete('response', { status: 422 });
  await trace.flush();
  const stored = await readGenerationTrace(requestId);
  assert.equal(stored?.correlationRequestId, requestId);
  assert.equal(stored?.stages.factual_validation?.status, 'FAILED');
  assert.equal(stored?.failure?.errorCode, 'DRAFT_INVENTED_VALUE');
  assert.equal((stored?.failure?.validation as { outputField?: string }).outputField, 'title');
  assert.equal(((stored?.failure?.validation as { generatedText?: string }).generatedText ?? '').length, 500);
  assert.equal(stored?.stages.response?.status, 'PASSED');
});

test('production generation traces emit one correlation-safe summary without product content', async () => {
  const events: unknown[][] = [];
  const requestId = '22222222-2222-4222-8222-222222222222';
  const trace = createListingGenerationTrace({
    requestId,
    projectId: randomUUID(),
    production: true,
    logger: {
      error: (...values: unknown[]) => events.push(values),
      info: (...values: unknown[]) => events.push(values),
    },
  });
  trace.context({
    workspaceId: randomUUID(),
    projectVersion: 4,
    product: { brand: 'Private Merchant Brand', model: 'Secret Model', type: 'Private Type' },
    instructionFingerprint: 'safe-fingerprint',
  });
  trace.start('provider_request');
  trace.fail(new ListingDraftError('DRAFT_PROVIDER_FAILED', 'Private generated content', 502, {
    outputField: 'title', generatedText: 'Do not log this value',
  }));
  await trace.flush();
  await trace.flush();
  assert.equal(events.length, 1);
  const serialized = JSON.stringify(events[0]);
  assert.match(serialized, new RegExp(requestId));
  assert.match(serialized, /provider_request/u);
  assert.match(serialized, /DRAFT_PROVIDER_FAILED/u);
  assert.doesNotMatch(serialized, /Private Merchant Brand|Secret Model|Private Type|Private generated content|Do not log this value/u);
});
