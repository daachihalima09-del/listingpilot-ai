import type { CraftRuleAdjustmentProposal, ListingCalibrationReport, NeovixGoldFixture, ProposalStatus } from '../domain/contracts.ts';

export interface CalibrationAuditSummary { readonly action: string; readonly entityType: string; readonly entityId: string; readonly projectId?: string; readonly status?: string; readonly score?: number; readonly version: number }
export interface ListingCalibrationRepository {
  listFixtures(workspaceId: string, filters?: { category?: string; status?: string; search?: string }): Promise<readonly NeovixGoldFixture[]>;
  findFixture(workspaceId: string, fixtureId: string): Promise<NeovixGoldFixture | null>;
  createFixture(fixture: NeovixGoldFixture, organizationId: string, audit: CalibrationAuditSummary): Promise<NeovixGoldFixture>;
  updateFixture(fixture: NeovixGoldFixture, expectedVersion: number, organizationId: string, actorUserId: string, audit: CalibrationAuditSummary): Promise<NeovixGoldFixture | null>;
  listReports(workspaceId: string, fixtureId?: string): Promise<readonly ListingCalibrationReport[]>;
  createReport(report: ListingCalibrationReport, organizationId: string, actorUserId: string, audit: CalibrationAuditSummary): Promise<ListingCalibrationReport>;
  listProposals(workspaceId: string, status?: ProposalStatus): Promise<readonly CraftRuleAdjustmentProposal[]>;
  upsertProposals(proposals: readonly CraftRuleAdjustmentProposal[], organizationId: string, actorUserId: string): Promise<void>;
  updateProposal(proposal: CraftRuleAdjustmentProposal, expectedVersion: number, organizationId: string, actorUserId: string, audit: CalibrationAuditSummary): Promise<CraftRuleAdjustmentProposal | null>;
}
