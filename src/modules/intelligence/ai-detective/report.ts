import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceContext,
  IntelligenceReport,
  IssueSeverity,
} from '../domain/types.ts';
import { getAllPriorDetectorMetadata } from '../detectors/execution-metadata.ts';
import {
  AI_DETECTIVE_CAPABILITY_ID,
  AI_DETECTIVE_VERSION,
  type AIDetectiveConfiguration,
  CONTRADICTION_TYPES,
} from './configuration.ts';
import type {
  Contradiction,
  ContradictionType,
  DetectiveFinding,
  DetectiveReport,
} from './types.ts';

const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function reviewRequirement(
  contradiction: Contradiction,
  configuration: AIDetectiveConfiguration,
): DetectiveFinding['reviewRequirement'] {
  if (configuration.blockingContradictionTypes.includes(contradiction.type)) return 'BLOCKING';
  if (contradiction.severity === 'CRITICAL' || contradiction.severity === 'HIGH') return 'REQUIRED';
  return 'OPTIONAL';
}

export function createDetectiveFindings(input: {
  readonly contradictions: readonly Contradiction[];
  readonly configuration: AIDetectiveConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly DetectiveFinding[] {
  return [...input.contradictions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((contradiction): DetectiveFinding => {
      const requirement = reviewRequirement(contradiction, input.configuration);
      const fingerprint = input.hasher.hash({
        contradictionFingerprint: contradiction.fingerprint,
        reviewRequirement: requirement,
      });
      return {
        id: `detective_finding_${fingerprint}`,
        contradiction,
        status: 'OPEN',
        reviewRequirement: requirement,
        confidence: contradiction.confidence,
        explanation: contradiction.explanation,
        recommendationIds: contradiction.recommendationIds,
        fingerprint,
        metadata: {
          ruleId: contradiction.ruleId,
          ruleVersion: contradiction.ruleVersion,
          deterministic: true,
        },
      };
    });
}

export function createDetectiveReport(input: {
  readonly context: IntelligenceContext;
  readonly contradictions: readonly Contradiction[];
  readonly configuration: AIDetectiveConfiguration;
  readonly hasher: IntelligenceHasher;
  readonly warnings?: readonly string[];
}): DetectiveReport {
  const findings = createDetectiveFindings(input);
  const blockedProducts = [...new Set(findings
    .filter(({ reviewRequirement: requirement }) => requirement === 'BLOCKING')
    .flatMap(({ contradiction }) => contradiction.affectedProductIds))].sort();
  const contradictionsBySeverity = Object.fromEntries(severities.map((severity) => [
    severity,
    findings.filter(({ contradiction }) => contradiction.severity === severity).length,
  ])) as Record<IssueSeverity, number>;
  const contradictionsByType = Object.fromEntries(CONTRADICTION_TYPES.map((type) => [
    type,
    findings.filter(({ contradiction }) => contradiction.type === type).length,
  ])) as Record<ContradictionType, number>;
  const stable = {
    capabilityId: AI_DETECTIVE_CAPABILITY_ID,
    capabilityVersion: AI_DETECTIVE_VERSION,
    productIds: input.context.products.map(({ id }) => id).sort(),
    findings: findings.map(({ id, fingerprint, reviewRequirement: requirement }) => ({
      id,
      fingerprint,
      reviewRequirement: requirement,
    })),
    warnings: [...new Set(input.warnings ?? [])].sort(),
  };
  return immutableCopy({
    schemaVersion: AI_DETECTIVE_VERSION,
    capabilityId: AI_DETECTIVE_CAPABILITY_ID,
    capabilityVersion: AI_DETECTIVE_VERSION,
    productsAnalyzed: input.context.products.length,
    contradictionsFound: findings.length,
    contradictionsBySeverity,
    contradictionsByType,
    blockedProducts,
    reviewRequired: findings.filter(({ reviewRequirement: requirement }) => (
      requirement === 'REQUIRED' || requirement === 'BLOCKING'
    )).length,
    findings,
    warnings: [...new Set(input.warnings ?? [])].sort(),
    fingerprint: input.hasher.hash(stable),
    createdAt: input.context.execution.requestedAt,
  }) as DetectiveReport;
}

export function collectPriorContradictions(context: IntelligenceContext): readonly Contradiction[] {
  const contradictions = Object.values(getAllPriorDetectorMetadata(context))
    .flatMap((metadata) => (
      Array.isArray(metadata.aiDetectiveContradictions)
        ? metadata.aiDetectiveContradictions as Contradiction[]
        : []
    ));
  return [...new Map(contradictions.map((contradiction) => [
    contradiction.id,
    contradiction,
  ])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function getAIDetectiveReport(
  report: IntelligenceReport,
): DetectiveReport | undefined {
  for (const execution of report.detectorStatistics) {
    const value = execution.metadata?.detectiveReport;
    if (value && typeof value === 'object'
      && (value as DetectiveReport).capabilityId === AI_DETECTIVE_CAPABILITY_ID) {
      return value as DetectiveReport;
    }
  }
  return undefined;
}
