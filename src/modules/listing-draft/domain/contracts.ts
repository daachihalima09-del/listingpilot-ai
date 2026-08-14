import type { GenerationInstructions } from '../../generation-instructions/domain/contracts.ts';
import type { CraftComplianceFinding, CraftInstructionProjection, CraftValidationOutcome } from '../../listing-craft/index.ts';

export const LISTING_DRAFT_SCHEMA_VERSION = 1 as const;
export const LISTING_DRAFT_VERSION = '1.0.0' as const;

export interface DraftTextField {
  readonly value: string;
  readonly factIds: readonly string[];
}

export interface DraftSpecification extends DraftTextField {
  readonly label: string;
}

export interface DraftMetafield extends DraftTextField {
  readonly namespace: string;
  readonly key: string;
  readonly type: string;
}

export interface DraftMediaAltText {
  readonly imageReference: string;
  readonly altText: string;
  readonly factIds: readonly string[];
}

export interface ListingDraftProviderOutput {
  readonly title: DraftTextField;
  readonly overview: DraftTextField;
  readonly specifications: readonly DraftSpecification[];
  readonly features: readonly DraftTextField[];
  readonly whatsIncluded: readonly DraftTextField[];
  readonly seo: Readonly<{
    title: DraftTextField;
    description: DraftTextField;
    handle: DraftTextField;
  }>;
  readonly catalog: Readonly<{
    tags: readonly DraftTextField[];
    collections: readonly DraftTextField[];
    productType: DraftTextField;
    vendor: DraftTextField;
  }>;
  readonly metafields: readonly DraftMetafield[];
  readonly media: readonly DraftMediaAltText[];
  readonly reviewNotes: readonly string[];
  readonly confidence: Readonly<{
    overall: number;
    summary: string;
    fieldNotes: readonly string[];
  }>;
}

export type DraftReviewTab = 'LISTING' | 'REVIEW' | 'ADVANCED';
export type DraftReviewSection =
  | 'TITLE'
  | 'OVERVIEW'
  | 'SPECIFICATIONS'
  | 'FEATURES'
  | 'SEO'
  | 'CATALOG'
  | 'METAFIELDS'
  | 'MEDIA';
export type DraftRegenerationSection = 'TITLE' | 'DESCRIPTION' | 'FEATURES' | 'SEO';

export interface DraftTraceFact {
  readonly factId: string;
  readonly fieldId?: string;
  readonly label: string;
  readonly value: string;
  readonly source: string;
  readonly confidence: number;
  readonly status: string;
  readonly truthStatus?: string;
  readonly allowedUses: readonly string[];
  readonly sourceAuthority?: Readonly<{
    category: string;
    displayLabel: string;
    authorityLevel: string;
    verificationStatus: string;
    limitations: readonly string[];
  }>;
}

export interface DraftFieldTrace {
  readonly fieldKey: string;
  readonly label: string;
  readonly factIds: readonly string[];
  readonly source: string;
  readonly confidence: number;
  readonly rule: string;
  readonly merchantProfile: string;
  readonly productIntelligence: string;
}

export interface DraftComparison {
  readonly section: DraftRegenerationSection;
  readonly previous: string;
  readonly current: string;
  readonly changedFields: readonly string[];
  readonly merchantEditedFields: readonly string[];
  readonly createdAt: string;
}

export interface ListingDraftReviewWorkspace {
  readonly lockedFields: readonly string[];
  readonly reviewedSections: readonly DraftReviewSection[];
  readonly editedFields: readonly string[];
  readonly traceability: readonly DraftFieldTrace[];
  readonly facts: readonly DraftTraceFact[];
  readonly comparison: DraftComparison | null;
  readonly advanced: Readonly<{
    localization: readonly string[];
    publishingConstraints: readonly string[];
    aiPolicySummary: readonly string[];
  }>;
  readonly policy: Readonly<{
    titleMaximum: number;
    seoTitleMaximum: number;
    seoDescriptionMaximum: number;
    prohibitedTerms: readonly string[];
    lockedHandle: string | null;
  }>;
  readonly craft?: Readonly<{
    packId: string;
    packVersion: string;
    displayName: string;
    status: CraftValidationOutcome;
    findings: readonly CraftComplianceFinding[];
    explanations: readonly string[];
    featureTargetCount?: number;
    rules: CraftInstructionProjection;
  }>;
}

export interface ListingDraft extends ListingDraftProviderOutput {
  readonly draftId: string;
  readonly schemaVersion: 1;
  readonly draftVersion: '1.0.0';
  readonly projectId: string;
  readonly workspaceId: string;
  readonly sourceInstructionFingerprint: string;
  readonly providerRequestId: string | null;
  readonly status: 'GENERATED' | 'EDITED' | 'SAVED';
  readonly warnings: readonly string[];
  readonly productTruthSummary: readonly string[];
  readonly aiDetectiveSummary: readonly string[];
  readonly reviewWorkspace?: ListingDraftReviewWorkspace;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<{
    generationStatus: GenerationInstructions['sourcePlan']['generationStatus'];
    selectedFactCount: number;
    merchantEdited: boolean;
    listingStandardId?: string;
    listingProfileVersion?: number;
    listingProfileFingerprint?: string;
    descriptionStructure?: string;
    styleComplianceStatus?: 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'REJECTED';
    styleFindingCount?: number;
    craftPackId?: string;
    craftPackVersion?: string;
    craftComplianceStatus?: CraftValidationOutcome;
    craftFindingSummary?: Readonly<{ errors: number; reviews: number; warnings: number; information: number }>;
  }>;
}

export interface GenerationProviderResult {
  readonly output: ListingDraftProviderOutput;
  readonly requestId: string | null;
}

export interface GenerationProvider {
  generate(
    instructions: GenerationInstructions,
    signal?: AbortSignal,
  ): Promise<GenerationProviderResult>;
}
