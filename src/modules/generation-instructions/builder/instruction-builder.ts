import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import { projectSafeSourceAuthority } from '../../listing-craft/index.ts';
import type {
  GenerationFact,
  ListingGenerationPlan,
} from '../../listing-generation/domain/contracts.ts';
import {
  GENERATION_INSTRUCTION_BUILDER_VERSION,
  GENERATION_INSTRUCTION_SCHEMA_VERSION,
  GENERATION_INSTRUCTION_VERSION,
  type AllowedFactInstruction,
  type GenerationInstructions,
  type InstructionGroup,
  type ProjectedMerchantLock,
  type ProjectedReviewRequirement,
} from '../domain/contracts.ts';
import { GenerationInstructionError } from '../domain/errors.ts';
import {
  generationInstructionFingerprint,
  semanticGenerationInstructionValue,
} from './instruction-fingerprint.ts';
import { validateGenerationInstructionsAgainstPlan } from '../validation/instruction-validator.ts';
import { factVisibilityRole, requiredFactPlacements } from '../domain/fact-roles.ts';

const sorted = (values: readonly string[]) =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

function omitKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function factInstruction(fact: GenerationFact, plan: ListingGenerationPlan): AllowedFactInstruction {
  if (fact.selectionStatus !== 'SELECTED' || fact.displayValue === null) {
    throw new GenerationInstructionError(
      'INVALID_SOURCE_PLAN',
      'The source plan contains an invalid selected fact.',
      { factId: fact.id },
    );
  }
  return {
    factId: fact.id,
    fieldId: fact.fieldId,
    productId: fact.productId,
    variantId: fact.variantId,
    value: fact.displayValue,
    truthStatus: fact.truthStatus,
    confidence: fact.confidence,
    importance: fact.importance,
    allowedUses: sorted(fact.allowedUses),
    visibilityRole: factVisibilityRole(fact, plan),
    requiredPlacements: requiredFactPlacements(fact, plan),
    evidenceRequirement: {
      requirementLevel: fact.productIntelligenceGuidance.requirementLevel,
      verificationPolicy: fact.productIntelligenceGuidance.verificationPolicy,
      highRisk: fact.productIntelligenceGuidance.highRisk,
      variantSensitivity: fact.productIntelligenceGuidance.variantSensitivity,
      regionalSensitivity: fact.productIntelligenceGuidance.regionalSensitivity,
    },
    sourceAuthority: projectSafeSourceAuthority(fact.sourceReferences[0], fact.truthStatus),
  };
}

function projectReview(
  requirement: ListingGenerationPlan['reviewRequirements'][number],
  allowedFactIds: ReadonlySet<string>,
): ProjectedReviewRequirement {
  return {
    id: requirement.id,
    type: requirement.type,
    priority: requirement.priority,
    blocking: requirement.blocking,
    fieldIds: sorted(requirement.fieldIds),
    reason: requirement.reason,
    relatedFactIds: sorted(requirement.relatedFactIds.filter((id) => allowedFactIds.has(id))),
    relatedProfileSection: requirement.relatedProfileSection,
    resolutionOptions: sorted(requirement.resolutionOptions),
  };
}

function projectLock(lock: ListingGenerationPlan['lockedFields'][number]): ProjectedMerchantLock {
  return {
    field: lock.field,
    valueFingerprint: lock.valueFingerprint,
    lockSource: lock.lockSource,
    lockedAt: lock.lockedAt,
    reason: lock.reason,
    overrideAllowed: lock.overrideAllowed,
  };
}

function group(
  name: Exclude<keyof GenerationInstructions['groups'], 'SAFETY'>,
  enabled: boolean,
  factIds: readonly string[],
  instructions: Readonly<Record<string, unknown>>,
): InstructionGroup<Readonly<Record<string, unknown>>> {
  return { group: name, enabled, factIds: sorted(factIds), instructions };
}

