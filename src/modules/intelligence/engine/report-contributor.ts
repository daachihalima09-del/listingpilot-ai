import type {
  DetectorExecutionRecord,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
} from '../domain/types.ts';

export interface IntelligenceReportContributionInput {
  readonly context: IntelligenceContext;
  readonly issues: readonly IntelligenceIssue[];
  readonly recommendations: readonly IntelligenceRecommendation[];
  readonly detectorExecutions: readonly DetectorExecutionRecord[];
  readonly priorContributions?: Readonly<Record<string, unknown>>;
}

export interface IntelligenceReportContributor {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly metadataKey: string;
  readonly enabled: boolean;
  contribute(
    input: IntelligenceReportContributionInput,
  ): unknown | Promise<unknown>;
}
