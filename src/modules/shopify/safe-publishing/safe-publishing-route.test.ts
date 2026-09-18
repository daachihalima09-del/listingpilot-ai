import assert from 'node:assert/strict';
import test from 'node:test';
import { createUnexpectedPublishingFailure } from './safe-publishing-route-core.ts';

test('unexpected publishing failures return a correlation reference without exposing the error message', async () => {
  const reference = 'safe-reference-id';
  const failure = createUnexpectedPublishingFailure(
    new Error('secret provider response'),
    () => reference,
  );

  assert.equal(failure.reference, reference);
  assert.equal(failure.body.error.code, 'SHOPIFY_PUBLISHING_UNAVAILABLE');
  assert.match(failure.body.error.message, new RegExp(reference, 'u'));
  assert.doesNotMatch(JSON.stringify(failure), /secret provider response/u);
  assert.match(JSON.stringify(failure.log), new RegExp(reference, 'u'));
});