function structuredFactBlock(
  plan: ListingGenerationPlan,
  craft: NonNullable<ListingGenerationPlan['craftPlan']>,
  allowedFacts: readonly AllowedFactInstruction[],
): Readonly<Record<string, unknown>> {
  const normalize = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, ' ').trim();
  const requiredLabels = new Set(plan.descriptionPlan.requiredLabels.map(normalize));
  const fields = craft.specificationCraftRules.fieldGroups.flatMap((definition) => {
    const facts = allowedFacts.filter(({ fieldId, allowedUses }) => (
      definition.fieldIds.includes(fieldId) && allowedUses.includes('DESCRIPTION')
    ));
    const required = definition.requiredByDefault || requiredLabels.has(normalize(definition.label));
    return facts.length || required ? [{
      label: definition.label,
      fieldIds: definition.fieldIds,
      factIds: facts.map(({ factId }) => factId),
      required,
    }] : [];
  });
  return {
    required: plan.descriptionPlan.structure === 'SPECIFICATIONS_FIRST',
    sectionPosition: plan.descriptionPlan.sectionOrder.indexOf('STRUCTURED_SPECIFICATIONS'),
    labelOrder: fields.map(({ label }) => label),
    fields,
    missingRequiredLabels: fields.filter(({ required, factIds }) => required && factIds.length === 0).map(({ label }) => label),
    omitUnavailableOptionalValues: craft.specificationCraftRules.omitUnavailableOptionalValues,
    exactVerifiedValues: craft.specificationCraftRules.exactVerifiedValues,
    maximumValueLength: craft.specificationCraftRules.maximumValueLength,
  };
}

