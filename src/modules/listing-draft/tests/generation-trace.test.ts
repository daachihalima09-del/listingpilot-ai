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
