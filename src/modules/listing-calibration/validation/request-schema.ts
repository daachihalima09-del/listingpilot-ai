import { z } from 'zod';
import { goldFixtureSchema } from './gold-fixture-schema.ts';

export const workspaceQuerySchema = z.object({ workspaceId: z.string().uuid() }).strict();
export const fixtureListQuerySchema = workspaceQuerySchema.extend({
  category: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'DEPRECATED', 'REJECTED']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
}).strict();
export const createFixtureRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(1).max(120),
}).strict();
export const updateFixtureRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  fixture: goldFixtureSchema,
}).strict();
export const transitionFixtureRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'DEPRECATE', 'RETURN_TO_DRAFT']),
}).strict();
export const duplicateFixtureRequestSchema = z.object({ workspaceId: z.string().uuid() }).strict();
export const runCalibrationRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  fixtureId: z.string().uuid(),
}).strict();
export const proposalListQuerySchema = workspaceQuerySchema.extend({
  status: z.enum(['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED', 'APPLIED_EXTERNALLY']).optional(),
}).strict();
export const reviewProposalRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  status: z.enum(['APPROVED', 'REJECTED', 'DEFERRED']),
}).strict();
