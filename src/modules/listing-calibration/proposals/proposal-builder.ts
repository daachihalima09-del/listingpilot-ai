import { randomUUID } from 'node:crypto';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { CraftRuleAdjustmentProposal, ListingCalibrationReport, NeovixGoldFixture, ProposalStatus, ProposalThresholds, ProposalType } from '../domain/contracts.ts';
import { CRAFT_PROPOSAL_SCHEMA_VERSION, CRAFT_PROPOSAL_VERSION, DEFAULT_PROPOSAL_THRESHOLDS } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';

export interface ProposalEvidence { readonly report: ListingCalibrationReport; readonly fixture: NeovixGoldFixture }

function typeFor(code: string): ProposalType {
  if (code.includes('ORDER')) return 'CHANGE_ORDER';
  if (code.includes('COUNT')) return code.includes('MISSING') ? 'CHANGE_MINIMUM' : 'CHANGE_MAXIMUM';
  if (code.includes('DUPLIC')) return 'CHANGE_DUPLICATION_POLICY';
  if (code.includes('PROHIBITED')) return 'ADD_PROHIBITED_TERM';
  if (code.includes('MISSING')) return 'ADD_REQUIRED_COMPONENT';
  if (code.includes('PRIORITY')) return 'CHANGE_PRIORITY';
  return 'ADD_ALLOWED_VARIATION';
}

export function proposalFingerprint(proposal: CraftRuleAdjustmentProposal): string {
  const semantic = { ...proposal } as Record<string, unknown>;
  for (const key of ['proposalId', 'version', 'status', 'createdBy', 'approvedBy', 'createdAt', 'reviewedAt', 'fingerprint']) delete semantic[key];
  return new DeterministicHasher().hash(JSON.parse(JSON.stringify(semantic)) as unknown);
}

export function buildCraftRuleProposals(input: Readonly<{ workspaceId: string; actorUserId: string; evidence: readonly ProposalEvidence[]; thresholds?: ProposalThresholds; now?: () => string }>): readonly CraftRuleAdjustmentProposal[] {
  const thresholds = input.thresholds ?? DEFAULT_PROPOSAL_THRESHOLDS;
  const approved = input.evidence.filter(({ fixture }) => fixture.workspaceId === input.workspaceId && fixture.approvalStatus === 'APPROVED');
  if (approved.length < thresholds.minimumApprovedFixtures) return [];
  const groups = new Map<string, ProposalEvidence[]>();
  for (const evidence of approved) {
    for (const finding of evidence.report.findings) {
      if (!finding.reusableSignal || finding.productSpecific || !finding.craftRuleId) continue;
      const key = `${finding.craftRuleId}:${finding.differenceType}`;
      const entries = groups.get(key) ?? [];
      if (!entries.some(({ fixture }) => fixture.fixtureId === evidence.fixture.fixtureId)) entries.push(evidence);
      groups.set(key, entries);
    }
  }
  const now = (input.now ?? (() => new Date().toISOString()))();
  const proposals: CraftRuleAdjustmentProposal[] = [];
  for (const [key, supporting] of groups) {
    if (supporting.length < thresholds.minimumRepeatedSignalCount) continue;
    const [targetRuleId = 'unknown', difference = 'DIFFERENCE'] = key.split(':');
    const supportingIds = new Set(supporting.map(({ fixture }) => fixture.fixtureId));
    const contradicting = approved.filter(({ fixture }) => !supportingIds.has(fixture.fixtureId));
    const contradictingRatio = contradicting.length / approved.length;
    const confidence = Number(((supporting.length / approved.length) * (1 - contradictingRatio)).toFixed(4));
    const firstFinding = supporting[0]!.report.findings.find((finding) => finding.craftRuleId === targetRuleId && finding.differenceType === difference)!;
    const status: ProposalStatus = confidence >= thresholds.minimumProposalConfidence && contradictingRatio <= thresholds.maximumContradictingFixtureRatio ? 'READY_FOR_REVIEW' : 'DRAFT';
    const base = {
      proposalId: randomUUID(), schemaVersion: CRAFT_PROPOSAL_SCHEMA_VERSION, proposalVersion: CRAFT_PROPOSAL_VERSION, version: 1, workspaceId: input.workspaceId,
      craftPackId: supporting[0]!.report.craftPackId, currentCraftPackVersion: supporting[0]!.report.craftPackVersion, targetRuleId,
      proposalType: typeFor(difference), currentValue: null, proposedValue: firstFinding.message, reason: `${supporting.length} approved Gold Fixtures show the same reusable calibration signal.`,
      supportingFixtureIds: [...supportingIds].sort(), supportingFindingIds: supporting.flatMap(({ report }) => report.findings.filter((finding) => finding.craftRuleId === targetRuleId && finding.differenceType === difference).map(({ findingId }) => findingId)).sort(),
      contradictingFixtureIds: contradicting.map(({ fixture }) => fixture.fixtureId).sort(), confidence, impact: firstFinding.severity === 'HIGH' ? 'HIGH' as const : 'MEDIUM' as const, risk: contradicting.length ? 'MEDIUM' as const : 'LOW' as const,
      scope: 'GLOBAL_CRAFT_PACK' as const, status, createdBy: input.actorUserId, approvedBy: null, createdAt: now, reviewedAt: null,
      metadata: { signalCount: supporting.length, contradictingRatio },
    };
    const proposal = { ...base, fingerprint: '' } as CraftRuleAdjustmentProposal;
    proposals.push(immutableCopy({ ...proposal, fingerprint: proposalFingerprint(proposal) }) as CraftRuleAdjustmentProposal);
  }
  return proposals.sort((left, right) => right.confidence - left.confidence || left.targetRuleId.localeCompare(right.targetRuleId));
}

export function reviewCraftRuleProposal(proposal: CraftRuleAdjustmentProposal, status: Extract<ProposalStatus, 'APPROVED' | 'REJECTED' | 'DEFERRED'>, actorUserId: string, now = new Date().toISOString()): CraftRuleAdjustmentProposal {
  if (!['READY_FOR_REVIEW', 'DRAFT', 'DEFERRED'].includes(proposal.status)) throw new ListingCalibrationError('PROPOSAL_NOT_REVIEWABLE', 'This rule proposal cannot be reviewed.', 409);
  return immutableCopy({ ...proposal, version: proposal.version + 1, status, approvedBy: status === 'APPROVED' ? actorUserId : null, reviewedAt: now }) as CraftRuleAdjustmentProposal;
}
