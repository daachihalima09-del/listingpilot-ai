import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('analysis authorizes Product identity, rate limits remote work, and reserves usage before provider invocation', async () => {
  const route = await read('app/api/analyze/route.ts');
  assert.ok(route.indexOf('getCurrentUser()') < route.indexOf('readRequestBody(request)'));
  assert.ok(route.indexOf('getUserProduct(user.id') < route.indexOf('extractProductPage('));
  assert.ok(route.indexOf("action: 'PRODUCT_ANALYSIS'") < route.indexOf('extractProductPage('));
  assert.ok(route.indexOf("operationType: 'PRODUCT_ANALYSIS'") < route.indexOf('createStructuredResponse({'));
  assert.ok(route.indexOf('runReservedAiOperation({') < route.indexOf('createStructuredResponse({'));
  assert.match(route, /productIdentity: productIdentitySchema/u);
});

test('generation and regeneration reserve before their provider and finalize after persistence', async () => {
  const service = await read('modules/listing-draft/persistence/project-draft-service.server.ts');
  const generation = service.indexOf("operationType: 'LISTING_GENERATION'");
  const regeneration = service.indexOf("operationType: 'SECTION_REGENERATION'");
  assert.ok(generation > 0 && generation < service.indexOf('createOpenAiGenerationProvider', generation));
  assert.ok(regeneration > generation && regeneration < service.indexOf('createOpenAiRegenerationProvider', regeneration));
  assert.match(service.slice(generation, regeneration), /runReservedAiOperation/u);
  assert.match(service.slice(regeneration), /runReservedAiOperation/u);
});

test('Postgres repositories use transactional advisory locks and store no prompts or provider bodies', async () => {
  const repository = await read('modules/ai-usage/prisma-repository.server.ts');
  const schema = await read('../prisma/schema.prisma');
  assert.match(repository, /pg_advisory_xact_lock/u);
  assert.match(repository, /TransactionIsolationLevel\.Serializable/u);
  assert.match(schema, /@@unique\(\[workspaceId, requestKey\]\)/u);
  assert.doesNotMatch(schema.slice(schema.indexOf('model AiUsageOperation'), schema.indexOf('model ListingGoldFixture')), /prompt|responseBody|sourceHtml|generatedListing/iu);
});

test('usage migration is additive and preserves ledger history when Products are deleted', async () => {
  const migration = await read('../prisma/migrations/20260829120000_durable_ai_usage_protection/migration.sql');
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM/iu);
  assert.match(migration, /CREATE TABLE "ai_usage_operations"/u);
  assert.match(migration, /CREATE TABLE "ai_rate_limit_events"/u);
  assert.match(migration, /ON DELETE SET NULL/u);
});

test('credentials and remote image imports use the distributed rate limiter without logging passwords', async () => {
  const credentials = await read('modules/auth/server/credentials-auth.ts');
  const images = await read('app/api/projects/[projectId]/products/[productId]/images/sources/route.ts');
  assert.match(credentials, /action: 'SIGN_IN'/u);
  assert.doesNotMatch(credentials, /subject:.*password/u);
  assert.match(images, /action: 'REMOTE_IMAGE_IMPORT'/u);
});

test('Shopify, image detection, and metafield workflows do not reserve AI allowance', async () => {
  const files = await Promise.all([
    read('modules/shopify/safe-publishing/safe-publishing-service.server.ts'),
    read('modules/shopify/bulk-publishing/bulk-publishing-service.server.ts'),
    read('modules/product-images/source-image-detection.ts'),
    read('modules/shopify/metafields/metafield-recommendations.ts'),
  ]);
  assert.doesNotMatch(files.join('\n'), /getAiUsageService|AiUsageOperation/u);
});
