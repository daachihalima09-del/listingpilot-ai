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
          shopifyProductGid: true, shopifyProductLegacyId: true, shopifyStoreId: true, status: true,
          project: { select: { id: true, archivedAt: true, shopifyProductPublication: { select: { shopifyProductId: true } } } },
        },
      }),
      prisma.shopifyProductPublication.findMany({
        where: { workspaceId, shopifyProductId: { in: legacyIds } },
        select: { shopifyProductId: true, project: { select: { id: true, archivedAt: true, shopifyProductImportLink: { select: { id: true } } } } },
      }),
    ]);
    const result = new Map();
    for (const link of links) {
      const valid = Boolean(store)
        && link.status === 'LINKED'
        && link.shopifyStoreId === store!.id
        && link.shopifyProductLegacyId === legacyProductIdFromGid(link.shopifyProductGid)
        && link.project.shopifyProductPublication?.shopifyProductId === link.shopifyProductLegacyId;
      result.set(link.shopifyProductGid, {
        status: !valid ? 'LINK_INCONSISTENT' : link.project.archivedAt ? 'PROJECT_ARCHIVED' : 'IMPORTED',
        projectId: link.project.id,
      });
    }
    for (const publication of publications) {
      const gid = `gid://shopify/Product/${publication.shopifyProductId}`;
      if (!result.has(gid) && !publication.project.shopifyProductImportLink) {
        result.set(gid, {
          status: publication.project.archivedAt ? 'PROJECT_ARCHIVED' : 'RECOVERABLE_LINK',
          projectId: publication.project.id,
        });
      }
    }
    return result;
  },
};
