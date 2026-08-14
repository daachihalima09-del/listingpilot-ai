import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceLevel,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceReport,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import {
  PRODUCT_TRUTH_CAPABILITY_ID,
  PRODUCT_TRUTH_VERSION,
} from './configuration.ts';
import { productTruthRecommendationId } from './issues.ts';
import type {
  ProductTruthReport,
  TruthClaimGroup,
  TruthFinding,
  TruthResolution,
  TruthResolutionStatus,
} from './types.ts';
import { getPriorDetectorMetadata } from '../detectors/execution-metadata.ts';
import type { ProductIntelligenceAnalysisResult } from '../../product-intelligence/domain/contracts.ts';

const confidenceLevels: readonly ConfidenceLevel[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];
const resolutionStatuses: readonly TruthResolutionStatus[] = [
  'VERIFIED',
  'LIKELY',
  'CONFLICTED',
  'UNRESOLVED',
  'INSUFFICIENT_EVIDENCE',
  'MERCHANT_OVERRIDE',
  'NOT_APPLICABLE',
];

function findingsFor(input: {
  readonly groups: readonly TruthClaimGroup[];
  readonly resolutions: readonly TruthResolution[];
  readonly issues: readonly IntelligenceIssue[];
  readonly hasher: IntelligenceHasher;
}): readonly TruthFinding[] {
  const resolutions = new Map(input.resolutions.map((resolution) => [resolution.claimGroupId, resolution]));
  const issuesByGroup = new Map<string, IntelligenceIssue[]>();
  for (const issue of input.issues) {
    const groupId = typeof issue.metadata.claimGroupId === 'string' ? issue.metadata.claimGroupId : '';
    const group = issuesByGroup.get(groupId) ?? [];
    group.push(issue);
    issuesByGroup.set(groupId, group);
  }
  return input.groups.map((group) => {
    const resolution = resolutions.get(group.id);
    if (!resolution) throw new TypeError(`Missing Product Truth resolution for ${group.id}.`);
    const groupIssues = (issuesByGroup.get(group.id) ?? []).sort((left, right) => left.id.localeCompare(right.id));
    const materialCandidates = group.candidates.filter(({ confidenceContribution }) => confidenceContribution >= 0.48);
    const missingProvenanceCount = group.candidates.reduce(
      (total, candidate) => total + Number(candidate.metadata.missingProvenanceCount ?? 0),
      0,
    );
    const fingerprint = input.hasher.hash({
      groupId: group.id,
      status: resolution.status,
      selectedCandidateId: resolution.selectedCandidateId ?? null,
      candidateIds: group.candidates.map(({ id }) => id).sort(),
      confidence: resolution.confidence,
      issueIds: groupIssues.map(({ id }) => id),
    });
    return {
      id: `truth_finding_${fingerprint}`,
      productId: group.productId,
      ...(group.variantId ? { variantId: group.variantId } : {}),
      claimGroupId: group.id,
      fieldPath: group.affectedFieldPath,
      claimLabel: group.displayLabel,
      importance: group.importance,
      status: resolution.status,
      ...(resolution.selectedValue !== undefined ? { selectedValue: resolution.selectedValue } : {}),
      candidateValues: group.candidates.map(({ displayValue }) => displayValue),
      confidence: resolution.confidence,
      confidenceMeaning: resolution.confidenceMeaning,
      evidenceSummary: {
        evidenceCount: group.candidates.reduce((sum, candidate) => sum + candidate.evidenceCount, 0),
        independentSourceCount: new Set(group.candidates.flatMap((candidate) => (
          Array.isArray(candidate.metadata.independentSourceIds)
            ? candidate.metadata.independentSourceIds.filter((id): id is string => typeof id === 'string')
            : []
        ))).size,
        strongestAuthority: [...group.candidates].sort((left, right) => (
          right.authoritySummary.strongestWeight - left.authoritySummary.strongestWeight
          || left.id.localeCompare(right.id)
        ))[0]?.authoritySummary.strongestLevel ?? 'UNKNOWN',
        missingProvenanceCount,
      },
      conflictSummary: {
        materiallySupportedCandidateCount: materialCandidates.length,
        conflictingEvidenceCount: resolution.conflictingEvidenceIds.length,
        hasMaterialConflict: resolution.status === 'CONFLICTED'
          || resolution.conflictingEvidenceIds.length > 0,
      },
      explanation: resolution.explanation,
      reviewRequirement: resolution.reviewRequirement,
      associatedIssueIds: groupIssues.map(({ id }) => id),
      associatedRecommendationIds: groupIssues.map((issue) => productTruthRecommendationId(issue, input.hasher)),
      deterministicFingerprint: fingerprint,
      metadata: {
        resolutionId: resolution.id,
        strategyId: resolution.strategyId,
        strategyVersion: resolution.strategyVersion,
        capabilityVersion: resolution.capabilityVersion,
        supportingEvidenceIds: resolution.supportingEvidenceIds,
        conflictingEvidenceIds: resolution.conflictingEvidenceIds,
      },
    };
  });
}

