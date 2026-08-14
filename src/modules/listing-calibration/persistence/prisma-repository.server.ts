import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseCraftRuleProposal, parseCalibrationReport } from '../validation/report-validation.ts';
import { validateGoldFixture } from '../validation/gold-fixture-validation.ts';
import type { CalibrationAuditSummary, ListingCalibrationRepository } from './repository.ts';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const safeAudit = (summary: CalibrationAuditSummary) => ({
  ...(summary.projectId ? { projectId: summary.projectId } : {}),
  ...(summary.status ? { status: summary.status } : {}),
  ...(summary.score !== undefined ? { score: summary.score } : {}),
  version: summary.version,
});

export const prismaListingCalibrationRepository: ListingCalibrationRepository = {
  async listFixtures(workspaceId, filters = {}) {
    const rows = await prisma.listingGoldFixture.findMany({ where: { workspaceId, ...(filters.status ? { status: filters.status as never } : {}), ...(filters.category ? { category: filters.category } : {}), ...(filters.search ? { OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { category: { contains: filters.search, mode: 'insensitive' } }] } : {}) }, orderBy: { updatedAt: 'desc' } });
    return rows.map((row) => validateGoldFixture(row.payload));
  },
  async findFixture(workspaceId, fixtureId) {
    const row = await prisma.listingGoldFixture.findFirst({ where: { id: fixtureId, workspaceId } });
    return row ? validateGoldFixture(row.payload) : null;
  },
  async createFixture(fixture, organizationId, audit) {
    await prisma.$transaction(async (tx) => {
      await tx.listingGoldFixture.create({ data: { id: fixture.fixtureId, workspaceId: fixture.workspaceId, projectId: fixture.sourceProjectId, sourceDraftId: fixture.sourceDraftId, schemaVersion: fixture.schemaVersion, fixtureVersion: fixture.fixtureVersion, version: fixture.version, status: fixture.approvalStatus, name: fixture.name, category: fixture.category, productTruthFingerprint: fixture.productTruthFingerprint, craftPackId: fixture.craftPackId, craftPackVersion: fixture.craftPackVersion, fingerprint: fixture.fingerprint, payload: json(fixture), createdByUserId: fixture.createdBy } });
      await tx.auditLog.create({ data: { organizationId, workspaceId: fixture.workspaceId, userId: fixture.createdBy, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, metadata: safeAudit(audit) } });
    });
    return fixture;
  },
  async updateFixture(fixture, expectedVersion, organizationId, actorUserId, audit) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.listingGoldFixture.updateMany({ where: { id: fixture.fixtureId, workspaceId: fixture.workspaceId, version: expectedVersion }, data: { version: fixture.version, status: fixture.approvalStatus, name: fixture.name, category: fixture.category, fingerprint: fixture.fingerprint, payload: json(fixture), approvedByUserId: fixture.approvedBy, approvedAt: fixture.approvedAt ? new Date(fixture.approvedAt) : null } });
      if (updated.count !== 1) return null;
      await tx.auditLog.create({ data: { organizationId, workspaceId: fixture.workspaceId, userId: actorUserId, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, metadata: safeAudit(audit) } });
      return fixture;
    });
  },
  async listReports(workspaceId, fixtureId) {
    const rows = await prisma.listingCalibrationReport.findMany({ where: { workspaceId, ...(fixtureId ? { fixtureId } : {}) }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => parseCalibrationReport(row.payload));
  },
  async createReport(report, organizationId, actorUserId, audit) {
    await prisma.$transaction(async (tx) => {
      await tx.listingCalibrationReport.create({ data: { id: report.reportId, workspaceId: report.workspaceId, projectId: report.projectId, fixtureId: report.fixtureId, schemaVersion: report.schemaVersion, reportVersion: report.reportVersion, version: report.version, status: report.status, overallScore: report.overallScore, craftPackId: report.craftPackId, craftPackVersion: report.craftPackVersion, fingerprint: report.fingerprint, payload: json(report), createdByUserId: actorUserId } });
      await tx.auditLog.create({ data: { organizationId, workspaceId: report.workspaceId, userId: actorUserId, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, metadata: safeAudit(audit) } });
    });
    return report;
  },
  async listProposals(workspaceId, status) {
    const rows = await prisma.craftRuleProposal.findMany({ where: { workspaceId, ...(status ? { status } : {}) }, orderBy: [{ status: 'asc' }, { confidence: 'desc' }] });
    return rows.map((row) => parseCraftRuleProposal(row.payload));
  },
  async upsertProposals(proposals, organizationId, actorUserId) {
    await prisma.$transaction(async (tx) => {
      for (const proposal of proposals) {
        const existing = await tx.craftRuleProposal.findUnique({ where: { workspaceId_fingerprint: { workspaceId: proposal.workspaceId, fingerprint: proposal.fingerprint } }, select: { id: true } });
        if (existing) continue;
        await tx.craftRuleProposal.create({ data: { id: proposal.proposalId, workspaceId: proposal.workspaceId, schemaVersion: proposal.schemaVersion, proposalVersion: proposal.proposalVersion, version: proposal.version, status: proposal.status, craftPackId: proposal.craftPackId, currentCraftPackVersion: proposal.currentCraftPackVersion, targetRuleId: proposal.targetRuleId, confidence: proposal.confidence, fingerprint: proposal.fingerprint, payload: json(proposal), createdByUserId: actorUserId } });
        await tx.auditLog.create({ data: { organizationId, workspaceId: proposal.workspaceId, userId: actorUserId, action: 'craft_rule_proposal.created', entityType: 'CraftRuleProposal', entityId: proposal.proposalId, metadata: { targetRuleId: proposal.targetRuleId, signalCount: proposal.metadata.signalCount, status: proposal.status } } });
      }
    });
  },
  async updateProposal(proposal, expectedVersion, organizationId, actorUserId, audit) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.craftRuleProposal.updateMany({ where: { id: proposal.proposalId, workspaceId: proposal.workspaceId, version: expectedVersion }, data: { version: proposal.version, status: proposal.status, payload: json(proposal), approvedByUserId: proposal.approvedBy, reviewedAt: proposal.reviewedAt ? new Date(proposal.reviewedAt) : null } });
      if (updated.count !== 1) return null;
      await tx.auditLog.create({ data: { organizationId, workspaceId: proposal.workspaceId, userId: actorUserId, action: audit.action, entityType: audit.entityType, entityId: audit.entityId, metadata: safeAudit(audit) } });
      return proposal;
    });
  },
};
