export type AnalysisScope = 'SINGLE_PRODUCT' | 'SELECTED_PRODUCTS' | 'FULL_CATALOG';
export type SourceType =
  | 'MANUAL'
  | 'CSV'
  | 'COMMERCE_PLATFORM'
  | 'MARKETPLACE'
  | 'SUPPLIER_WEBSITE'
  | 'DOCUMENT'
  | 'OTHER';
export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';
export type EvidenceType =
  | 'SOURCE_VALUE'
  | 'DOCUMENT_CLAIM'
  | 'OBSERVATION'
  | 'HUMAN_REVIEW'
  | 'DERIVED_INTERPRETATION';
export type EvidenceReliability = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OFFICIAL';
export type IssueCategory =
  | 'PRODUCT_TRUTH'
  | 'DATA_QUALITY'
  | 'CATALOG_HEALTH'
  | 'SEO'
  | 'SPECIFICATION'
  | 'MEDIA'
  | 'VARIANT'
  | 'PRICING'
  | 'OTHER';
export type IssueSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED' | 'SUPPRESSED';
export type IssueScope = 'FIELD' | 'VARIANT' | 'PRODUCT' | 'CATALOG';
export type RecommendationActionType =
  | 'REVIEW'
  | 'ADD'
  | 'UPDATE'
  | 'REMOVE'
  | 'VERIFY'
  | 'NO_ACTION';
export type RecommendationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type EstimatedImpact = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export type EstimatedEffort = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AutomationCapability = 'NONE' | 'SUGGEST_ONLY' | 'ASSISTED' | 'AUTOMATABLE';
export type ApprovalRequirement = 'NONE' | 'MERCHANT' | 'ADMIN';
export type DetectorExecutionStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'TIMED_OUT'
  | 'CANCELLED';
export type ValueType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'ENUM'
  | 'LIST'
  | 'OBJECT'
  | 'UNKNOWN';
export type ConfidenceLevel = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type EvidenceProviderType =
  | 'MERCHANT'
  | 'MANUFACTURER'
  | 'RETAILER'
  | 'DOCUMENT'
  | 'HUMAN'
  | 'AI_DERIVED'
  | 'OTHER';

export type ExtensionMetadata = Readonly<Record<string, unknown>>;

export interface SourceReference {
  readonly sourceType: SourceType;
  readonly externalId?: string;
  readonly externalParentId?: string;
  readonly url?: string;
  readonly label?: string;
  readonly retrievedAt: string;
  readonly metadata: ExtensionMetadata;
}

export interface ConfidenceFactor {
  readonly code: string;
  readonly label: string;
  readonly contribution: number;
  readonly explanation: string;
  readonly metadata: ExtensionMetadata;
}

export interface ConfidenceResult {
  readonly value: number;
  readonly level: ConfidenceLevel;
  readonly strategyVersion: string;
  readonly factors: readonly ConfidenceFactor[];
}

export interface Evidence {
  readonly id: string;
  readonly providerId: string;
  readonly type: EvidenceType;
  readonly sourceReference?: SourceReference;
  readonly claim: string;
  readonly affectedField?: string;
  readonly rawValue?: unknown;
  readonly normalizedValue?: unknown;
  readonly reliability: EvidenceReliability;
  readonly freshness: number;
  readonly priority: number;
  readonly retrievedAt: string;
  readonly metadata: ExtensionMetadata;
}

export interface NormalizedSpecification {
  readonly key: string;
  readonly label: string;
  readonly rawValue?: unknown;
  readonly normalizedValue?: unknown;
  readonly unit?: string;
  readonly valueType: ValueType;
  readonly namespace?: string;
  readonly evidenceIds: readonly string[];
  readonly confidence?: ConfidenceResult;
}

export interface NormalizedVariant {
  readonly id: string;
  readonly sourceReferences: readonly SourceReference[];
  readonly title?: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly options: Readonly<Record<string, string>>;
  readonly price?: string;
  readonly compareAtPrice?: string;
  readonly inventoryAttributes: ExtensionMetadata;
  readonly measurementMetadata: ExtensionMetadata;
  readonly attributes: ExtensionMetadata;
  readonly evidenceIds: readonly string[];
}

export interface NormalizedMedia {
  readonly id: string;
  readonly type: MediaType;
  readonly url?: string;
  readonly sourceReference?: SourceReference;
  readonly altText?: string;
  readonly position: number;
  readonly width?: number;
  readonly height?: number;
  readonly sourceIdentity?: string;
  readonly evidenceIds: readonly string[];
}

export interface NormalizedSeo {
  readonly title?: string;
  readonly description?: string;
  readonly handle?: string;
  readonly canonicalUrl?: string;
  readonly evidenceIds: readonly string[];
}

