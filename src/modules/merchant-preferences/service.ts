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

export async function saveMerchantPreferenceSection(
  repository: MerchantBusinessProfileRepository,
  registry: MerchantPreferenceRegistry,
  access: MerchantPreferenceAccess,
  untrustedInput: unknown,
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
  if (previous) {
    if (input.expectedVersion !== previous.version) {
      throw new MerchantPreferenceError(
        'PREFERENCE_CONCURRENCY_CONFLICT',
        409,
        'These merchant preferences were updated elsewhere. Reload before saving again.',
      );
    }
    assertMerchantPreferenceStatusTransition(
      previous.status,
      completion.status,
    );
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
      : completion.complete && previous.status !== 'COMPLETE'
        ? 'COMPLETED'
        : 'UPDATED'
    : undefined;
  const record = await repository.saveSection({
    actorUserId: access.actorUserId,
    organizationId: access.organizationId,
    workspaceId: access.workspaceId,
    sectionId: input.sectionId,
    schemaVersion: input.schemaVersion,
    expectedSectionVersion: input.expectedVersion,
    status: completion.status,
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
    },
    auditEvent,
    completedAt: completion.complete ? new Date() : null,
  });
  return createMerchantBusinessProfile(record, registry);
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
  });
}
