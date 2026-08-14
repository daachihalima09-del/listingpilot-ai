import { z } from 'zod';
import { projectSafeSourceAuthority } from '../../listing-craft/index.ts';
import type { ListingGenerationPlan } from '../../listing-generation/domain/contracts.ts';
import {
  GENERATION_INSTRUCTION_BUILDER_VERSION,
  GENERATION_INSTRUCTION_SCHEMA_VERSION,
  GENERATION_INSTRUCTION_VERSION,
  type GenerationInstructions,
} from '../domain/contracts.ts';
import { GenerationInstructionError } from '../domain/errors.ts';
import { factVisibilityRole, requiredFactPlacements } from '../domain/fact-roles.ts';
import {
  generationInstructionFingerprint,
  semanticGenerationInstructionValue,
} from '../builder/instruction-fingerprint.ts';

const factSchema = z.object({
  factId: z.string().min(1),
  fieldId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1).nullable(),
  value: z.string(),
  truthStatus: z.string().min(1),
  confidence: z.number().min(0).max(1),
  importance: z.string().min(1),
  allowedUses: z.array(z.string().min(1)),
  visibilityRole: z.enum(['REQUIRED_VISIBLE', 'AVAILABLE_VERIFIED']),
  requiredPlacements: z.array(z.enum(['TITLE', 'STRUCTURED_DETAILS'])),
  evidenceRequirement: z.object({
    requirementLevel: z.string().nullable(),
    verificationPolicy: z.string().nullable(),
    highRisk: z.boolean(),
    variantSensitivity: z.string().nullable(),
    regionalSensitivity: z.boolean(),
  }).strict(),
  sourceAuthority: z.object({
    category: z.string().min(1).max(100),
    displayLabel: z.string().min(1).max(100),
    authorityLevel: z.enum(['PRIMARY', 'STRONG', 'SUPPORTING', 'MERCHANT', 'UNVERIFIED']),
    sourceName: z.string().max(200).nullable(),
    safeReference: z.string().max(2_048).nullable(),
    verificationStatus: z.string().min(1).max(100),
    limitations: z.array(z.string().max(500)).max(10),
  }).strict().optional(),
}).strict();

const stringListSchema = z.array(z.string().min(1)).max(100);
const craftSchema = z.object({
  packId: z.string().min(1).max(64),
  packVersion: z.string().min(1).max(64),
  displayName: z.string().min(1).max(100),
  titleCraftRules: z.object({ componentOrder: stringListSchema, preferredCharacterRange: z.object({ minimum: z.number().int().positive(), maximum: z.number().int().positive() }).strict(), maximumDifferentiators: z.number().int().min(0).max(10), identityComponents: stringListSchema, removableComponentOrder: stringListSchema, allowCommas: z.boolean(), preserveMerchantCapitalization: z.boolean() }).strict(),
  specificationCraftRules: z.object({ defaultLabels: stringListSchema, fieldGroups: z.array(z.object({ label: z.string().min(1).max(100), fieldIds: stringListSchema, requiredByDefault: z.boolean() }).strict()).min(1).max(30), exactVerifiedValues: z.boolean(), omitUnavailableOptionalValues: z.boolean(), maximumValueLength: z.number().int().min(10).max(2_000), prohibitedTopics: stringListSchema }).strict(),
  overviewCraftRules: z.object({ preferredParagraphCount: z.number().int().positive().max(10), maximumParagraphCount: z.number().int().positive().max(10), identityFirst: z.boolean(), specificationDumpingProhibited: z.boolean(), benefitTranslation: z.enum(['SUPPORTED_ONLY', 'REVIEW_REQUIRED', 'PROHIBITED']), maximumCharacters: z.number().int().min(100).max(5_000), prohibitedOpenings: stringListSchema }).strict(),
  featureCraftRules: z.object({ minimumCount: z.number().int().min(0).max(30), maximumCount: z.number().int().min(0).max(30), oneConceptPerFeature: z.boolean(), technicalFirst: z.boolean(), useProductIntelligencePriority: z.boolean(), fillerProhibited: z.boolean() }).strict(),
  duplicationRules: z.object({ semanticComparison: z.boolean(), requiredIdentityRepetitionAllowed: z.boolean(), fullTitleRepetitionProhibited: z.boolean(), semanticAliases: z.record(z.array(z.string())) }).strict(),
  wordingRules: z.object({ preferredVerbs: stringListSchema, prohibitedAbsoluteTerms: stringListSchema, prohibitedEmptyAdjectives: stringListSchema, preserveVerifiedTechnologyNames: z.boolean() }).strict(),
  identityRules: z.object({ protectedFields: stringListSchema, preserveModelSuffix: z.boolean(), preserveRegionalIdentity: z.boolean(), preserveVariantFacts: z.boolean(), inferCondition: z.literal(false), vendorMayImplyBrand: z.literal(false) }).strict(),
  categoryCraftGuidance: z.object({ useProductIntelligenceFieldDefinitions: z.boolean(), useProductIntelligenceFeaturePriorities: z.boolean(), genericFallback: z.boolean() }).strict(),
}).strict();

const reviewSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  blocking: z.boolean(),
  fieldIds: z.array(z.string()),
  reason: z.string().min(1),
  relatedFactIds: z.array(z.string()),
  relatedProfileSection: z.enum(['catalog', 'listing', 'seo', 'publishing', 'ai']).nullable(),
  resolutionOptions: z.array(z.string()),
}).strict();

const lockSchema = z.object({
  field: z.string().min(1),
  valueFingerprint: z.string().min(1),
  lockSource: z.string().min(1),
  lockedAt: z.string().datetime(),
  reason: z.string().min(1),
  overrideAllowed: z.boolean(),
}).strict();

const groupSchema = z.object({
  group: z.enum(['TITLE', 'DESCRIPTION', 'FEATURES', 'SEO', 'CATALOG', 'METAFIELDS', 'MEDIA', 'LOCALIZATION']),
  enabled: z.boolean(),
  factIds: z.array(z.string()),
  instructions: z.record(z.unknown()),
}).strict();

const safetySchema = z.object({
  group: z.literal('SAFETY'),
  enabled: z.literal(true),
  generationAllowed: z.boolean(),
  factualStrictness: z.string().min(1),
  uncertaintyBehavior: z.string().min(1),
  missingDataBehavior: z.string().min(1),
  conflictBehavior: z.string().min(1),
  requiredEvidenceBehavior: z.record(z.unknown()),
  prohibitedOutputs: z.array(z.string()),
  blockedClaims: z.array(z.object({
    code: z.string().min(1),
    fieldIds: z.array(z.string()),
    reason: z.string().min(1),
  }).strict()),
  reviewRequirements: z.array(reviewSchema),
  merchantLocks: z.array(lockSchema),
  publishingConstraints: z.record(z.unknown()),
  aiPolicy: z.object({
    creativity: z.string().min(1),
    explanation: z.record(z.unknown()),
    regeneration: z.record(z.unknown()),
    toneVariation: z.string().min(1),
    highRisk: z.record(z.unknown()),
    humanReviewThresholds: z.array(z.string()),
    qualityTier: z.string().min(1),
    maximumRetries: z.number().int().nonnegative(),
    maximumRegenerations: z.number().int().nonnegative(),
    merchantApprovalRequired: z.boolean(),
    futureExecutionAllowed: z.boolean(),
  }).strict(),
}).strict();

