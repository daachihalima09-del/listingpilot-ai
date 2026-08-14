import type {
  GenerationReviewRequirement,
  ListingGenerationPlan,
  LockedGenerationField,
} from '../../listing-generation/domain/contracts.ts';
import type { CraftInstructionProjection, SourceAuthorityLabel } from '../../listing-craft/index.ts';
import type { FactVisibilityRole, RequiredFactPlacement } from './fact-roles.ts';

export const GENERATION_INSTRUCTION_SCHEMA_VERSION = 1 as const;
export const GENERATION_INSTRUCTION_VERSION = '1.0.0' as const;
export const GENERATION_INSTRUCTION_BUILDER_VERSION = '1.0.0' as const;

export type GenerationInstructionGroupName =
  | 'TITLE'
  | 'DESCRIPTION'
  | 'FEATURES'
  | 'SEO'
  | 'CATALOG'
  | 'METAFIELDS'
  | 'MEDIA'
  | 'LOCALIZATION'
  | 'SAFETY';

export interface AllowedFactInstruction {
  readonly factId: string;
  readonly fieldId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly value: string;
  readonly truthStatus: string;
  readonly confidence: number;
  readonly importance: string;
  readonly allowedUses: readonly string[];
  readonly visibilityRole: FactVisibilityRole;
  readonly requiredPlacements: readonly RequiredFactPlacement[];
  readonly evidenceRequirement: Readonly<{
    requirementLevel: string | null;
    verificationPolicy: string | null;
    highRisk: boolean;
    variantSensitivity: string | null;
    regionalSensitivity: boolean;
  }>;
  readonly sourceAuthority?: SourceAuthorityLabel;
}

export interface ProjectedReviewRequirement {
  readonly id: string;
  readonly type: GenerationReviewRequirement['type'];
  readonly priority: GenerationReviewRequirement['priority'];
  readonly blocking: boolean;
  readonly fieldIds: readonly string[];
  readonly reason: string;
  readonly relatedFactIds: readonly string[];
  readonly relatedProfileSection: GenerationReviewRequirement['relatedProfileSection'];
  readonly resolutionOptions: readonly string[];
}

export interface ProjectedMerchantLock {
  readonly field: string;
  readonly valueFingerprint: string;
  readonly lockSource: string;
  readonly lockedAt: string;
  readonly reason: string;
  readonly overrideAllowed: boolean;
}

export interface InstructionGroup<T extends Readonly<Record<string, unknown>>> {
  readonly group: GenerationInstructionGroupName;
  readonly enabled: boolean;
  readonly factIds: readonly string[];
  readonly instructions: T;
}

export interface SafetyInstruction {
  readonly group: 'SAFETY';
  readonly enabled: true;
  readonly generationAllowed: boolean;
  readonly factualStrictness: string;
  readonly uncertaintyBehavior: string;
  readonly missingDataBehavior: string;
  readonly conflictBehavior: string;
  readonly requiredEvidenceBehavior: Readonly<Record<string, unknown>>;
  readonly prohibitedOutputs: readonly string[];
  readonly blockedClaims: readonly Readonly<{
    code: string;
    fieldIds: readonly string[];
    reason: string;
  }>[];
  readonly reviewRequirements: readonly ProjectedReviewRequirement[];
  readonly merchantLocks: readonly ProjectedMerchantLock[];
  readonly publishingConstraints: ListingGenerationPlan['publishingConstraints'];
  readonly aiPolicy: Readonly<{
    creativity: string;
    explanation: Readonly<Record<string, unknown>>;
    regeneration: Readonly<Record<string, unknown>>;
    toneVariation: string;
    highRisk: Readonly<Record<string, unknown>>;
    humanReviewThresholds: readonly string[];
    qualityTier: string;
    maximumRetries: number;
    maximumRegenerations: number;
    merchantApprovalRequired: boolean;
    futureExecutionAllowed: boolean;
  }>;
}

export interface GenerationInstructionGroups {
  readonly TITLE: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly DESCRIPTION: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly FEATURES: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly SEO: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly CATALOG: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly METAFIELDS: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly MEDIA: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly LOCALIZATION: InstructionGroup<Readonly<Record<string, unknown>>>;
  readonly SAFETY: SafetyInstruction;
}

export interface GenerationInstructions {
  readonly instructionId: string;
  readonly schemaVersion: 1;
  readonly instructionVersion: '1.0.0';
  readonly builderVersion: '1.0.0';
  readonly sourcePlan: Readonly<{
    planId: string;
    planFingerprint: string;
    planVersion: string;
    projectId: string;
    workspaceId: string;
    productId: string;
    generationStatus: string;
    generationAllowed: boolean;
    listingStandardId?: string;
    listingProfileVersion?: number;
    listingProfileFingerprint?: string;
  }>;
  readonly allowedFacts: readonly AllowedFactInstruction[];
  readonly craft?: CraftInstructionProjection;
  readonly groups: GenerationInstructionGroups;
  readonly instructionFingerprint: string;
  readonly createdAt: string;
  readonly metadata: Readonly<{
    selectedFactCount: number;
    reviewRequirementCount: number;
    merchantLockCount: number;
    prohibitedOutputCount: number;
  }>;
}

export type GenerationInstructionSourcePlan = ListingGenerationPlan;
export type GenerationInstructionSourceLock = LockedGenerationField;
