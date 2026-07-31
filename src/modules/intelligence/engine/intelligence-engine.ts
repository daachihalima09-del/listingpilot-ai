import type { ConfidenceStrategy } from '../confidence/confidence.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceLevel,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  IntelligenceReport,
  IssueCategory,
  IssueSeverity,
} from '../domain/types.ts';
import {
  createIntelligenceContext,
  validateConfidence,
  validateIntelligenceContext,
} from '../domain/validation.ts';
import type { IntelligenceRuntimeServices } from '../deterministic/services.ts';
import { DetectorRegistry } from '../detectors/registry.ts';
import { DetectorRunner } from '../detectors/runner.ts';
import { suppressDuplicateIssues } from '../issues/suppression.ts';
import { CapabilityPackRegistry } from '../packs/capability.ts';
import { KnowledgePackRegistry } from '../packs/knowledge.ts';
import { RecommendationEngine } from '../recommendations/engine.ts';
import { IntelligenceDomainError } from '../domain/errors.ts';
import type { IntelligenceReportContributor } from './report-contributor.ts';

const severityValues: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const categoryValues: readonly IssueCategory[] = [
  'PRODUCT_TRUTH',
  'DATA_QUALITY',
  'CATALOG_HEALTH',
  'SEO',
  'SPECIFICATION',
  'MEDIA',
  'VARIANT',
  'PRICING',
  'OTHER',
];
const confidenceValues: readonly ConfidenceLevel[] = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];

export interface IntelligenceEngineDependencies {
  readonly detectorRegistry: DetectorRegistry;
  readonly knowledgePackRegistry: KnowledgePackRegistry;
  readonly capabilityPackRegistry: CapabilityPackRegistry;
  readonly recommendationEngine: RecommendationEngine;
  readonly confidenceStrategy: ConfidenceStrategy;
  readonly runtime: IntelligenceRuntimeServices;
  readonly reportContributors?: readonly IntelligenceReportContributor[];
}

export interface IntelligenceEngineConfiguration {
  readonly engineVersion: string;
  readonly reportSchemaVersion: string;
}

function countBy<T extends string>(
  values: readonly T[],
  selected: readonly T[],
): Readonly<Record<T, number>> {
  return Object.freeze(Object.fromEntries(
    values.map((value) => [value, selected.filter((item) => item === value).length]),
  ) as Record<T, number>);
}

function stableIssueForReport(issue: IntelligenceIssue): Omit<IntelligenceIssue, 'id' | 'createdAt'> {
  const { id, createdAt, ...stable } = issue;
  void id;
  void createdAt;
  return stable;
}

function stableRecommendationForReport(
  recommendation: IntelligenceRecommendation,
): Omit<IntelligenceRecommendation, 'id'> {
  const { id, ...stable } = recommendation;
  void id;
  return stable;
}

export class IntelligenceEngine {
  private readonly dependencies: IntelligenceEngineDependencies;
  private readonly configuration: IntelligenceEngineConfiguration;
  private readonly runner: DetectorRunner;

  constructor(
    dependencies: IntelligenceEngineDependencies,
    configuration: IntelligenceEngineConfiguration,
  ) {
    this.dependencies = dependencies;
    this.configuration = configuration;
    this.runner = new DetectorRunner(dependencies.detectorRegistry, dependencies.runtime);
  }

  async analyze(untrustedContext: IntelligenceContext): Promise<IntelligenceReport> {
    validateIntelligenceContext(untrustedContext);
    const context = this.resolveContext(createIntelligenceContext(untrustedContext));
    const startedAt = this.dependencies.runtime.clock.now();
    const startedMs = this.dependencies.runtime.clock.nowMilliseconds();

    const detectorStart = this.dependencies.runtime.clock.nowMilliseconds();
    const detectorOutput = await this.runner.run(context);
    const detectorDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - detectorStart,
    );

