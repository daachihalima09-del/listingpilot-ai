import type { ShopifyCreatedProduct } from '../products/product-validation.ts';
import type { ShopifyPublishedProductReference } from './publication-types.ts';

export interface ShopifyPublicationProjectContext {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  publication: ShopifyPublishedProductReference | null;
  importedProductLink?: {
    valid: boolean;
  } | null;
}

export interface ShopifyProductPublicationRepository {
  resolveProject(
    actorUserId: string,
    projectId: string,
  ): Promise<ShopifyPublicationProjectContext | null>;
  findForProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ShopifyPublishedProductReference | null>;
  save(input: {
    workspaceId: string;
    projectId: string;
    product: ShopifyCreatedProduct;
    publishedAt: Date;
  }): Promise<ShopifyPublishedProductReference>;
  saveCreated(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    projectId: string;
    product: ShopifyCreatedProduct;
    publishedAt: Date;
  }): Promise<ShopifyPublishedProductReference>;
}
