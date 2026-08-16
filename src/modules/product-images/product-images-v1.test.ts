import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { persistCandidatesIndependently } from './candidate-persistence.ts';
import { identityFromImportInput, importSourceImagesSchema } from './product-image-import-contract.ts';
import { parseProductImageImportResponse } from './product-image-client-contract.ts';

const service = readFileSync(new URL('./product-image-service.server.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../shopify/components/ShopifyImagesPanel.tsx', import.meta.url), 'utf8');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync('prisma/migrations/20260815170000_product_images_v1/migration.sql', 'utf8');
const analysisRoute = readFileSync('src/app/api/analyze/route.ts', 'utf8');
const imageService = readFileSync('src/modules/shopify/images/image-service.ts', 'utf8');
const imageOperations = readFileSync('src/modules/shopify/images/image-operations.server.ts', 'utf8');

test('source discoveries and managed configurations are Product-owned', () => {
  assert.match(schema, /model ProductSourceImage[\s\S]*productId[\s\S]*@@unique\(\[productId, workspaceId, urlHash\]\)/u);
  assert.match(schema, /shopifyImageConfiguration[\s\S]*ProductSourceImage/u);
  assert.match(migration, /FOREIGN KEY \("product_id", "project_id", "workspace_id"\) REFERENCES "products"/u);
});

test('source reads and imports enforce workspace, Project and Product identity', () => {
  assert.match(service, /id: parsed\.productId,[\s\S]*projectId: parsed\.projectId,[\s\S]*workspaceId: parsed\.workspaceId/u);
  assert.match(service, /role !== 'OWNER'/u);
  assert.match(service, /id: \{ in: input\.sourceImageIds \}, productId: product\.id, projectId: product\.projectId, workspaceId: product\.workspaceId/u);
});

test('the selected-source payload authorizes only with its exact tenant identity fields', () => {
  const input = importSourceImagesSchema.parse({
    workspaceId: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    productId: '00000000-0000-4000-8000-000000000003',
    sourceImageIds: ['00000000-0000-4000-8000-000000000004'],
  });
  assert.deepEqual(identityFromImportInput(input), {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    productId: input.productId,
  });
  assert.doesNotThrow(() => identityFromImportInput(input));
  assert.equal((service.match(/identityFromImportInput\(input\)/gu) ?? []).length, 2);
});

test('a successful import response carries the managed gallery and refreshed source state into the client', () => {
  const response = parseProductImageImportResponse({
    configuration: {
      version: 1,
      images: [{ localId: 'managed-image', status: 'CONFIGURED', isPrimary: true, position: 0 }],
      lastPublishedAt: null,
      reorderPending: false,
    },
    sources: [{ id: 'source-image', status: 'IMPORTED' }],
  });
  assert.equal(response.configuration.images[0]?.localId, 'managed-image');
  assert.equal(response.configuration.images[0]?.isPrimary, true);
  assert.equal(response.sources[0]?.status, 'IMPORTED');
  assert.throws(() => parseProductImageImportResponse({ configuration: {}, sources: [] }), /INVALID_IMPORT_RESPONSE/u);
  assert.match(panel, /setConfiguration\(imported\.configuration\)[\s\S]*setSources\(imported\.sources\)/u);
});

test('URL analysis persists detected images without changing listing generation', () => {
  assert.match(analysisRoute, /persistDetectedProductImages/u);
  assert.match(analysisRoute, /extractedPage\.sourceImages/u);
  assert.doesNotMatch(service, /getOpenAi|OpenAI|listing-draft/u);
});

test('one invalid source candidate does not discard otherwise valid detections', async () => {
  const failures: string[] = [];
  const persisted: string[] = [];
  const result = await persistCandidatesIndependently(['stale-client', 'valid-image'], async (candidate) => {
    if (candidate === 'stale-client') throw new TypeError('ProductSourceImage delegate is unavailable');
    persisted.push(candidate);
  }, ({ candidate }) => failures.push(candidate));
  assert.deepEqual(persisted, ['valid-image']);
  assert.deepEqual(failures, ['stale-client']);
  assert.equal(result.persistedCount, 1);
});

test('analysis remains successful when image persistence needs recovery', () => {
  assert.match(analysisRoute, /imageDiscoveryWarning/u);
  assert.doesNotMatch(analysisRoute, /source images could not be saved\. Please retry/u);
  assert.match(service, /stalePrismaClient/u);
  assert.match(service, /persistCandidatesIndependently/u);
});

test('existing Products can rediscover from their saved Product source URL', () => {
  assert.match(service, /rediscoverProductSourceImages/u);
  assert.match(service, /extractProductPage\(product\.sourceUrl\)/u);
  assert.match(panel, /Find images from source/u);
  assert.match(panel, /method: 'PUT'/u);
});

test('merchant selection is required and removal remains local-only', () => {
  assert.match(panel, /Images found from source/u);
  assert.match(panel, /Import selected/u);
  assert.match(panel, /Remove image from ListingPilot/u);
  assert.match(panel, /does not delete media from Shopify/u);
  assert.doesNotMatch(service, /delete.*Shopify|mediaDelete|fileDelete/iu);
});

test('source import creates and links a local managed image without a Shopify mutation', () => {
  assert.match(service, /addUserManagedRemoteImage/u);
  assert.match(service, /sourceImageId: source\.id/u);
  assert.match(service, /source\.status === 'IMPORTED' && source\.importedImageId/u);
  assert.match(imageService, /initialStatus: 'CONFIGURED'/u);
  assert.doesNotMatch(imageOperations.match(/addUserManagedRemoteImage[\s\S]*?\n\}/u)?.[0] ?? '', /configured\(\)|createShopifyFile|createStagedTarget/u);
  assert.doesNotMatch(service, /addUserRemoteShopifyImage|createShopifyFile|createStagedTarget/u);
});

test('managed previews retain source URLs server-side and remain Product-authorized', () => {
  assert.match(service, /getManagedProductImageSource/u);
  assert.match(service, /configuration:[\s\S]*product:[\s\S]*memberships: \{ some: \{ userId \} \}/u);
  assert.match(imageService, /\/api\/product-images\/managed\/\$\{image\.id\}\/preview/u);
});

test('Image Studio V2 capabilities are not introduced', () => {
  assert.doesNotMatch([service, panel].join('\n'), /background replacement|generative fill|object removal|AI upscal/iu);
});
