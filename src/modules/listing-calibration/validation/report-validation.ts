import { z } from 'zod';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { CraftRuleAdjustmentProposal, ListingCalibrationReport } from '../domain/contracts.ts';
import { CALIBRATION_REPORT_SCHEMA_VERSION, CALIBRATION_REPORT_VERSION, CRAFT_PROPOSAL_SCHEMA_VERSION, CRAFT_PROPOSAL_VERSION } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import { calibrationReportFingerprint } from '../comparison/calibration-engine.ts';
import { proposalFingerprint } from '../proposals/proposal-builder.ts';

const reportEnvelope = z.object({ reportId: z.string().uuid(), schemaVersion: z.number().int(), reportVersion: z.string(), version: z.number().int().positive(), workspaceId: z.string().uuid(), fixtureId: z.string().uuid(), projectId: z.string().uuid(), draftId: z.string().min(1), craftPackId: z.string().min(1), craftPackVersion: z.string().min(1), overallScore: z.number().int().min(0).max(100), status: z.enum(['EXCELLENT_MATCH', 'GOOD_MATCH', 'NEEDS_CALIBRATION', 'POOR_MATCH', 'INVALID_COMPARISON', 'BLOCKED']), fingerprint: z.string().length(16), createdAt: z.string().datetime() }).passthrough();
const proposalEnvelope = z.object({ proposalId: z.string().uuid(), schemaVersion: z.number().int(), proposalVersion: z.string(), version: z.number().int().positive(), workspaceId: z.string().uuid(), craftPackId: z.string().min(1), currentCraftPackVersion: z.string().min(1), targetRuleId: z.string().min(1), confidence: z.number().min(0).max(1), status: z.enum(['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED', 'APPLIED_EXTERNALLY']), fingerprint: z.string().length(16) }).passthrough();

export function parseCalibrationReport(value: unknown): ListingCalibrationReport {
  const parsed = reportEnvelope.safeParse(value);
  if (!parsed.success) throw new ListingCalibrationError('INVALID_CALIBRATION_REPORT', 'The calibration report is malformed.');
  const report = parsed.data as unknown as ListingCalibrationReport;
  if (report.schemaVersion !== CALIBRATION_REPORT_SCHEMA_VERSION || report.reportVersion !== CALIBRATION_REPORT_VERSION) throw new ListingCalibrationError('UNSUPPORTED_REPORT_VERSION', 'The calibration report version is unsupported.', 409);
  if (calibrationReportFingerprint(report) !== report.fingerprint) throw new ListingCalibrationError('REPORT_FINGERPRINT_MISMATCH', 'The calibration report fingerprint is invalid.', 409);
  return immutableCopy(report) as ListingCalibrationReport;
}

export function parseCraftRuleProposal(value: unknown): CraftRuleAdjustmentProposal {
  const parsed = proposalEnvelope.safeParse(value);
  if (!parsed.success) throw new ListingCalibrationError('INVALID_CRAFT_PROPOSAL', 'The Craft Rule proposal is malformed.');
  const proposal = parsed.data as unknown as CraftRuleAdjustmentProposal;
  if (proposal.schemaVersion !== CRAFT_PROPOSAL_SCHEMA_VERSION || proposal.proposalVersion !== CRAFT_PROPOSAL_VERSION) throw new ListingCalibrationError('UNSUPPORTED_PROPOSAL_VERSION', 'The proposal version is unsupported.', 409);
  if (proposalFingerprint(proposal) !== proposal.fingerprint) throw new ListingCalibrationError('PROPOSAL_FINGERPRINT_MISMATCH', 'The proposal fingerprint is invalid.', 409);
  return immutableCopy(proposal) as CraftRuleAdjustmentProposal;
}