export interface NormalizedProduct {
  readonly id: string;
  readonly sourceReferences: readonly SourceReference[];
  readonly title: string;
  readonly description?: string;
  readonly vendor?: string;
  readonly productType?: string;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly status?: string;
  readonly specifications: readonly NormalizedSpecification[];
  readonly variants: readonly NormalizedVariant[];
  readonly media: readonly NormalizedMedia[];
  readonly seo: NormalizedSeo;
  readonly attributes: ExtensionMetadata;
  readonly evidenceIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt?: string;
  readonly extensions: ExtensionMetadata;
}

export interface IntelligenceIssue {
  readonly id: string;
  readonly fingerprint: string;
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly code: string;
  readonly title: string;
  readonly explanation: string;
  readonly category: IssueCategory;
  readonly severity: IssueSeverity;
  readonly status: IssueStatus;
  readonly scope: IssueScope;
  readonly affectedProductIds: readonly string[];
  readonly affectedVariantIds: readonly string[];
  readonly affectedFields: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly confidence?: ConfidenceResult;
  readonly recommendationIds: readonly string[];
  readonly metadata: ExtensionMetadata;
  readonly createdAt: string;
}

export interface ProposedValue {
  readonly field: string;
  readonly value: unknown;
}

export interface IntelligenceRecommendation {
  readonly id: string;
  readonly fingerprint: string;
  readonly issueIds: readonly string[];
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly title: string;
  readonly explanation: string;
  readonly actionType: RecommendationActionType;
  readonly affectedFields: readonly string[];
  readonly proposedValues: readonly ProposedValue[];
  readonly priority: RecommendationPriority;
  readonly estimatedImpact: EstimatedImpact;
  readonly estimatedEffort: EstimatedEffort;
  readonly riskLevel: RiskLevel;
  readonly automationCapability: AutomationCapability;
  readonly approvalRequirement: ApprovalRequirement;
  readonly confidence?: ConfidenceResult;
  readonly metadata: ExtensionMetadata;
}

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
  readonly reason?: string;
}

export interface IntelligenceMerchantSettings {
  readonly locale?: string;
  readonly currency?: string;
  readonly values: ExtensionMetadata;
}

export interface ConfidenceThresholds {
  readonly veryLowMaximum: number;
  readonly lowMaximum: number;
  readonly mediumMaximum: number;
  readonly highMaximum: number;
}

export interface IntelligenceAnalysisOptions {
  readonly failFast: boolean;
  readonly detectorTimeoutMs: number;
  readonly globalTimeoutMs: number;
  readonly disabledDetectorIds: readonly string[];
  readonly enabledDetectorIds?: readonly string[];
}

export interface IntelligenceExecutionMetadata {
  readonly executionId: string;
  readonly engineVersion: string;
  readonly requestedAt: string;
  readonly metadata: ExtensionMetadata;
}

export interface IntelligenceContext {
  readonly workspaceId: string;
  readonly catalogId: string;
  readonly analysisScope: AnalysisScope;
  readonly products: readonly NormalizedProduct[];
  readonly knowledgePackIds: readonly string[];
  readonly capabilityPackIds: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly merchantSettings: IntelligenceMerchantSettings;
  readonly confidenceThresholds: ConfidenceThresholds;
  readonly options: IntelligenceAnalysisOptions;
  readonly execution: IntelligenceExecutionMetadata;
  readonly cancellation: CancellationSignal;
}

export interface DetectorExecutionRecord {
  readonly detectorId: string;
  readonly detectorVersion: string;
  readonly status: DetectorExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly issueCount: number;
  readonly warningCount: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly metadata?: ExtensionMetadata;
  readonly reasonCode?: string;
}

export interface IntelligenceReportSummary {
  readonly issueCount: number;
  readonly recommendationCount: number;
  readonly affectedProductCount: number;
  readonly failedDetectorCount: number;
  readonly skippedDetectorCount: number;
}

export interface IntelligenceReport {
  readonly id: string;
  readonly schemaVersion: string;
  readonly engineVersion: string;
  readonly executionId: string;
  readonly workspaceId: string;
  readonly catalogId: string;
  readonly analysisScope: AnalysisScope;
  readonly productCount: number;
  readonly issues: readonly IntelligenceIssue[];
  readonly recommendations: readonly IntelligenceRecommendation[];
  readonly summary: IntelligenceReportSummary;
  readonly severityStatistics: Readonly<Record<IssueSeverity, number>>;
  readonly categoryStatistics: Readonly<Record<IssueCategory, number>>;
  readonly detectorStatistics: readonly DetectorExecutionRecord[];
  readonly confidenceSummary: Readonly<Record<ConfidenceLevel, number>>;
  readonly executionTimings: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly skippedDetectors: readonly string[];
  readonly failedDetectors: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly fingerprint: string;
  readonly metadata?: ExtensionMetadata;
}