export function createGenerationInstructions(plan: ListingGenerationPlan): GenerationInstructions {
  if (!plan || !plan.planId || !plan.planFingerprint || plan.schemaVersion !== 1) {
    throw new GenerationInstructionError('INVALID_SOURCE_PLAN', 'A valid Listing Generation Plan is required.');
  }

  const allowedFacts = plan.selectedFacts.map((fact) => factInstruction(fact, plan)).sort((left, right) =>
    left.factId.localeCompare(right.factId));
  const craft = plan.craftPlan ?? undefined;
  const allowedFactIds = new Set(allowedFacts.map(({ factId }) => factId));
  const reviews = plan.reviewRequirements
    .map((requirement) => projectReview(requirement, allowedFactIds))
    .sort((left, right) => left.id.localeCompare(right.id));
  const locks = plan.lockedFields.map(projectLock).sort((left, right) =>
    left.field.localeCompare(right.field));

  const title = group(
    'TITLE',
    plan.titlePlan.enabled,
    plan.titlePlan.selectedFactIds,
    omitKeys(plan.titlePlan as unknown as Readonly<Record<string, unknown>>, ['selectedFactIds', 'reviewRequirements']),
  );
  const description = group(
    'DESCRIPTION',
    plan.descriptionPlan.enabled,
    plan.descriptionPlan.selectedFactIds,
    {
      ...omitKeys(plan.descriptionPlan as unknown as Readonly<Record<string, unknown>>, ['selectedFactIds', 'omittedFactIds', 'reviewRequirements']),
      ...(craft ? { structuredFactBlock: structuredFactBlock(plan, craft, allowedFacts) } : {}),
    },
  );
  const features = group(
    'FEATURES',
    plan.featurePlan.enabled,
    plan.featurePlan.selectedFactIds,
    omitKeys(plan.featurePlan as unknown as Readonly<Record<string, unknown>>, ['selectedFactIds', 'excludedFactIds', 'reviewRequirements']),
  );
  const seo = group('SEO', plan.seoPlan.enabled, plan.seoPlan.selectedFactIds, {
    publishable: plan.seoPlan.publishable,
    title: omitKeys(plan.seoPlan.titlePlan, ['selectedFactIds']),
    metaDescription: omitKeys(plan.seoPlan.metaDescriptionPlan, ['selectedFactIds', 'prohibitedFactIds']),
    handle: omitKeys(plan.seoPlan.handlePlan, ['selectedFactIds']),
    searchIntentPriorities: plan.seoPlan.searchIntentPriorities,
    keywordPolicy: plan.seoPlan.keywordPolicy,
    brandingPolicy: plan.seoPlan.brandingPolicy,
    imageSeoPolicy: plan.seoPlan.imageSeoPolicy,
    structuredDataPolicy: plan.seoPlan.structuredDataPolicy,
    indexingPolicy: plan.seoPlan.indexingPolicy,
    qualityRules: plan.seoPlan.qualityRules,
  });
  const catalogFactIds = allowedFacts
    .filter(({ allowedUses }) => allowedUses.includes('CATALOG_CLASSIFICATION'))
    .map(({ factId }) => factId);
  const catalog = group('CATALOG', true, catalogFactIds, {
    vendor: plan.catalogPlan.vendor,
    brand: plan.catalogPlan.brand,
    productType: plan.catalogPlan.productType,
    collections: plan.catalogPlan.collections,
    tags: plan.catalogPlan.tags,
    classificationStatus: plan.catalogPlan.classificationStatus,
    confidence: plan.catalogPlan.confidence,
    reasons: plan.catalogPlan.reasons,
    approvedValues: plan.catalogPlan.approvedValues,
    suggestedValues: plan.catalogPlan.suggestedValues,
    automaticCreationAllowed: false,
  });
  const metafieldFactIds = plan.metafieldPlan.entries.flatMap(({ selectedFactId }) =>
    selectedFactId ? [selectedFactId] : []);
  const metafields = group('METAFIELDS', true, metafieldFactIds, {
    entries: plan.metafieldPlan.entries,
    createDefinitions: false,
    mutationAllowed: false,
  });
  const media = group('MEDIA', true, plan.mediaPlan.altTextFactIds, omitKeys(
    plan.mediaPlan as unknown as Readonly<Record<string, unknown>>,
    ['altTextFactIds', 'reviewRequirements'],
  ));
  const localization = group('LOCALIZATION', true, [], omitKeys(
    plan.localizationPlan as unknown as Readonly<Record<string, unknown>>,
    ['reviewRequirements'],
  ));
  const blockedClaims = [
    ...plan.blockers.map(({ code, fieldIds, message }) => ({ code, fieldIds: sorted(fieldIds), reason: message })),
    ...plan.featurePlan.prohibitedClaims.map((claim) => ({ code: 'PROHIBITED_CLAIM', fieldIds: [], reason: claim })),
  ].sort((left, right) => left.code.localeCompare(right.code) || left.reason.localeCompare(right.reason));

  const safety = {
    group: 'SAFETY' as const,
    enabled: true as const,
    generationAllowed: plan.generationEligibility.allowed,
    factualStrictness: plan.aiPolicy.factualStrictness,
    uncertaintyBehavior: plan.aiPolicy.uncertainty,
    missingDataBehavior: plan.aiPolicy.missingInformation,
    conflictBehavior: plan.aiPolicy.conflicts,
    requiredEvidenceBehavior: plan.aiPolicy.evidence,
    prohibitedOutputs: sorted(plan.prohibitedOutputs),
    blockedClaims,
    reviewRequirements: reviews,
    merchantLocks: locks,
    publishingConstraints: plan.publishingConstraints,
    aiPolicy: {
      creativity: plan.aiPolicy.creativity,
      explanation: plan.aiPolicy.explanation,
      regeneration: plan.aiPolicy.regeneration,
      toneVariation: plan.aiPolicy.toneVariation,
      highRisk: plan.aiPolicy.highRisk,
      humanReviewThresholds: sorted(plan.aiPolicy.humanReviewThresholds),
      qualityTier: plan.aiPolicy.qualityTier,
      maximumRetries: plan.aiPolicy.maxRetries,
      maximumRegenerations: plan.aiPolicy.maxRegenerations,
      merchantApprovalRequired: plan.publishingConstraints.approval.explicitMerchantActionRequired,
      futureExecutionAllowed: plan.aiPolicy.futureExecutionAllowed,
    },
  };

  const base = {
    schemaVersion: GENERATION_INSTRUCTION_SCHEMA_VERSION,
    instructionVersion: GENERATION_INSTRUCTION_VERSION,
    builderVersion: GENERATION_INSTRUCTION_BUILDER_VERSION,
    sourcePlan: {
      planId: plan.planId,
      planFingerprint: plan.planFingerprint,
      planVersion: plan.planVersion,
      projectId: plan.projectId,
      workspaceId: plan.workspaceId,
      productId: plan.productId,
      generationStatus: plan.generationStatus,
      generationAllowed: plan.generationEligibility.allowed,
      listingStandardId: plan.listingStandardId,
      listingProfileVersion: plan.merchantProfileVersions.listing.version,
      listingProfileFingerprint: plan.merchantProfileVersions.listing.fingerprint,
    },
    allowedFacts,
    ...(craft ? { craft } : {}),
    groups: {
      TITLE: title,
      DESCRIPTION: description,
      FEATURES: features,
      SEO: seo,
      CATALOG: catalog,
      METAFIELDS: metafields,
      MEDIA: media,
      LOCALIZATION: localization,
      SAFETY: safety,
    },
    createdAt: plan.createdAt,
    metadata: {
      selectedFactCount: allowedFacts.length,
      reviewRequirementCount: reviews.length,
      merchantLockCount: locks.length,
      prohibitedOutputCount: safety.prohibitedOutputs.length,
    },
  };
  const instructionFingerprint = generationInstructionFingerprint(
    semanticGenerationInstructionValue(base as unknown as GenerationInstructions),
  );
  const instructions = immutableCopy({
    instructionId: `generation_instructions_${instructionFingerprint}`,
    ...base,
    instructionFingerprint,
  }) as GenerationInstructions;
  validateGenerationInstructionsAgainstPlan(instructions, plan);
  return instructions;
}
