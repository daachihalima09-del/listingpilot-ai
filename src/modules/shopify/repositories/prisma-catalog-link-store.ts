import 'server-only';

import { prisma } from '@/lib/prisma';
import type { CatalogLinkStore } from '../catalog/catalog-service';

export const prismaCatalogLinkStore: CatalogLinkStore = {
  async findMany(workspaceId, productGids) {
    if (!productGids.length) return new Map();
    const links = await prisma.shopifyProductImportLink.findMany({
      where: {
        workspaceId,
        shopifyProductGid: { in: productGids },
      },
      select: {
        shopifyProductGid: true,
        status: true,
        project: {
          select: { id: true, archivedAt: true },
        },
      },
    });
    return new Map(links.map((link) => [
      link.shopifyProductGid,
      {
        status: link.status === 'INCONSISTENT'
          ? 'LINK_INCONSISTENT'
          : link.project.archivedAt
            ? 'PROJECT_ARCHIVED'
            : 'IMPORTED',
        projectId: link.project.id,
      },
    ]));
  },
};

