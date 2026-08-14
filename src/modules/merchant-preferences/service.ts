import { z } from 'zod';
import {
  requireMerchantPreferenceOwner,
  requireMerchantPreferenceWorkspaceAccess,
} from './access.ts';
import {
  createMerchantBusinessProfile,
  findMerchantPreferenceSection,
} from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { MerchantPreferenceError } from './errors.ts';
import { resolveEffectiveMerchantPreferences } from './effective-preferences.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import type { ListingPreferenceData } from './listing-standard.ts';
import type { SeoProfile } from './seo-profile.ts';
import type { PublishingProfile } from './publishing-profile.ts';
import { publishingPolicyGroups } from './effective-publishing-profile.ts';
import type { AiProfile } from './ai-profile.ts';
import { aiPolicyGroups } from './effective-ai-profile.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import type { MerchantBusinessProfileRepository } from './repository.ts';
import type { MerchantPreferenceAccess } from './access.ts';
import {
  isActiveMerchantPreferenceSection,
  merchantPreferenceSectionIdSchema,
} from './section-ids.ts';
import {
  assertMerchantPreferenceStatusTransition,
  merchantPreferenceSectionWriteSchema,
} from './validation.ts';

function invalidPayload(error: unknown): MerchantPreferenceError {
  return new MerchantPreferenceError(
    'INVALID_PREFERENCE_PAYLOAD',
    400,
    'The merchant preference payload is invalid.',
    { cause: error },
  );
}

export async function getMerchantBusinessProfile(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  workspaceId: string,
) {
  const record = await repository.findByWorkspaceId(workspaceId);
  return record ? createMerchantBusinessProfile(record, registry) : null;
}

export async function getMerchantBusinessProfileForAccess(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  access: MerchantPreferenceAccess,
  workspaceId: string,
) {
  requireMerchantPreferenceWorkspaceAccess(access, workspaceId);
  return getMerchantBusinessProfile(repository, registry, workspaceId);
}

export async function getMerchantBusinessProfileCompletion(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  workspaceId: string,
) {
  const profile = await getMerchantBusinessProfile(
    repository,
    registry,
    workspaceId,
  );
  return evaluateMerchantBusinessProfileCompletion(profile, registry);
}

export async function getEffectiveMerchantPreferences(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  workspaceId: string,
) {
  const profile = await getMerchantBusinessProfile(
    repository,
    registry,
    workspaceId,
  );
  return resolveEffectiveMerchantPreferences(workspaceId, profile, registry);
}

type MerchantPreferenceMutationContext = 'ONBOARDING' | 'PERMANENT_SETTINGS';