export function getProductTruthReportFromContext(
  context: IntelligenceContext,
): ProductTruthReport | undefined {
  const value = getPriorDetectorMetadata(context, 'product-truth.analysis')?.productTruthReport;
  return value && typeof value === 'object'
    && (value as ProductTruthReport).capabilityId === PRODUCT_TRUTH_CAPABILITY_ID
    ? value as ProductTruthReport
    : undefined;
}

export function createProductTruthReport(input: {
  readonly context: IntelligenceContext;
  readonly claimCount: number;
  readonly groups: readonly TruthClaimGroup[];
  readonly resolutions: readonly TruthResolution[];
  readonly issues: readonly IntelligenceIssue[];
  readonly evidenceSourceDistribution: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly productIntelligence?: readonly ProductIntelligenceAnalysisResult[];
  readonly hasher: IntelligenceHasher;
}): ProductTruthReport {
  const findings = findingsFor(input);
  const statusCount = (status: TruthResolutionStatus) => findings.filter((finding) => finding.status === status).length;
  const strategyStatistics = Object.fromEntries([...new Set(input.resolutions.map(({ strategyId }) => strategyId))]
    .sort()
    .map((id) => [id, input.resolutions.filter(({ strategyId }) => strategyId === id).length]));
  const confidenceDistribution = Object.fromEntries(confidenceLevels.map((level) => [
    level,
    findings.filter(({ confidence }) => confidence.level === level).length,
  ]));
  const stable = {
    capabilityId: PRODUCT_TRUTH_CAPABILITY_ID,
    capabilityVersion: PRODUCT_TRUTH_VERSION,
    analysisScope: input.context.analysisScope,
    productIds: input.context.products.map(({ id }) => id).sort(),
    claimCount: input.claimCount,
    findings,
    statusStatistics: Object.fromEntries(resolutionStatuses.map((status) => [status, statusCount(status)])),
    evidenceSourceDistribution: input.evidenceSourceDistribution,
    strategyStatistics,
    warnings: [...new Set(input.warnings)].sort(),
    productIntelligence: input.productIntelligence ?? [],
  };
  return immutableCopy({
    schemaVersion: PRODUCT_TRUTH_VERSION,
    capabilityId: PRODUCT_TRUTH_CAPABILITY_ID,
    capabilityVersion: PRODUCT_TRUTH_VERSION,
    analysisScope: input.context.analysisScope,
    productCount: input.context.products.length,
    claimCount: input.claimCount,
    claimGroupCount: input.groups.length,
    resolvedCount: findings.filter(({ status }) => (
      status === 'VERIFIED' || status === 'LIKELY' || status === 'MERCHANT_OVERRIDE'
    )).length,
    verifiedCount: statusCount('VERIFIED'),
    likelyCount: statusCount('LIKELY'),
    conflictedCount: statusCount('CONFLICTED'),
    unresolvedCount: statusCount('UNRESOLVED'),
    insufficientEvidenceCount: statusCount('INSUFFICIENT_EVIDENCE'),
    merchantOverrideCount: statusCount('MERCHANT_OVERRIDE'),
    notApplicableCount: statusCount('NOT_APPLICABLE'),
    findings,
    productIntelligence: input.productIntelligence ?? [],
    confidenceDistribution,
    evidenceSourceDistribution: input.evidenceSourceDistribution,
    resolutionStrategyStatistics: strategyStatistics,
    warnings: [...new Set(input.warnings)].sort(),
    deterministicFingerprint: input.hasher.hash(stable),
    createdAt: input.context.execution.requestedAt,
  }) as ProductTruthReport;
}

export function getProductTruthReport(report: IntelligenceReport): ProductTruthReport | undefined {
  for (const execution of report.detectorStatistics) {
    const value = execution.metadata?.productTruthReport;
    if (value && typeof value === 'object'
      && (value as ProductTruthReport).capabilityId === PRODUCT_TRUTH_CAPABILITY_ID) {
      return value as ProductTruthReport;
    }
  }
  return undefined;
}
