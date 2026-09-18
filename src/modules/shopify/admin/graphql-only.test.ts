import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) files.push(...productionTypeScriptFiles(path));
    else if (/\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name)) files.push(path);
  }
  return files;
}

test('active Shopify Admin integrations contain no REST resource endpoints', () => {
  const files = [
    ...productionTypeScriptFiles('src/modules/shopify'),
    ...productionTypeScriptFiles('src/app/api/shopify'),
    'src/modules/onboarding/catalog-profile/shopify-import-service.ts',
  ];
  const forbidden = [
    /\/shop\.json/u,
    /\/products\.json/u,
    /\/products\/[^\s'"`]+\.json/u,
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains an Admin REST endpoint`);
    }
  }

  const adminClient = readFileSync(
    'src/modules/shopify/admin/admin-api-client-core.ts',
    'utf8',
  );
  assert.match(adminClient, /path !== '\/graphql\.json'/u);
});

test('legacy generic product endpoints cannot bypass Safe Publishing', () => {
  for (const file of [
    'src/app/api/shopify/products/route.ts',
    'src/app/api/shopify/products/[productId]/route.ts',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /SHOPIFY_SAFE_PUBLISHING_REQUIRED/u);
    assert.doesNotMatch(source, /createUserShopifyProduct|updateUserShopifyProduct/u);
  }
});

test('compliance persistence is exact-shop scoped, durable and payload-minimal', () => {
  const source = readFileSync(
    'src/modules/shopify/repositories/prisma-compliance-webhook-store.ts',
    'utf8',
  );
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$\{input\.webhookId\}\)\)/u);
  assert.match(source, /where: \{ shopDomain: input\.shopDomain \}/u);
  assert.match(source, /entityId: input\.webhookId/u);
  assert.match(source, /payloadHash: input\.rawBodyHash/u);
  assert.doesNotMatch(source, /customer\.(email|phone)|orders_requested|orders_to_redact/u);
});
