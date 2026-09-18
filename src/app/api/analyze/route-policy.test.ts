import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('analysis authenticates before configuration, request parsing, URL extraction, and provider work', async () => {
  const source = await readFile(new URL('./route.ts', import.meta.url), 'utf8');
  const routeStart = source.indexOf('export async function POST');
  const authentication = source.indexOf('await getCurrentUser()', routeStart);

  assert.ok(routeStart >= 0);
  assert.ok(authentication > routeStart);
  assert.ok(authentication < source.indexOf('process.env.OPENAI_API_KEY', routeStart));
  assert.ok(authentication < source.indexOf('readRequestBody(request)', routeStart));
  assert.ok(authentication < source.indexOf('extractProductPage(', routeStart));
  assert.ok(authentication < source.indexOf('createStructuredResponse(', routeStart));
});

test('analysis provider failures include bounded correlation diagnostics', async () => {
  const source = await readFile(new URL('./route.ts', import.meta.url), 'utf8');

  assert.match(source, /const correlationRequestId = crypto\.randomUUID\(\)/);
  assert.match(source, /providerRequestId/);
  assert.match(source, /requestId: correlationRequestId/);
  assert.equal(source.includes("console.error('Unable to complete product analysis', {\n      analysisInput"), false);
});
