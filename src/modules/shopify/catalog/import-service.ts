import type { ShopifyAdminApiRequester } from '../admin/admin-api-client-core.ts';
import { getShopifyConfig } from '../config.ts';
import { catalogImportInputSchema } from './catalog-validation.ts';
import { fetchShopifyCatalogProduct } from './catalog-service.ts';
import { ShopifyCatalogError } from './catalog-errors.ts';
import type { ShopifyImportRepository } from './import-repository.ts';
import { normalizeShopifyProductSnapshot } from './snapshot.ts';

export async function importShopifyProduct(
  dependencies: {
    requester: ShopifyAdminApiRequester;
    repository: ShopifyImportRepository;
    apiVersion?: string;
  },
  context: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    shopifyStoreId: string;
    shopDomain: string;
    role: string;
  },
  untrustedInput: unknown,
) {
  if (context.role !== 'OWNER') {
    throw new ShopifyCatalogError('WORKSPACE_FORBIDDEN', 403, 'Workspace owner permission is required.');
  }
  const input = catalogImportInputSchema.parse(untrustedInput);
  const existing = await dependencies.repository.findExisting({
    workspaceId: context.workspaceId,
    shopifyStoreId: context.shopifyStoreId,
    productGid: input.productId,
  });
  if (existing) return { ...existing, created: false };

  const importedAt = new Date();
  const rawProduct = await fetchShopifyCatalogProduct(
    dependencies.requester,
    input.productId,
  );
  let snapshot;
  try {
    snapshot = normalizeShopifyProductSnapshot(
      rawProduct,
      dependencies.apiVersion ?? getShopifyConfig().apiVersion,
      importedAt,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'SOURCE_SNAPSHOT_TOO_LARGE') {
      throw new ShopifyCatalogError('SOURCE_SNAPSHOT_TOO_LARGE', 413, 'This product is too large to import safely.');
    }
    throw new ShopifyCatalogError('IMPORT_FAILED', 500, 'The Shopify product could not be imported.');
  }

  try {
    const project = await dependencies.repository.create({
      actorUserId: context.actorUserId,
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      shopifyStoreId: context.shopifyStoreId,
      shopDomain: context.shopDomain,
      snapshot,
      importedAt,
    });
    return { ...project, created: true };
  } catch {
    const winner = await dependencies.repository.findExisting({
      workspaceId: context.workspaceId,
      shopifyStoreId: context.shopifyStoreId,
      productGid: input.productId,
    });
    if (winner) return { ...winner, created: false };
    throw new ShopifyCatalogError('LINK_INCONSISTENT', 409, 'The Shopify product is already linked inconsistently.');
  }
}