async function saveMerchantPreferenceSectionWithContext(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  access: MerchantPreferenceAccess,
  untrustedInput: unknown,
  mutationContext: MerchantPreferenceMutationContext,
) {
  const requestedSection = merchantPreferenceSectionIdSchema.safeParse(
    untrustedInput && typeof untrustedInput === 'object'
      ? (untrustedInput as { sectionId?: unknown }).sectionId
      : undefined,
  );
  if (
    !requestedSection.success
    || !isActiveMerchantPreferenceSection(requestedSection.data)
  ) {
    throw new MerchantPreferenceError(
      'UNSUPPORTED_SECTION',
      400,
      'The requested merchant preference section is unsupported.',
    );
  }
  const parsedInput = merchantPreferenceSectionWriteSchema.safeParse(
    untrustedInput,
  );
  if (!parsedInput.success) throw invalidPayload(parsedInput.error);
  const input = parsedInput.data;
  requireMerchantPreferenceOwner(access, input.workspaceId);
  const definition = registry.get(input.sectionId);
  if (definition.currentSchemaVersion !== input.schemaVersion) {
    throw new MerchantPreferenceError(
      'UNSUPPORTED_SECTION_VERSION',
      409,
      `Merchant preference schema version ${input.schemaVersion} is unsupported.`,
    );
  }
  let data: unknown;
  try {
    data = definition.deserialize(input.payload);
  } catch (error) {
    if (error instanceof z.ZodError) throw invalidPayload(error);
    throw error;
  }
  const completion = definition.completionEvaluator(data);
  const existing = await getMerchantBusinessProfile(
    repository,
    registry,
    input.workspaceId,
  );
  const previous = findMerchantPreferenceSection(
    existing,
    input.sectionId,
  );
  const preservesCompletedOnboardingState = mutationContext === 'PERMANENT_SETTINGS'
    && previous?.status === 'COMPLETE'
    && completion.status === 'IN_PROGRESS'
    && completion.validationStatus === 'VALID';
  const persistedStatus = preservesCompletedOnboardingState
    ? 'COMPLETE' as const
    : completion.status;
  if (previous) {
    if (input.expectedVersion !== previous.version) {
      throw new MerchantPreferenceError(
        'PREFERENCE_CONCURRENCY_CONFLICT',
        409,
        'These merchant preferences were updated elsewhere. Reload before saving again.',
      );
    }
    assertMerchantPreferenceStatusTransition(previous.status, persistedStatus);
  } else if (input.expectedVersion !== null) {
    throw new MerchantPreferenceError(
      'PREFERENCE_CONCURRENCY_CONFLICT',
      409,
      'These merchant preferences were updated elsewhere. Reload before saving again.',
    );
  }
  const payload = definition.serialize(data);
  const listingData = input.sectionId === 'listing'
    ? data as ListingPreferenceData
    : null;
  const auditEvent = input.sectionId === 'listing'
    ? previous === null
      ? listingData?.learningMode === 'LEARN_FROM_STORE'
        ? 'CREATED'
        : 'STANDARD_SELECTED'
      : persistedStatus === 'COMPLETE' && previous.status !== 'COMPLETE'
        ? 'COMPLETED'
        : 'UPDATED'
    : undefined;
  const seoData = input.sectionId === 'seo' ? data as SeoProfile : null;
  const previousSeoData = input.sectionId === 'seo'
    ? previous?.data as SeoProfile | null | undefined
    : null;
  const seoChangedRuleGroups = seoData
    ? Object.keys(seoData.rules).filter((ruleGroup) => (
        !previousSeoData
        || stableMerchantPreferenceFingerprint(
          previousSeoData.rules[ruleGroup as keyof SeoProfile['rules']],
        ) !== stableMerchantPreferenceFingerprint(
          seoData.rules[ruleGroup as keyof SeoProfile['rules']],
        )
      ))
    : undefined;
  const seoAuditEvent = input.sectionId === 'seo'
    ? previous === null
      ? seoData?.setupMode === 'REVIEW_EXISTING_SEO' ? 'REVIEW_REQUESTED' : 'CREATED'
      : previousSeoData?.setupMode !== seoData?.setupMode
        ? seoData?.setupMode === 'REVIEW_EXISTING_SEO' ? 'REVIEW_REQUESTED' : 'MODE_SELECTED'
      : persistedStatus === 'COMPLETE' && previous.status !== 'COMPLETE' ? 'COMPLETED' : 'UPDATED'
    : undefined;
  const publishingData = input.sectionId === 'publishing' ? data as PublishingProfile : null;
  const previousPublishingData = input.sectionId === 'publishing'
    ? previous?.data as PublishingProfile | null | undefined
    : null;
  const publishingChangedGroups = publishingData
    ? publishingPolicyGroups.filter((group) => (
        !previousPublishingData
        || stableMerchantPreferenceFingerprint(previousPublishingData.policies[group])
          !== stableMerchantPreferenceFingerprint(publishingData.policies[group])
      ))
    : undefined;
  const publishingAuditEvent = input.sectionId === 'publishing'
    ? previous === null
      ? publishingData?.setupMode === 'REVIEW_CURRENT_SHOPIFY_SETUP' ? 'REVIEW_REQUESTED' : 'CREATED'
      : previousPublishingData?.setupMode !== publishingData?.setupMode
        ? publishingData?.setupMode === 'REVIEW_CURRENT_SHOPIFY_SETUP' ? 'REVIEW_REQUESTED' : 'MODE_SELECTED'
        : persistedStatus === 'COMPLETE' && previous.status !== 'COMPLETE' ? 'COMPLETED' : 'UPDATED'
    : undefined;
  const aiData = input.sectionId === 'ai' ? data as AiProfile : null;
  const previousAiData = input.sectionId === 'ai'
    ? previous?.data as AiProfile | null | undefined
    : null;
  const aiChangedGroups = aiData
    ? aiPolicyGroups.filter((group) => (
        !previousAiData
        || stableMerchantPreferenceFingerprint(previousAiData.policies[group])
          !== stableMerchantPreferenceFingerprint(aiData.policies[group])
      ))
    : undefined;
  const aiAuditEvent = input.sectionId === 'ai'
    ? previous === null
      ? 'CREATED'
      : previousAiData?.setupMode !== aiData?.setupMode
        ? 'MODE_SELECTED'
        : persistedStatus === 'COMPLETE' && previous.status !== 'COMPLETE' ? 'COMPLETED' : 'UPDATED'
    : undefined;
  const record = await repository.saveSection({
    actorUserId: access.actorUserId,
    organizationId: access.organizationId,
    workspaceId: access.workspaceId,
    sectionId: input.sectionId,
    schemaVersion: input.schemaVersion,
    expectedSectionVersion: input.expectedVersion,
    status: persistedStatus,
    validationStatus: completion.validationStatus,
    source: input.source,
    payload,
    fingerprint: stableMerchantPreferenceFingerprint({
      sectionId: input.sectionId,
      schemaVersion: input.schemaVersion,
      payload,
    }),
    metadata: {
      validationIssueCount: completion.issues.length,
      ...(preservesCompletedOnboardingState
        ? { onboardingCompletionPreserved: true }
        : {}),
    },
    auditEvent,
    seoAuditEvent,
    publishingAuditEvent,
    publishingAuditMetadata: publishingData ? {
      setupMode: publishingData.setupMode,
      analysisStatus: publishingData.analysisStatus,
      completionStatus: persistedStatus,
    } : undefined,
    aiAuditEvent,
    aiAuditMetadata: aiData ? {
      setupMode: aiData.setupMode,
      completionStatus: persistedStatus,
      creativityLevel: aiData.policies.creativity,
      factualStrictness: aiData.policies.factualStrictness,
      qualityTier: aiData.policies.modelPolicy.qualityTier,
      reviewThresholdCount: aiData.policies.humanReviewThresholds.length,
    } : undefined,
    auditChangedFields: aiChangedGroups ?? publishingChangedGroups ?? seoChangedRuleGroups,
    completedAt: persistedStatus === 'COMPLETE'
      ? previous?.completedAt
        ? new Date(previous.completedAt)
        : new Date()
      : null,
  });
  return createMerchantBusinessProfile(record, registry);
}

