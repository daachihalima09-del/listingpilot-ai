import type {
  AnalysisScope,
  DetectorExecutionRecord,
  IntelligenceContext,
  IntelligenceIssue,
  IssueCategory,
} from '../domain/types.ts';

export interface DetectorMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly issueCategories: readonly IssueCategory[];
  readonly supportedScopes: readonly AnalysisScope[];
  readonly requiredCapabilities: readonly string[];
  readonly compatibleKnowledgePacks?: readonly string[];
  readonly priority: number;
  readonly timeoutMs?: number;
  readonly parallelSafe: boolean;
  readonly enabled: boolean;
  readonly deterministic: boolean;
}

export interface DetectorResult {
  readonly issues: readonly IntelligenceIssue[];
  readonly warnings: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface IntelligenceDetector {
  readonly metadata: DetectorMetadata;
  execute(context: IntelligenceContext): DetectorResult | Promise<DetectorResult>;
}

export interface SkippedDetector {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly reasonCode:
    | 'DISABLED'
    | 'UNSUPPORTED_SCOPE'
    | 'MISSING_CAPABILITY'
    | 'INCOMPATIBLE_KNOWLEDGE_PACK'
    | 'CANCELLED'
    | 'GLOBAL_TIMEOUT';
}

export interface DetectorRunOutput {
  readonly issues: readonly IntelligenceIssue[];
  readonly warnings: readonly string[];
  readonly executions: readonly DetectorExecutionRecord[];
  readonly skipped: readonly SkippedDetector[];
  readonly failedDetectorIds: readonly string[];
}
