import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAiResponsesClient, OpenAiResponsesError, type StructuredResponseRequest } from '../../openai/responses-client-core.ts';
import { OpenAiGenerationProvider } from '../adapter/openai-generation-provider.ts';
import { listingDraftProviderJsonSchema } from '../validation/draft-schema.ts';
import { draftInstructions, validProviderOutput } from './fixtures.ts';

test('provider adapter sends only Generation Instructions through the centralized structured response boundary', async () => {
  const instructions = draftInstructions();
  let received: Record<string, unknown> | undefined;
  const provider = new OpenAiGenerationProvider({
    createStructuredResponse: async <T>(request: StructuredResponseRequest<T>) => {
      received = request as unknown as Record<string, unknown>;
      return { data: request.parse(validProviderOutput(instructions)), requestId: 'req_adapter' };
    },
  });
  const result = await provider.generate(instructions);
  assert.equal(result.requestId, 'req_adapter');
  assert.equal(received?.input, instructions);
  assert.deepEqual(received?.schema, listingDraftProviderJsonSchema);
  assert.equal(JSON.stringify(received).includes('shopifyProduct'), false);
});

test('Responses client uses strict JSON schema and returns the provider request ID', async () => {
  let body = '';
  const output = validProviderOutput();
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key',
    fetcher: async (_url, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), {
        status: 200,
        headers: { 'x-request-id': 'req_structured' },
      });
    },
  });
  const result = await client.createStructuredResponse({
    schemaName: 'draft', schema: listingDraftProviderJsonSchema, instructions: 'safe', input: { id: 1 }, parse: (value) => value,
  });
  const requestBody = JSON.parse(body) as { store: boolean; text: { format: { strict: boolean; type: string } } };
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(result.requestId, 'req_structured');
});

test('Responses client retries rate limits and network failures but rejects malformed JSON', async () => {
  let attempts = 0;
  const output = validProviderOutput();
  const client = new OpenAiResponsesClient({
    apiKey: 'test-key', maximumAttempts: 3, sleep: async () => undefined,
    fetcher: async () => {
      attempts += 1;
      if (attempts === 1) return new Response('{}', { status: 429 });
      if (attempts === 2) throw new TypeError('network unavailable');
      return new Response(JSON.stringify({ output_text: JSON.stringify(output) }));
    },
    logger: { warn: () => undefined, error: () => undefined },
  });
  await client.createStructuredResponse({ schemaName: 'draft', schema: {}, instructions: 'safe', input: {}, parse: (value) => value });
  assert.equal(attempts, 3);

  const malformed = new OpenAiResponsesClient({
    apiKey: 'test-key', fetcher: async () => new Response(JSON.stringify({ output_text: '{bad' })),
  });
  await assert.rejects(
    malformed.createStructuredResponse({ schemaName: 'draft', schema: {}, instructions: 'safe', input: {}, parse: (value) => value }),
    (error: unknown) => error instanceof OpenAiResponsesError && error.code === 'MALFORMED_RESPONSE',
  );
});

test('Responses client maps timeouts without exposing secret values', async () => {
  const client = new OpenAiResponsesClient({
    apiKey: 'never-print-this', timeoutMs: 5,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  });
  await assert.rejects(
    client.createStructuredResponse({ schemaName: 'draft', schema: {}, instructions: 'safe', input: {}, parse: (value) => value }),
    (error: unknown) => error instanceof OpenAiResponsesError
      && error.code === 'TIMED_OUT'
      && !error.message.includes('never-print-this'),
  );
});

test('draft engine maps provider failures to a client-safe draft error', async () => {
  const { ListingDraftEngine } = await import('../builder/draft-engine.ts');
  const { ListingDraftError } = await import('../domain/errors.ts');
  await assert.rejects(
    new ListingDraftEngine({ provider: { generate: async () => { throw new Error('provider unavailable'); } } })
      .generate(draftInstructions()),
    (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_PROVIDER_FAILED',
  );
});
