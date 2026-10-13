import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { ListingDraftError } from '../domain/errors.ts';
import { safeFactualValidationDiagnostic } from '../domain/factual-validation-diagnostic.ts';
import { createListingGenerationTrace, readGenerationTrace } from '../persistence/generation-trace.server.ts';

test('development generation traces retain factual diagnostics without generated content', async () => {
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
  assert.equal((stored?.failure?.validation as { reason?: string }).reason, 'CITATION_NOT_REPRESENTED');
  assert.equal((stored?.failure?.validation as { generatedText?: string }).generatedText, undefined);
  assert.doesNotMatch(JSON.stringify(stored?.failure), /Verified value|x{500}|citedFactIds/u);
  assert.equal(stored?.stages.response?.status, 'PASSED');
});

test('production factual diagnostics retain safe rule and field metadata under the same reference', async () => {
  const events: unknown[][] = [];
  const reference = randomUUID();
  const privateContent = 'PRIVATE_CONTENT_CANARY';
  const trace = createListingGenerationTrace({ requestId: reference, projectId: randomUUID(), production: true,
    logger: { error: (...values) => events.push(values), info: (...values) => events.push(values) },
  });
  trace.context({ product: { brand: privateContent, model: privateContent, type: privateContent } });
  trace.start('factual_validation');
  trace.fail(new ListingDraftError('DRAFT_INVENTED_VALUE', privateContent, 422, {
    reason: 'UNSUPPORTED_FACTUAL_TOKEN', outputField: 'features.2',
    factFieldIds: ['model', 'screen_size'], comparisonOutcome: privateContent,
    generatedText: privateContent, productTruthValues: [privateContent],
    unsupportedTokens: [privateContent], citedFactIds: [privateContent],
    prompt: privateContent, apiKey: privateContent, token: privateContent,
    url: 'https://private.example/customer', customer: privateContent,
  }));
  // The route finishes a response and flushes again; the original failed stage survives.
  trace.start('response'); trace.complete('response', { status: 422 });
  await trace.flush(); await trace.flush();
  assert.equal(events.length, 1);
  const summary = events[0]![1] as { correlationRequestId: string; failedStage: string; failure: { validation: unknown } };
  assert.equal(summary.correlationRequestId, reference);
  assert.equal(summary.failedStage, 'factual_validation');
  assert.deepEqual(summary.failure.validation, {
    reason: 'UNSUPPORTED_FACTUAL_TOKEN', outputField: 'features.2',
    factFieldIds: ['model', 'screen_size'], comparisonOutcome: 'UNSUPPORTED_TOKEN_FOUND',
  });
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_CONTENT_CANARY|private\.example|generatedText|productTruthValues|unsupportedTokens|citedFactIds|apiKey|prompt|token|customer/u);
});

test('diagnostic identifiers are allowlisted, bounded and cannot smuggle arbitrary content', () => {
  const diagnostic = safeFactualValidationDiagnostic({
    reason: 'SECRET_REASON_CANARY', outputField: 'https://private.example/customer',
    fieldId: 'SECRET_FIELD_CANARY', comparisonOutcome: 'SECRET_OUTCOME_CANARY',
  });
  assert.deepEqual(diagnostic, { reason: 'UNCLASSIFIED_FACTUAL_FAILURE', outputField: 'UNKNOWN_OUTPUT_FIELD',
    factFieldIds: ['OTHER_FACT_FIELD'], comparisonOutcome: 'UNKNOWN_COMPARISON' });
  const bounded = safeFactualValidationDiagnostic({ reason: 'MISSING_FACT_REFERENCES', outputField: 'features.1000',
    factFieldIds: ['model', ...Array.from({ length: 100 }, (_, i) => `PRIVATE_${i}`)],
  });
  assert.equal(bounded.outputField, 'UNKNOWN_OUTPUT_FIELD');
  assert.deepEqual(bounded.factFieldIds, ['model', 'OTHER_FACT_FIELD']);
  assert.doesNotMatch(JSON.stringify([diagnostic, bounded]), /SECRET_|PRIVATE_|private\.example/u);
});

test('merchant factual-failure responses retain the existing message and HTTP 422 without exposing diagnostics', async () => {
  // Execute the actual route mapper with inert imports to avoid server-only
  // application composition or any database/network access in this unit test.
  const source = readFileSync(new URL('../persistence/route-helpers.server.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  class OtherError extends Error {}
  const merchantMessage = 'Listing quality check failed. A generated product detail did not match the verified product information.';
  for (const environment of ['production', 'development']) {
    const logs: unknown[][] = [];
    const exported: { listingDraftRouteErrorResponse?: (error: unknown) => Response } = {};
    runInNewContext(compiled, {
      exports: exported, process: { env: { NODE_ENV: environment } },
      console: { error: (...args: unknown[]) => logs.push(args) },
      require: (name: string) => {
        if (name === 'server-only') return {};
        if (name === 'next/server') return { NextResponse: Response };
        if (name.endsWith('/domain/errors.ts')) return { ListingDraftError };
        if (name.endsWith('/domain/factual-validation-diagnostic.ts')) return { safeFactualValidationDiagnostic };
        return { AiProtectionError: OtherError, ZodError: OtherError, JsonRequestBodyError: OtherError,
          MerchantPreferenceError: OtherError, OpenAiResponsesError: OtherError, ProjectError: OtherError };
      },
    });
    const response = exported.listingDraftRouteErrorResponse!(new ListingDraftError('DRAFT_INVENTED_VALUE', 'PRIVATE_RESPONSE_CANARY', 422, {
      reason: 'MISSING_FACT_REFERENCES', outputField: 'seo.title', generatedText: 'PRIVATE_LOG_CANARY',
    }));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: { code: 'DRAFT_INVENTED_VALUE', message: merchantMessage } });
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_RESPONSE_CANARY|PRIVATE_LOG_CANARY|generatedText/u);
  }
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
