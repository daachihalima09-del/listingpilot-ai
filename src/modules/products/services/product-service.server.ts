import 'server-only';

import { Prisma, type Product as PrismaProduct } from '@prisma/client';
import type { ZodType } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  projectAnalysisDataSchema,
  projectGeneratedListingSchema,
  projectReadinessDataSchema,
  projectSeoDataSchema,
  type ProjectAnalysisData,
  type ProjectGeneratedListing,
  type ProjectReadinessData,
  type ProjectSeoData,
} from '@/modules/projects/validators/project';
import {
  ProjectForbiddenError,
  ProjectLifecycleError,
  ProjectNotFoundError,
  ProjectStaleWriteError,
} from '@/modules/projects/types/errors';
import {
  createProductSchema,
  listProductsSchema,
  productIdentitySchema,
  productLifecycleSchema,
  renameProductSchema,
  saveProductStateSchema,
} from '../validators/product';

export interface ProductDetail {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  sourceType: 'RAW_SPECIFICATIONS' | 'SUPPLIER_URL' | 'PRODUCT_URL' | 'UPLOADED_PDF' | 'SHOPIFY_IMPORT' | null;
  sourceUrl: string | null;
  rawInput: string | null;
  analysisData: ProjectAnalysisData | null;
  generatedListing: ProjectGeneratedListing | null;
  seoData: ProjectSeoData | null;
  readinessData: ProjectReadinessData | null;
  readiness: { shopifyReady: boolean; score: number | null } | null;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSummary {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  version: number;
  hasSource: boolean;
  hasAnalysis: boolean;
  hasListing: boolean;
  hasSeo: boolean;
  isShopifyReady: boolean;
  isShopifyLinked: boolean;
  listingStatus: string | null;
  reviewedSectionCount: number;
  hasStalePlan: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
}

type Membership = { organizationId: string; role: string };

function parseJson<T>(schema: ZodType<T>, value: unknown, label: string): T | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Stored product ${label} is invalid.`);
  return parsed.data;
}

function toDetail(product: PrismaProduct): ProductDetail {
  const analysisData = parseJson(projectAnalysisDataSchema, product.analysisData, 'analysis');
  const readinessData = parseJson(projectReadinessDataSchema, product.readinessData, 'readiness');
  return {
    id: product.id,
    projectId: product.projectId,
    workspaceId: product.workspaceId,
    name: product.name,
    status: product.status,
    sourceType: product.sourceType,
    sourceUrl: product.sourceUrl,
    rawInput: product.rawInput,
    analysisData,
    generatedListing: parseJson(projectGeneratedListingSchema, product.generatedListing, 'listing'),
    seoData: parseJson(projectSeoDataSchema, product.seoData, 'SEO'),
    readinessData,
    readiness: readinessData ? { shopifyReady: readinessData.shopifyReady, score: analysisData?.activeProduct.catalogHealth.score ?? null } : null,
    version: product.version,
    archivedAt: product.archivedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

async function requireMembership(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  workspaceId: string,
): Promise<Membership> {
  const membership = await tx.membership.findFirst({
    where: {
      userId: actorUserId,
      organization: { workspaces: { some: { id: workspaceId } } },
    },
    select: { organizationId: true, role: true },
  });
  if (!membership) throw new ProjectNotFoundError();
  return membership;
}

function requireOwner(membership: Membership): void {
  if (membership.role !== 'OWNER') throw new ProjectForbiddenError();
}

async function requireProject(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
  if (!project) throw new ProjectNotFoundError();
}

async function requireProduct(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  projectId: string,
  productId: string,
): Promise<PrismaProduct> {
  const product = await tx.product.findFirst({
    where: { id: productId, projectId, workspaceId },
  });
  if (!product) throw new ProjectNotFoundError();
  return product;
}

async function transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 20_000,
      });
    } catch (error) {
      const retryable = Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2034');
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error('Product transaction retry limit reached.');
}

export async function listUserProducts(actorUserId: string, input: unknown): Promise<ProductSummary[]> {
  const parsed = listProductsSchema.parse(input);
  return transaction(async (tx) => {
    await requireMembership(tx, actorUserId, parsed.workspaceId);
    await requireProject(tx, parsed.workspaceId, parsed.projectId);
    return tx.$queryRaw<ProductSummary[]>(Prisma.sql`
      SELECT
        p."id",
        p."project_id" AS "projectId",
        p."workspace_id" AS "workspaceId",
        p."name",
        p."status",
        p."version",
        (p."source_type" IS NOT NULL OR p."raw_input" IS NOT NULL OR p."source_url" IS NOT NULL) AS "hasSource",
        (p."analysis_data" IS NOT NULL) AS "hasAnalysis",
        (p."generated_listing" IS NOT NULL) AS "hasListing",
        (p."seo_data" IS NOT NULL) AS "hasSeo",
        COALESCE((p."readiness_data" ->> 'shopifyReady')::boolean, false) AS "isShopifyReady",
        (EXISTS (
          SELECT 1 FROM "shopify_product_publications" publication
          WHERE publication."product_id" = p."id" AND publication."workspace_id" = p."workspace_id"
        ) OR EXISTS (
          SELECT 1 FROM "shopify_product_import_links" link
          WHERE link."product_id" = p."id" AND link."workspace_id" = p."workspace_id"
        )) AS "isShopifyLinked",
        (p."generated_listing" -> 'listingDraft' ->> 'status') AS "listingStatus",
        COALESCE(jsonb_array_length(COALESCE(p."generated_listing" -> 'listingDraft' -> 'reviewWorkspace' -> 'reviewedSections', '[]'::jsonb)), 0) AS "reviewedSectionCount",
        COALESCE((
          SELECT plan."status" = 'STALE'
          FROM "shopify_publishing_plans" plan
          WHERE plan."product_id" = p."id" AND plan."workspace_id" = p."workspace_id"
          ORDER BY plan."created_at" DESC, plan."id" DESC
          LIMIT 1
        ), false) AS "hasStalePlan",
        p."archived_at" AS "archivedAt",
        p."updated_at" AS "updatedAt"
      FROM "products" p
      WHERE p."workspace_id" = ${parsed.workspaceId}::uuid
        AND p."project_id" = ${parsed.projectId}::uuid
        AND (${parsed.archived}::boolean = (p."archived_at" IS NOT NULL))
      ORDER BY p."updated_at" DESC, p."id" ASC
    `);
  });
}

export async function getUserProduct(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = productIdentitySchema.parse(input);
  return transaction(async (tx) => {
    await requireMembership(tx, actorUserId, parsed.workspaceId);
    await requireProject(tx, parsed.workspaceId, parsed.projectId);
    return toDetail(await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId));
  });
}

export async function createUserProduct(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = createProductSchema.parse(input);
  return transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    await requireProject(tx, parsed.workspaceId, parsed.projectId);
    const product = await tx.product.create({ data: parsed });
    await tx.auditLog.create({ data: {
      organizationId: membership.organizationId,
      workspaceId: parsed.workspaceId,
      userId: actorUserId,
      action: 'product.created',
      entityType: 'Product',
      entityId: product.id,
      metadata: { projectId: parsed.projectId },
    } });
    return toDetail(product);
  });
}

export async function renameUserProduct(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = renameProductSchema.parse(input);
  return transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    const result = await tx.product.updateMany({
      where: { id: parsed.productId, projectId: parsed.projectId, workspaceId: parsed.workspaceId, version: parsed.version },
      data: { name: parsed.name, version: { increment: 1 }, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new ProjectStaleWriteError();
    const product = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    await tx.auditLog.create({ data: {
      organizationId: membership.organizationId, workspaceId: parsed.workspaceId, userId: actorUserId,
      action: 'product.renamed', entityType: 'Product', entityId: product.id,
      metadata: { projectId: parsed.projectId, changedFields: ['name'] },
    } });
    return toDetail(product);
  });
}

export async function saveUserProductState(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = saveProductStateSchema.parse(input);
  return transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    const existing = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    if (existing.archivedAt) throw new ProjectLifecycleError('Restore this product before saving changes.');
    const result = await tx.product.updateMany({
      where: { id: parsed.productId, projectId: parsed.projectId, workspaceId: parsed.workspaceId, version: parsed.version, archivedAt: null },
      data: {
        sourceType: parsed.sourceType,
        sourceUrl: parsed.sourceUrl,
        rawInput: parsed.rawInput,
        analysisData: parsed.analysisData === null ? Prisma.DbNull : parsed.analysisData as Prisma.InputJsonValue,
        generatedListing: parsed.generatedListing === null ? Prisma.DbNull : parsed.generatedListing as Prisma.InputJsonValue,
        seoData: parsed.seoData === null ? Prisma.DbNull : parsed.seoData as Prisma.InputJsonValue,
        readinessData: parsed.readinessData === null ? Prisma.DbNull : parsed.readinessData as Prisma.InputJsonValue,
        status: parsed.readinessData?.shopifyReady ? 'READY' : 'DRAFT',
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (result.count !== 1) throw new ProjectStaleWriteError();
    const product = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    await tx.auditLog.create({ data: {
      organizationId: membership.organizationId, workspaceId: parsed.workspaceId, userId: actorUserId,
      action: 'product.state.saved', entityType: 'Product', entityId: product.id,
      metadata: { projectId: parsed.projectId, changedFields: ['source', 'analysisData', 'generatedListing', 'seoData', 'readinessData'] },
    } });
    return toDetail(product);
  });
}

export async function archiveUserProduct(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = productLifecycleSchema.parse(input);
  return transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    const existing = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    if (existing.archivedAt) throw new ProjectLifecycleError('This product is already archived.');
    const result = await tx.product.updateMany({
      where: { id: parsed.productId, projectId: parsed.projectId, workspaceId: parsed.workspaceId, version: parsed.version, archivedAt: null },
      data: { status: 'ARCHIVED', statusBeforeArchive: existing.status, archivedAt: new Date(), version: { increment: 1 }, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new ProjectStaleWriteError();
    const product = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    await tx.auditLog.create({ data: { organizationId: membership.organizationId, workspaceId: parsed.workspaceId, userId: actorUserId, action: 'product.archived', entityType: 'Product', entityId: product.id, metadata: { projectId: parsed.projectId } } });
    return toDetail(product);
  });
}

export async function restoreUserProduct(actorUserId: string, input: unknown): Promise<ProductDetail> {
  const parsed = productLifecycleSchema.parse(input);
  return transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    const existing = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    if (!existing.archivedAt) throw new ProjectLifecycleError('This product is not archived.');
    const result = await tx.product.updateMany({
      where: { id: parsed.productId, projectId: parsed.projectId, workspaceId: parsed.workspaceId, version: parsed.version, archivedAt: { not: null } },
      data: { status: existing.statusBeforeArchive === 'READY' ? 'READY' : 'DRAFT', statusBeforeArchive: null, archivedAt: null, version: { increment: 1 }, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new ProjectStaleWriteError();
    const product = await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    await tx.auditLog.create({ data: { organizationId: membership.organizationId, workspaceId: parsed.workspaceId, userId: actorUserId, action: 'product.restored', entityType: 'Product', entityId: product.id, metadata: { projectId: parsed.projectId } } });
    return toDetail(product);
  });
}

export async function deleteUserProduct(actorUserId: string, input: unknown): Promise<void> {
  const parsed = productLifecycleSchema.parse(input);
  await transaction(async (tx) => {
    const membership = await requireMembership(tx, actorUserId, parsed.workspaceId);
    requireOwner(membership);
    await requireProduct(tx, parsed.workspaceId, parsed.projectId, parsed.productId);
    const deleted = await tx.product.deleteMany({ where: { id: parsed.productId, projectId: parsed.projectId, workspaceId: parsed.workspaceId, version: parsed.version } });
    if (deleted.count !== 1) throw new ProjectStaleWriteError();
    await tx.auditLog.create({ data: { organizationId: membership.organizationId, workspaceId: parsed.workspaceId, userId: actorUserId, action: 'product.deleted', entityType: 'Product', entityId: parsed.productId, metadata: { projectId: parsed.projectId, remoteShopifyProductDeleted: false } } });
  });
}
