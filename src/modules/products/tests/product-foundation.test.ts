import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createProductSchema,
  productIdentitySchema,
  saveProductStateSchema,
} from '../validators/product.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const productA = '33333333-3333-4333-8333-333333333333';
const productB = '44444444-4444-4444-8444-444444444444';

test('a project accepts multiple stable product identities', () => {
  const first = createProductSchema.parse({ workspaceId, projectId, name: 'Dyson TP09' });
  const second = createProductSchema.parse({ workspaceId, projectId, name: 'Dyson BP04' });
  assert.equal(first.projectId, second.projectId);
  assert.notEqual(productA, productB);
});

test('Product creation accepts inherited defaults and later Product overrides', () => {
  const inherited = createProductSchema.parse({ workspaceId, projectId, name: 'Dyson TP09' });
  const overridden = createProductSchema.parse({ workspaceId, projectId, name: 'Dyson BP04', productType: 'Air purifier', collection: 'Indoor air' });
  assert.equal(inherited.productType, null);
  assert.equal(inherited.collection, null);
  assert.equal(overridden.productType, 'Air purifier');
  assert.equal(overridden.collection, 'Indoor air');

  const service = readFileSync('src/modules/products/services/product-service.server.ts', 'utf8');
  assert.match(service, /productType: parsed\.productType \?\? project\.defaultProductType/u);
  assert.match(service, /collection: parsed\.collection \?\? project\.defaultCollection/u);
  assert.match(service, /parsed\.productType !== undefined/u);
});

test('Project creation stores only the Project and never auto-creates a Product', () => {
  const repository = readFileSync('src/modules/projects/repositories/prisma-project-repository.ts', 'utf8');
  const creation = repository.slice(repository.indexOf('async createProject'), repository.indexOf('async renameProject'));
  assert.match(creation, /this\.transaction\.project\.create/u);
  assert.doesNotMatch(creation, /products\s*:/u);
  assert.doesNotMatch(creation, /product\.create/u);
});

test('simple employee workflow migration is additive and keeps existing data intact', () => {
  const migration = readFileSync('prisma/migrations/20260816120000_simple_employee_workflow_foundation/migration.sql', 'utf8');
  assert.match(migration, /ALTER TABLE "projects"\s+ADD COLUMN/u);
  assert.match(migration, /ALTER TABLE "products"\s+ADD COLUMN/u);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE|ALTER COLUMN/u);
});

test('product identity always carries workspace, project, and product ids', () => {
  assert.deepEqual(productIdentitySchema.parse({ workspaceId, projectId, productId: productA }), {
    workspaceId,
    projectId,
    productId: productA,
  });
  assert.throws(() => productIdentitySchema.parse({ workspaceId, productId: productA }));
});

test('independent state payloads cannot silently substitute product identity', () => {
  const base = {
    workspaceId,
    projectId,
    version: 1,
    sourceType: 'RAW_SPECIFICATIONS' as const,
    sourceUrl: null,
    rawInput: null,
    analysisData: null,
    generatedListing: null,
    seoData: null,
    readinessData: null,
  };
  const a = saveProductStateSchema.parse({ ...base, productId: productA, rawInput: 'Product A' });
  const b = saveProductStateSchema.parse({ ...base, productId: productB, rawInput: 'Product B' });
  assert.equal(a.productId, productA);
  assert.equal(b.productId, productB);
  assert.equal(a.rawInput, 'Product A');
  assert.equal(b.rawInput, 'Product B');
});

test('backfill preserves existing product data and Shopify ownership', () => {
  const migration = readFileSync(
    'prisma/migrations/20260814090000_multi_product_foundation/migration.sql',
    'utf8',
  );
  assert.match(migration, /INSERT INTO "products"/u);
  assert.match(migration, /"analysis_data", "generated_listing"/u);
  assert.match(migration, /"seo_data", "readiness_data"/u);
  assert.match(migration, /UPDATE "shopify_product_import_links" SET "product_id" = "project_id"/u);
  assert.match(migration, /UPDATE "shopify_publishing_plans" SET "product_id" = "project_id"/u);
  assert.match(migration, /UPDATE "shopify_publication_executions" SET "product_id" = "project_id"/u);
});

test('product summary query does not select large JSON payloads', () => {
  const source = readFileSync('src/modules/products/services/product-service.server.ts', 'utf8');
  const summaryQuery = source.slice(source.indexOf('SELECT\n        p."id"'), source.indexOf('FROM "products" p'));
  assert.ok(summaryQuery.length > 0);
  assert.doesNotMatch(summaryQuery, /p\."analysis_data"\s*(?:,|AS)/u);
  assert.doesNotMatch(summaryQuery, /p\."generated_listing"\s*(?:,|AS)/u);
});

test('product writes require the complete tenant ownership chain', () => {
  const source = readFileSync('src/modules/products/services/product-service.server.ts', 'utf8');
  assert.match(source, /where: \{ id: productId, projectId, workspaceId \}/u);
  assert.match(source, /requireMembership\(tx, actorUserId, parsed\.workspaceId\)/u);
  assert.match(source, /version: parsed\.version/u);
});

test('Product workspace generation and autosave stay on the Product-scoped routes', () => {
  const workspace = readFileSync('src/components/workspace/ListingWorkspace.tsx', 'utf8');
  const autosave = readFileSync('src/modules/projects/client/use-project-autosave.ts', 'utf8');

  assert.match(workspace, /`\$\{productApiBase\}\/listing-draft\?workspaceId=/u);
  assert.match(workspace, /const requestKey = `\$\{productApiBase\}:\$\{projectSave\.currentVersion\}/u);
  assert.match(autosave, /const savedEntity = response\.product \?\? response\.project/u);
  assert.match(autosave, /\/products\/\$\{project\.id\}\/state/u);
});

test('Product listing APIs preserve the full ownership chain and Product persistence boundary', () => {
  const route = readFileSync('src/app/api/projects/[projectId]/listing-draft/route.ts', 'utf8');
  const service = readFileSync('src/modules/listing-draft/persistence/project-draft-service.server.ts', 'utf8');

  assert.match(route, /activeProductId = productId \?\? projectId/u);
  assert.match(route, /containerProjectId: productId \? projectId : undefined/u);
  assert.match(route, /projectId: productId \?\? projectId/u);
  assert.match(service, /getUserProduct\(actorUserId, \{ workspaceId, projectId: containerProjectId, productId: projectId \}\)/u);
  assert.match(service, /saveUserProductState\(input\.actorUserId, \{ \.\.\.state, projectId: input\.containerProjectId, productId: input\.projectId \}\)/u);
});

test('Product generation keeps optimistic concurrency and always terminates client loading state', () => {
  const workspace = readFileSync('src/components/workspace/ListingWorkspace.tsx', 'utf8');
  const lifecycle = readFileSync('src/modules/listing-draft/persistence/generation-lifecycle.ts', 'utf8');

  assert.match(workspace, /setEligibilityRefreshStatus\('error'\)/u);
  assert.match(workspace, /timeoutMessage: 'Could not refresh listing readiness\.'/u);
  assert.match(workspace, /finally \{\s*generationRequestRef\.current = false;\s*setIsGeneratingDraft\(false\);/u);
  assert.match(lifecycle, /input\.currentVersion !== input\.expectedVersion/u);
});
