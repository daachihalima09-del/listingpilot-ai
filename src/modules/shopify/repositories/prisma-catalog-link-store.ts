import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CatalogLinkStore } from '../catalog/catalog-service';
import { legacyProductIdFromGid } from '../catalog/catalog-validation';

export const prismaCatalogLinkStore: CatalogLinkStore = {
  async findMany(workspaceId, productGids) {
    if (!productGids.length) return new Map();
    const legacyIds = productGids.map(legacyProductIdFromGid);
    const [store, links, publications] = await Promise.all([
      prisma.shopifyStore.findFirst({ where: { workspaceId, status: { in: ['CONNECTED', 'ACTIVE'] } }, select: { id: true } }),
      prisma.shopifyProductImportLink.findMany({
        where: { workspaceId, shopifyProductGid: { in: productGids } },
        select: {
          projectId: true, shopifyProductGid: true, shopifyProductLegacyId: true, shopifyStoreId: true, status: true,
          product: { select: { id: true, projectId: true, archivedAt: true, shopifyProductPublication: { select: { shopifyProductId: true } } } },
        },
      }),
      prisma.shopifyProductPublication.findMany({
        where: { workspaceId, shopifyProductId: { in: legacyIds } },
        select: { projectId: true, shopifyProductId: true, product: { select: { id: true, projectId: true, archivedAt: true, shopifyProductImportLink: { select: { id: true } } } } },
      }),
    ]);
    const result = new Map();
    for (const link of links) {
      const valid = Boolean(store)
        && link.status === 'LINKED'
        && link.shopifyStoreId === store!.id
        && link.shopifyProductLegacyId === legacyProductIdFromGid(link.shopifyProductGid)
        && link.product?.shopifyProductPublication?.shopifyProductId === link.shopifyProductLegacyId;
      result.set(link.shopifyProductGid, {
        status: !valid ? 'LINK_INCONSISTENT' : link.product?.archivedAt ? 'PROJECT_ARCHIVED' : 'IMPORTED',
        projectId: link.product?.projectId ?? link.projectId,
      });
    }
    for (const publication of publications) {
      const gid = `gid://shopify/Product/${publication.shopifyProductId}`;
      if (!result.has(gid) && !publication.product?.shopifyProductImportLink) {
        result.set(gid, {
          status: publication.product?.archivedAt ? 'PROJECT_ARCHIVED' : 'RECOVERABLE_LINK',
          projectId: publication.product?.projectId ?? publication.projectId,
        });
      }
    }
    return result;
  },
};