export async function saveMerchantPreferenceSection(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  access: MerchantPreferenceAccess,
  untrustedInput: unknown,
) {
  return saveMerchantPreferenceSectionWithContext(
    repository,
    registry,
    access,
    untrustedInput,
    'ONBOARDING',
  );
}

export async function savePermanentMerchantPreferenceSection(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  access: MerchantPreferenceAccess,
  untrustedInput: unknown,
) {
  return saveMerchantPreferenceSectionWithContext(
    repository,
    registry,
    access,
    untrustedInput,
    'PERMANENT_SETTINGS',
  );
}

export function createMerchantPreferenceService(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
) {
  return Object.freeze({
    getProfile: (workspaceId: string) => getMerchantBusinessProfile(
      repository,
      registry,
      workspaceId,
    ),
    getProfileForAccess: (
      access: MerchantPreferenceAccess,
      workspaceId: string,
    ) => getMerchantBusinessProfileForAccess(
      repository,
      registry,
      access,
      workspaceId,
    ),
    getCompletion: (workspaceId: string) => (
      getMerchantBusinessProfileCompletion(repository, registry, workspaceId)
    ),
    getEffectivePreferences: (workspaceId: string) => (
      getEffectiveMerchantPreferences(repository, registry, workspaceId)
    ),
    saveSection: (
      access: MerchantPreferenceAccess,
      input: unknown,
    ) => saveMerchantPreferenceSection(repository, registry, access, input),
    savePermanentSection: (
      access: MerchantPreferenceAccess,
      input: unknown,
    ) => savePermanentMerchantPreferenceSection(
      repository,
      registry,
      access,
      input,
    ),
  });
}