    const suppressionStart = this.dependencies.runtime.clock.nowMilliseconds();
    const suppressed = suppressDuplicateIssues({
      issues: detectorOutput.issues,
      evidence: context.evidence,
      hasher: this.dependencies.runtime.hasher,
    });
    const suppressionDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - suppressionStart,
    );

    const recommendationStart = this.dependencies.runtime.clock.nowMilliseconds();
    const recommendations = await this.dependencies.recommendationEngine.generate(
      suppressed.issues,
      context,
    );
    const recommendationDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - recommendationStart,
    );

    const confidenceStart = this.dependencies.runtime.clock.nowMilliseconds();
    const issuesWithConfidence = suppressed.issues.map((issue) => this.attachIssueConfidence(issue, context));
    const recommendationsWithConfidence = recommendations.map(
      (recommendation) => this.attachRecommendationConfidence(recommendation, issuesWithConfidence, context),
    );
    const confidenceDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - confidenceStart,
    );

    const contributionStart = this.dependencies.runtime.clock.nowMilliseconds();
    const reportMetadata = await this.createReportMetadata({
      context,
      issues: issuesWithConfidence,
      recommendations: recommendationsWithConfidence,
      detectorExecutions: detectorOutput.executions,
    });
    const contributionDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - contributionStart,
    );

    const completedAt = this.dependencies.runtime.clock.now();
    const totalDuration = Math.max(
      0,
      this.dependencies.runtime.clock.nowMilliseconds() - startedMs,
    );
    const failedDetectors = [...detectorOutput.failedDetectorIds].sort();
    const skippedDetectors = detectorOutput.skipped.map(({ detectorId }) => detectorId).sort();
    const affectedProducts = new Set(issuesWithConfidence.flatMap(({ affectedProductIds }) => affectedProductIds));
    const reportFingerprint = this.dependencies.runtime.hasher.hash({
      engineVersion: this.configuration.engineVersion,
      reportSchemaVersion: this.configuration.reportSchemaVersion,
      workspaceId: context.workspaceId,
      catalogId: context.catalogId,
      analysisScope: context.analysisScope,
      productIds: context.products.map(({ id }) => id).sort(),
      issues: issuesWithConfidence.map(stableIssueForReport),
      recommendations: recommendationsWithConfidence.map(stableRecommendationForReport),
      ...(Object.keys(reportMetadata).length > 0
        ? { reportMetadata }
        : {}),
      failedDetectors,
      skippedDetectors,
    });
    const report: IntelligenceReport = {
      id: this.dependencies.runtime.ids.nextId('report'),
      schemaVersion: this.configuration.reportSchemaVersion,
      engineVersion: this.configuration.engineVersion,
      executionId: context.execution.executionId,
      workspaceId: context.workspaceId,
      catalogId: context.catalogId,
      analysisScope: context.analysisScope,
      productCount: context.products.length,
      issues: issuesWithConfidence,
      recommendations: recommendationsWithConfidence,
      summary: {
        issueCount: issuesWithConfidence.length,
        recommendationCount: recommendationsWithConfidence.length,
        affectedProductCount: affectedProducts.size,
        failedDetectorCount: failedDetectors.length,
        skippedDetectorCount: skippedDetectors.length,
      },
      severityStatistics: countBy(severityValues, issuesWithConfidence.map(({ severity }) => severity)),
      categoryStatistics: countBy(categoryValues, issuesWithConfidence.map(({ category }) => category)),
      detectorStatistics: detectorOutput.executions,
      confidenceSummary: countBy(
        confidenceValues,
        issuesWithConfidence.map(({ confidence }) => confidence!.level),
      ),
      executionTimings: {
        detectors: detectorDuration,
        duplicateSuppression: suppressionDuration,
        recommendations: recommendationDuration,
        confidence: confidenceDuration,
        ...(Object.keys(reportMetadata).length > 0
          ? { reportContributors: contributionDuration }
          : {}),
        total: totalDuration,
      },
      warnings: [
        ...detectorOutput.warnings,
        ...(suppressed.suppressedCount ? [`Suppressed ${suppressed.suppressedCount} duplicate issue(s).`] : []),
      ],
      skippedDetectors,
      failedDetectors,
      startedAt,
      completedAt,
      fingerprint: reportFingerprint,
      ...(Object.keys(reportMetadata).length > 0
        ? { metadata: reportMetadata }
        : {}),
    };
    return immutableCopy(report) as IntelligenceReport;
  }

  private async createReportMetadata(
    input: Omit<
    Parameters<IntelligenceReportContributor['contribute']>[0],
    'priorContributions'
    >,
  ): Promise<Readonly<Record<string, unknown>>> {
    const metadata: Record<string, unknown> = {};
    const contributors = [...(this.dependencies.reportContributors ?? [])]
      .filter(({ enabled }) => enabled)
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
    for (const contributor of contributors) {
      if (!contributor.id.trim() || !contributor.version.trim() || !contributor.metadataKey.trim()) {
        throw new IntelligenceDomainError(
          'INVALID_IDENTITY',
          'Report contributors require stable identity, version, and metadata key.',
        );
      }
      if (Object.hasOwn(metadata, contributor.metadataKey)) {
        throw new IntelligenceDomainError(
          'DUPLICATE_REGISTRY_ENTRY',
          'Report contributors cannot write the same metadata key.',
          { key: contributor.metadataKey },
        );
      }
      const value = await contributor.contribute({
        ...input,
        priorContributions: Object.freeze({ ...metadata }),
      });
      if (value !== undefined) metadata[contributor.metadataKey] = value;
    }
    return Object.freeze(metadata);
  }

  private resolveContext(context: IntelligenceContext): IntelligenceContext {
    const requestedKnowledge = context.knowledgePackIds.length
      ? this.dependencies.knowledgePackRegistry.resolve(context.knowledgePackIds)
      : [...new Map(
        context.products.flatMap(({ categories }) => categories)
          .flatMap((category) => this.dependencies.knowledgePackRegistry.matchCategory(category))
          .map((pack) => [pack.id, pack]),
      ).values()];
    const capabilities = this.dependencies.capabilityPackRegistry.resolve(
      context.capabilityPackIds.length ? context.capabilityPackIds : undefined,
    );
    return createIntelligenceContext({
      ...context,
      knowledgePackIds: requestedKnowledge.map(({ id }) => id),
      capabilityPackIds: capabilities.map(({ id }) => id),
      execution: {
        ...context.execution,
        engineVersion: this.configuration.engineVersion,
      },
    });
  }

  private attachIssueConfidence(
    issue: IntelligenceIssue,
    context: IntelligenceContext,
  ): IntelligenceIssue {
    if (issue.confidence) {
      validateConfidence(issue.confidence);
      return issue;
    }
    const evidenceIds = new Set(issue.evidenceIds);
    return {
      ...issue,
      confidence: this.dependencies.confidenceStrategy.calculate({
        evidence: context.evidence.filter(({ id }) => evidenceIds.has(id)),
        thresholds: context.confidenceThresholds,
        metadata: { issueCode: issue.code },
      }),
    };
  }

  private attachRecommendationConfidence(
    recommendation: IntelligenceRecommendation,
    issues: readonly IntelligenceIssue[],
    context: IntelligenceContext,
  ): IntelligenceRecommendation {
    if (recommendation.confidence) {
      validateConfidence(recommendation.confidence);
      return recommendation;
    }
    const issueIds = new Set(recommendation.issueIds);
    const related = issues.filter(({ id }) => issueIds.has(id));
    const average = related.length
      ? related.reduce((total, issue) => total + issue.confidence!.value, 0) / related.length
      : undefined;
    return {
      ...recommendation,
      confidence: this.dependencies.confidenceStrategy.calculate({
        evidence: [],
        merchantOverride: average,
        thresholds: context.confidenceThresholds,
        metadata: { recommendationStrategyId: recommendation.strategyId },
      }),
    };
  }
}
