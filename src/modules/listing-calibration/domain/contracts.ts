import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { CraftInstructionProjection } from '../../listing-craft/index.ts';

export const GOLD_FIXTURE_SCHEMA_VERSION = 1 as const;
export const GOLD_FIXTURE_VERSION = '1.0.0' as const;
export const CALIBRATION_REPORT_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_REPORT_VERSION = '1.0.0' as const;
export const CRAFT_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const CRAFT_PROPOSAL_VERSION = '1.0.0' as const;

export type GoldFixtureStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'DEPRECATED' | 'REJECTED';
export type CalibrationReportStatus = 'EXCELLENT_MATCH' | 'GOOD_MATCH' | 'NEEDS_CALIBRATION' | 'POOR_MATCH' | 'INVALID_COMPARISON' | 'BLOCKED';
export type CalibrationDifferenceType = 'MATCH' | 'ACCEPTABLE_VARIATION' | 'MISSING_EXPECTED_CONTENT' | 'UNEXPECTED_CONTENT' | 'STRUCTURAL_DIFFERENCE' | 'WORDING_DIFFERENCE' | 'FACTUAL_CONFLICT' | 'IDENTITY_CONFLICT' | 'PRIORITY_MISMATCH' | 'DUPLICATION' | 'PROHIBITED_LANGUAGE' | 'PRODUCT_SPECIFIC_EXCEPTION' | 'MERCHANT_PREFERENCE_DIFFERENCE';
export type CalibrationSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CalibrationSection = 'TITLE' | 'SPECIFICATIONS' | 'OVERVIEW' | 'FEATURES' | 'IDENTITY' | 'DUPLICATION' | 'WORDING';
export type MerchantEditType = 'FACTUAL_CORRECTION' | 'STYLE_PREFERENCE' | 'STRUCTURAL_IMPROVEMENT' | 'CATEGORY_SPECIFIC_IMPROVEMENT' | 'PRODUCT_SPECIFIC_EXCEPTION' | 'SEO_ONLY_CHANGE' | 'CATALOG_ONLY_CHANGE' | 'LOCKED_CONTENT_PREFERENCE' | 'UNSUPPORTED_FACT_ADDITION' | 'NOISE_OR_NON_REUSABLE_CHANGE';
export type ProposalType = 'CHANGE_PRIORITY' | 'CHANGE_MINIMUM' | 'CHANGE_MAXIMUM' | 'CHANGE_ORDER' | 'ADD_PROHIBITED_TERM' | 'REMOVE_PROHIBITED_TERM' | 'ADD_REQUIRED_COMPONENT' | 'REMOVE_REQUIRED_COMPONENT' | 'CHANGE_DUPLICATION_POLICY' | 'CHANGE_WORDING_POLICY' | 'ADD_CATEGORY_GUIDANCE' | 'ADD_ALLOWED_VARIATION';
export type ProposalStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'APPLIED_EXTERNALLY';

export interface GoldTextField { readonly value: string; readonly factIds: readonly string[] }
export interface GoldSpecification extends GoldTextField { readonly label: string }
export interface ProductSpecificException {
  readonly exceptionId: string;
  readonly scope: 'FIXTURE' | 'CATEGORY';
  readonly reason: string;
  readonly affectedFields: readonly string[];
  readonly temporaryOrPermanent: 'TEMPORARY' | 'PERMANENT';
  readonly merchantApproved: boolean;
}
export interface MerchantOverrideReference { readonly overrideId: string; readonly value: string; readonly reason: string; readonly approvedBy: string }

export interface NeovixGoldFixture {
  readonly fixtureId: string;
  readonly schemaVersion: 1;
  readonly fixtureVersion: '1.0.0';
  readonly version: number;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly productIdentity: Readonly<{ brand: string | null; model: string | null; productType: string | null; variant: string | null }>;
  readonly sourceProjectId: string;
  readonly sourceDraftId: string;
  readonly productTruthFingerprint: string;
  readonly productTruthFacts: readonly Readonly<{ factId: string; fieldId: string; value: string; status: string }>[];
  readonly merchantOverrides: readonly MerchantOverrideReference[];
  readonly productIntelligencePack: Readonly<{ id: string; version: string; categoryId: string } | null>;
  readonly craftPackId: string;
  readonly craftPackVersion: string;
  readonly expectedTitle: GoldTextField;
  readonly expectedSpecifications: readonly GoldSpecification[];
  readonly expectedOverview: GoldTextField;
  readonly expectedFeatures: readonly GoldTextField[];
  readonly expectedSeo: Readonly<{ title: GoldTextField; description: GoldTextField; handle: GoldTextField }>;
  readonly expectedCatalog: Readonly<{ productType: GoldTextField; vendor: GoldTextField; collections: readonly GoldTextField[]; tags: readonly GoldTextField[] }>;
  readonly requiredBehaviors: readonly string[];
  readonly prohibitedBehaviors: readonly string[];
  readonly allowedVariations: readonly string[];
  readonly productSpecificExceptions: readonly ProductSpecificException[];
  readonly merchantNotes: readonly string[];
  readonly approvalStatus: GoldFixtureStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly metadata: Readonly<{ lastCalibrationScore: number | null }>;
}

