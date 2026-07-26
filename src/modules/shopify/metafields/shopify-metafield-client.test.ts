import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPIFY_METAFIELD_CATALOG,
} from './metafield-catalog.ts';
import {
  createShopifyMetafieldClient,
  ShopifyMetafieldClientError,
} from './shopify-metafield-client.ts';

function configuration() {
  return {
    schemaVersion: '1',
    version: 1,
    hasMappedData: true,
    fields: [],
    lastPublishedAt: null,
    conflicts: [],
  };
}

test('coalesces duplicate saves and publishes', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json(init?.method === 'PUT'
      ? { configuration: configuration() }
      : {
          outcome: 'UNCHANGED',
          created: 0,
          updated: 0,
          unchanged: 1,
          conflicted: 0,
          batchCount: 0,
          message: 'No changes.',
          configuration: configuration(),
        });
  };
  const client = createShopifyMetafieldClient(fetcher);
  const input = {
    version: 0,
    fields: SHOPIFY_METAFIELD_CATALOG.map(({ catalogId }) => ({
      catalogId,
      enabled: true,
    })),
  };
  const firstSave = client.save('project', input);
  const secondSave = client.save('project', input);
  assert.equal(firstSave, secondSave);
  await Promise.all([firstSave, secondSave]);
  const firstPublish = client.publish('project');
  const secondPublish = client.publish('project');
  assert.equal(firstPublish, secondPublish);
  await Promise.all([firstPublish, secondPublish]);
  assert.equal(calls, 2);
});

test('renders only safe server error messages', async () => {
  const client = createShopifyMetafieldClient(async () => Response.json({
    error: { message: 'Safe retry message.' },
  }, { status: 409 }));
  await assert.rejects(
    client.publish('project'),
    (error: unknown) => (
      error instanceof ShopifyMetafieldClientError
      && error.message === 'Safe retry message.'
    ),
  );
});
