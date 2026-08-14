import { z } from 'zod';
import { GOLD_FIXTURE_SCHEMA_VERSION, GOLD_FIXTURE_VERSION } from '../domain/contracts.ts';

const ids = z.array(z.string().min(1).max(255)).max(100);
const text = z.object({ value: z.string().max(100_000), factIds: ids }).strict();
const exception = z.object({
  exceptionId: z.string().min(1).max(255), scope: z.enum(['FIXTURE', 'CATEGORY']), reason: z.string().trim().min(1).max(2_000),
  affectedFields: z.array(z.string().min(1).max(255)).min(1).max(50), temporaryOrPermanent: z.enum(['TEMPORARY', 'PERMANENT']), merchantApproved: z.boolean(),
}).strict();

export const goldFixtureSchema = z.object({
  fixtureId: z.string().uuid(), schemaVersion: z.literal(GOLD_FIXTURE_SCHEMA_VERSION), fixtureVersion: z.literal(GOLD_FIXTURE_VERSION), version: z.number().int().positive(), workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(200), description: z.string().max(2_000), category: z.string().trim().min(1).max(120),
  productIdentity: z.object({ brand: z.string().max(500).nullable(), model: z.string().max(500).nullable(), productType: z.string().max(500).nullable(), variant: z.string().max(500).nullable() }).strict(),
  sourceProjectId: z.string().uuid(), sourceDraftId: z.string().min(1).max(255), productTruthFingerprint: z.string().length(16),
  productTruthFacts: z.array(z.object({ factId: z.string().min(1).max(255), fieldId: z.string().min(1).max(255), value: z.string().max(10_000), status: z.string().min(1).max(100) }).strict()).max(250),
  merchantOverrides: z.array(z.object({ overrideId: z.string().min(1).max(255), value: z.string().max(10_000), reason: z.string().min(1).max(2_000), approvedBy: z.string().uuid() }).strict()).max(50),
  productIntelligencePack: z.object({ id: z.string().min(1).max(100), version: z.string().min(1).max(50), categoryId: z.string().min(1).max(120) }).strict().nullable(),
  craftPackId: z.string().min(1).max(64), craftPackVersion: z.string().min(1).max(50), expectedTitle: text,
  expectedSpecifications: z.array(text.extend({ label: z.string().trim().min(1).max(200) }).strict()).max(100), expectedOverview: text, expectedFeatures: z.array(text).max(30),
  expectedSeo: z.object({ title: text, description: text, handle: text }).strict(), expectedCatalog: z.object({ productType: text, vendor: text, collections: z.array(text).max(100), tags: z.array(text).max(100) }).strict(),
  requiredBehaviors: z.array(z.string().trim().min(1).max(500)).max(100), prohibitedBehaviors: z.array(z.string().trim().min(1).max(500)).max(100), allowedVariations: z.array(z.string().trim().min(1).max(500)).max(100),
  productSpecificExceptions: z.array(exception).max(100), merchantNotes: z.array(z.string().trim().min(1).max(2_000)).max(100),
  approvalStatus: z.enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'DEPRECATED', 'REJECTED']), approvedBy: z.string().uuid().nullable(), approvedAt: z.string().datetime().nullable(), createdBy: z.string().uuid(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), fingerprint: z.string().length(16),
  metadata: z.object({ lastCalibrationScore: z.number().int().min(0).max(100).nullable() }).strict(),
}).strict();

export const createGoldFixtureRequestSchema = z.object({ workspaceId: z.string().uuid(), projectId: z.string().uuid(), name: z.string().trim().min(2).max(200), category: z.string().trim().min(1).max(120) }).strict();
export const updateGoldFixtureRequestSchema = z.object({ workspaceId: z.string().uuid(), expectedVersion: z.number().int().positive(), fixture: goldFixtureSchema }).strict();
export const fixtureActionRequestSchema = z.object({ workspaceId: z.string().uuid(), expectedVersion: z.number().int().positive(), action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'DEPRECATE']) }).strict();