export const generationInstructionSchema = z.object({
  instructionId: z.string().min(1),
  schemaVersion: z.number().int(),
  instructionVersion: z.string().min(1),
  builderVersion: z.string().min(1),
  sourcePlan: z.object({
    planId: z.string().min(1),
    planFingerprint: z.string().min(1),
    planVersion: z.string().min(1),
    projectId: z.string().min(1),
    workspaceId: z.string().min(1),
    productId: z.string().min(1),
    generationStatus: z.string().min(1),
    generationAllowed: z.boolean(),
    listingStandardId: z.string().min(1).max(100).optional(),
    listingProfileVersion: z.number().int().nonnegative().optional(),
    listingProfileFingerprint: z.string().min(1).max(256).optional(),
  }).strict(),
  allowedFacts: z.array(factSchema),
  craft: craftSchema.optional(),
  groups: z.object({
    TITLE: groupSchema,
    DESCRIPTION: groupSchema,
    FEATURES: groupSchema,
    SEO: groupSchema,
    CATALOG: groupSchema,
    METAFIELDS: groupSchema,
    MEDIA: groupSchema,
    LOCALIZATION: groupSchema,
    SAFETY: safetySchema,
  }).strict(),
  instructionFingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.object({
    selectedFactCount: z.number().int().nonnegative(),
    reviewRequirementCount: z.number().int().nonnegative(),
    merchantLockCount: z.number().int().nonnegative(),
    prohibitedOutputCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sameValue(left: unknown, right: unknown): boolean {
  return generationInstructionFingerprint(left) === generationInstructionFingerprint(right);
}

function containsForbiddenProjectionKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenProjectionKey);
  if (!value || typeof value !== 'object') return false;
  const forbiddenKeys = new Set([
    'rawEvidence',
    'evidenceReferences',
    'sourceReferences',
    'excludedFacts',
    'unresolvedFacts',
    'conflictedFacts',
    'productTruth',
    'aiDetectiveFindings',
    'recommendations',
  ]);
  return Object.entries(value).some(([key, item]) =>
    forbiddenKeys.has(key) || containsForbiddenProjectionKey(item));
}

export function validateGenerationInstructionPackage(value: unknown): GenerationInstructions {
  const parsed = generationInstructionSchema.safeParse(value);
  if (!parsed.success) {
    throw new GenerationInstructionError(
      'INVALID_INSTRUCTION_PACKAGE',
      'The Generation Instruction package structure is invalid.',
    );
  }
  const instructions = parsed.data as unknown as GenerationInstructions;
  if (
    instructions.schemaVersion !== GENERATION_INSTRUCTION_SCHEMA_VERSION
    || instructions.instructionVersion !== GENERATION_INSTRUCTION_VERSION
    || instructions.builderVersion !== GENERATION_INSTRUCTION_BUILDER_VERSION
  ) {
    throw new GenerationInstructionError(
      'UNSUPPORTED_INSTRUCTION_VERSION',
      'The Generation Instruction package version is unsupported.',
    );
  }
  const fingerprint = generationInstructionFingerprint(semanticGenerationInstructionValue(instructions));
  if (
    fingerprint !== instructions.instructionFingerprint
    || instructions.instructionId !== `generation_instructions_${fingerprint}`
  ) {
    throw new GenerationInstructionError(
      'FINGERPRINT_MISMATCH',
      'The Generation Instruction package fingerprint is invalid.',
    );
  }
  const allowedIds = new Set(instructions.allowedFacts.map(({ factId }) => factId));
  if (allowedIds.size !== instructions.allowedFacts.length) {
    throw new GenerationInstructionError(
      'INVALID_INSTRUCTION_PACKAGE',
      'Allowed fact identities must be unique.',
    );
  }
  for (const name of ['TITLE', 'DESCRIPTION', 'FEATURES', 'SEO', 'CATALOG', 'METAFIELDS', 'MEDIA', 'LOCALIZATION'] as const) {
    if (instructions.groups[name].group !== name) {
      throw new GenerationInstructionError(
        'INVALID_INSTRUCTION_PACKAGE',
        'Instruction group identities must match their package keys.',
      );
    }
  }
  const groupFactIds = Object.entries(instructions.groups)
    .filter(([name]) => name !== 'SAFETY')
    .flatMap(([, instructionGroup]) => 'factIds' in instructionGroup ? instructionGroup.factIds : []);
  if (groupFactIds.some((factId) => !allowedIds.has(factId))) {
    throw new GenerationInstructionError(
      'FORBIDDEN_FACT_PROJECTED',
      'An instruction group references a fact outside the allowed projection.',
    );
  }
  if (containsForbiddenProjectionKey(instructions)) {
    throw new GenerationInstructionError(
      'FORBIDDEN_FACT_PROJECTED',
      'The package contains a forbidden upstream or evidence projection.',
    );
  }
  if (
    instructions.metadata.selectedFactCount !== instructions.allowedFacts.length
    || instructions.metadata.reviewRequirementCount !== instructions.groups.SAFETY.reviewRequirements.length
    || instructions.metadata.merchantLockCount !== instructions.groups.SAFETY.merchantLocks.length
    || instructions.metadata.prohibitedOutputCount !== instructions.groups.SAFETY.prohibitedOutputs.length
  ) {
    throw new GenerationInstructionError(
      'INVALID_INSTRUCTION_PACKAGE',
      'Instruction summary counts do not match the package.',
    );
  }
  return instructions;
}

export function validateGenerationInstructionsAgainstPlan(
  value: unknown,
  plan: ListingGenerationPlan,
): GenerationInstructions {
  const instructions = validateGenerationInstructionPackage(value);
  if (
    instructions.sourcePlan.planId !== plan.planId
    || instructions.sourcePlan.planFingerprint !== plan.planFingerprint
    || instructions.sourcePlan.workspaceId !== plan.workspaceId
    || instructions.sourcePlan.productId !== plan.productId
    || instructions.sourcePlan.listingStandardId !== plan.listingStandardId
    || instructions.sourcePlan.listingProfileVersion !== plan.merchantProfileVersions.listing.version
    || instructions.sourcePlan.listingProfileFingerprint !== plan.merchantProfileVersions.listing.fingerprint
  ) {
    throw new GenerationInstructionError(
      'INVALID_SOURCE_PLAN',
      'The instruction package does not belong to the supplied source plan.',
    );
  }

  const selectedIds = plan.selectedFacts.map(({ id }) => id);
  const projectedIds = instructions.allowedFacts.map(({ factId }) => factId);
  if (!sameMembers(selectedIds, projectedIds)) {
    throw new GenerationInstructionError(
      'MISSING_SELECTED_FACT',
      'Every selected plan fact must be projected exactly once.',
    );
  }
  const selectedById = new Map(plan.selectedFacts.map((fact) => [fact.id, fact]));
  for (const projected of instructions.allowedFacts) {
    const source = selectedById.get(projected.factId);
    if (!source || !sameValue(projected, {
      factId: source.id,
      fieldId: source.fieldId,
      productId: source.productId,
      variantId: source.variantId,
      value: source.displayValue,
      truthStatus: source.truthStatus,
      confidence: source.confidence,
      importance: source.importance,
      allowedUses: [...new Set(source.allowedUses)].sort(),
      visibilityRole: factVisibilityRole(source, plan),
      requiredPlacements: requiredFactPlacements(source, plan),
      evidenceRequirement: {
        requirementLevel: source.productIntelligenceGuidance.requirementLevel,
        verificationPolicy: source.productIntelligenceGuidance.verificationPolicy,
        highRisk: source.productIntelligenceGuidance.highRisk,
        variantSensitivity: source.productIntelligenceGuidance.variantSensitivity,
        regionalSensitivity: source.productIntelligenceGuidance.regionalSensitivity,
      },
      sourceAuthority: projectSafeSourceAuthority(source.sourceReferences[0], source.truthStatus),
    })) {
      throw new GenerationInstructionError(
        'FORBIDDEN_FACT_PROJECTED',
        'Projected facts must exactly match their selected source-plan facts.',
      );
    }
  }
  const forbiddenIds = new Set([
    ...plan.excludedFacts,
    ...plan.unresolvedFacts,
    ...plan.conflictedFacts,
  ].map(({ id }) => id));
  const referencedIds = [
    ...projectedIds,
    ...Object.entries(instructions.groups)
      .filter(([name]) => name !== 'SAFETY')
      .flatMap(([, instructionGroup]) => 'factIds' in instructionGroup ? instructionGroup.factIds : []),
    ...instructions.groups.SAFETY.reviewRequirements.flatMap(({ relatedFactIds }) => relatedFactIds),
  ];
  if (referencedIds.some((id) => forbiddenIds.has(id))) {
    throw new GenerationInstructionError(
      'FORBIDDEN_FACT_PROJECTED',
      'Excluded, unresolved, or conflicted facts cannot enter Generation Instructions.',
    );
  }
  if (!sameMembers(plan.prohibitedOutputs, instructions.groups.SAFETY.prohibitedOutputs)) {
    throw new GenerationInstructionError(
      'MISSING_PROHIBITED_OUTPUT',
      'All source-plan prohibitions must be preserved.',
    );
  }
  if (!sameMembers(
    plan.reviewRequirements.map(({ id }) => id),
    instructions.groups.SAFETY.reviewRequirements.map(({ id }) => id),
  )) {
    throw new GenerationInstructionError(
      'MISSING_REVIEW_REQUIREMENT',
      'All source-plan review requirements must be preserved.',
    );
  }
  if (!sameMembers(
    plan.lockedFields.map(({ field, valueFingerprint }) => `${field}:${valueFingerprint}`),
    instructions.groups.SAFETY.merchantLocks.map(({ field, valueFingerprint }) => `${field}:${valueFingerprint}`),
  )) {
    throw new GenerationInstructionError(
      'MISSING_MERCHANT_LOCK',
      'All source-plan merchant locks must be preserved.',
    );
  }
  const expectedGroupFacts = {
    TITLE: plan.titlePlan.selectedFactIds,
    DESCRIPTION: plan.descriptionPlan.selectedFactIds,
    FEATURES: plan.featurePlan.selectedFactIds,
    SEO: plan.seoPlan.selectedFactIds,
    CATALOG: plan.selectedFacts.filter(({ allowedUses }) =>
      allowedUses.includes('CATALOG_CLASSIFICATION')).map(({ id }) => id),
    METAFIELDS: plan.metafieldPlan.entries.flatMap(({ selectedFactId }) =>
      selectedFactId ? [selectedFactId] : []),
    MEDIA: plan.mediaPlan.altTextFactIds,
    LOCALIZATION: [],
  } as const;
  for (const name of Object.keys(expectedGroupFacts) as (keyof typeof expectedGroupFacts)[]) {
    const expectedFactIds = expectedGroupFacts[name];
    const projectedFactIds = instructions.groups[name].factIds;
    if (!sameMembers(expectedFactIds, projectedFactIds)) {
      throw new GenerationInstructionError(
        'MISSING_SELECTED_FACT',
        'Instruction groups must preserve their selected source-plan fact references.',
        { group: name },
      );
    }
  }
  const safety = instructions.groups.SAFETY;
  if (
    safety.generationAllowed !== plan.generationEligibility.allowed
    || safety.factualStrictness !== plan.aiPolicy.factualStrictness
    || safety.uncertaintyBehavior !== plan.aiPolicy.uncertainty
    || safety.missingDataBehavior !== plan.aiPolicy.missingInformation
    || safety.conflictBehavior !== plan.aiPolicy.conflicts
    || !sameValue(safety.requiredEvidenceBehavior, plan.aiPolicy.evidence)
    || !sameValue(safety.publishingConstraints, plan.publishingConstraints)
  ) {
    throw new GenerationInstructionError(
      'INVALID_INSTRUCTION_PACKAGE',
      'Safety and policy projections must exactly preserve the source plan.',
    );
  }
  return instructions;
}