export interface CalibrationFinding {
  readonly findingId: string;
  readonly section: CalibrationSection;
  readonly field: string;
  readonly differenceType: CalibrationDifferenceType;
  readonly severity: CalibrationSeverity;
  readonly message: string;
  readonly expected: string | null;
  readonly actual: string | null;
  readonly relatedFactIds: readonly string[];
  readonly craftRuleId: string | null;
  readonly reusableSignal: boolean;
  readonly productSpecific: boolean;
  readonly scorePenalty: number;
}

export interface CalibrationSectionScore {
  readonly score: number;
  readonly weight: number;
  readonly factors: readonly string[];
}
export interface CalibrationScore {
  readonly overall: number;
  readonly titleScore: CalibrationSectionScore;
  readonly specificationScore: CalibrationSectionScore;
  readonly overviewScore: CalibrationSectionScore;
  readonly featureScore: CalibrationSectionScore;
  readonly identityScore: CalibrationSectionScore;
  readonly duplicationScore: CalibrationSectionScore;
  readonly wordingScore: CalibrationSectionScore;
}
export interface MerchantEditClassification { readonly field: string; readonly type: MerchantEditType; readonly explanation: string; readonly reusableSignal: boolean; readonly relatedFactIds: readonly string[] }

export interface CraftRuleAdjustmentProposal {
  readonly proposalId: string;
  readonly schemaVersion: 1;
  readonly proposalVersion: '1.0.0';
  readonly version: number;
  readonly workspaceId: string;
  readonly craftPackId: string;
  readonly currentCraftPackVersion: string;
  readonly targetRuleId: string;
  readonly proposalType: ProposalType;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
  readonly reason: string;
  readonly supportingFixtureIds: readonly string[];
  readonly supportingFindingIds: readonly string[];
  readonly contradictingFixtureIds: readonly string[];
  readonly confidence: number;
  readonly impact: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly risk: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly scope: 'GLOBAL_CRAFT_PACK' | 'CATEGORY';
  readonly status: ProposalStatus;
  readonly createdBy: string;
  readonly approvedBy: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly fingerprint: string;
  readonly metadata: Readonly<{ signalCount: number; contradictingRatio: number }>;
}

export interface ListingCalibrationInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly draft: ListingDraft;
  readonly goldFixture: NeovixGoldFixture;
  readonly productTruthReference: Readonly<{ fingerprint: string; facts: NeovixGoldFixture['productTruthFacts'] }>;
  readonly productIntelligenceReference: NeovixGoldFixture['productIntelligencePack'];
  readonly craftPackReference: Readonly<{ id: string; version: string; rules: CraftInstructionProjection }>;
  readonly merchantProfileReferences: Readonly<Record<string, string>>;
  readonly reviewWorkspaceState: ListingDraft['reviewWorkspace'];
  readonly lockedFields: readonly string[];
  readonly merchantEdits: readonly string[];
  readonly comparisonOptions: Readonly<{ allowSemanticVariation: boolean; includeSeo: boolean }>;
}

export interface ListingCalibrationReport {
  readonly reportId: string;
  readonly schemaVersion: 1;
  readonly reportVersion: '1.0.0';
  readonly version: number;
  readonly workspaceId: string;
  readonly fixtureId: string;
  readonly projectId: string;
  readonly draftId: string;
  readonly craftPackId: string;
  readonly craftPackVersion: string;
  readonly overallScore: number;
  readonly sectionScores: CalibrationScore;
  readonly status: CalibrationReportStatus;
  readonly findings: readonly CalibrationFinding[];
  readonly matchedBehaviors: readonly string[];
  readonly missedBehaviors: readonly string[];
  readonly prohibitedBehaviorMatches: readonly string[];
  readonly productSpecificExceptionsApplied: readonly string[];
  readonly merchantEditClassifications: readonly MerchantEditClassification[];
  readonly ruleAdjustmentProposals: readonly CraftRuleAdjustmentProposal[];
  readonly reviewRequirements: readonly string[];
  readonly fingerprint: string;
  readonly createdAt: string;
  readonly metadata: Readonly<{ fixtureFingerprint: string; productTruthFingerprint: string; craftVersionMismatch: boolean }>;
}

export interface ProposalThresholds { readonly minimumApprovedFixtures: number; readonly minimumRepeatedSignalCount: number; readonly minimumProposalConfidence: number; readonly maximumContradictingFixtureRatio: number }
export const DEFAULT_PROPOSAL_THRESHOLDS: ProposalThresholds = Object.freeze({ minimumApprovedFixtures: 3, minimumRepeatedSignalCount: 3, minimumProposalConfidence: 0.75, maximumContradictingFixtureRatio: 0.2 });
