import {
  merchantPreferenceSectionIdSchema,
  type MerchantPreferenceSectionId,
} from './section-ids.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import {
  immutablePreferenceValue,
  safePreferenceMetadata,
} from './immutability.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import type {
  MerchantBusinessProfile,
  MerchantBusinessProfileRecord,
  MerchantPreferenceSection,
} from './types.ts';

function toImmutableSection(
  record: MerchantBusinessProfileRecord['sections'][number],
  profileWorkspaceId: string,
  registry: MerchantPreferenceRegistry,
): { section: MerchantPreferenceSection | null; corrupt: boolean } {
  if (record.workspaceId !== profileWorkspaceId) {
    return { section: null, corrupt: true };
  }
  const sectionIdentity = merchantPreferenceSectionIdSchema.safeParse(
    record.sectionId,
  );
  if (!sectionIdentity.success || !registry.has(sectionIdentity.data)) {
    return { section: null, corrupt: true };
  }
  const definition = registry.get(sectionIdentity.data);
  if (record.schemaVersion !== definition.currentSchemaVersion) {
    return {
      corrupt: true,
      section: immutablePreferenceValue({
        id: record.id,
        workspaceId: record.workspaceId,
        sectionId: sectionIdentity.data,
        schemaVersion: record.schemaVersion,
        version: record.version,
        status: 'INVALID',
        validationStatus: 'INVALID',
        source: record.source,
        data: null,
        fingerprint: record.fingerprint,
        metadata: safePreferenceMetadata(record.metadata),
        completedAt: record.completedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }),
    };
  }
  const parsed = definition.validator.safeParse(record.payload);
  return {
    corrupt: !parsed.success,
    section: immutablePreferenceValue({
      id: record.id,
      workspaceId: record.workspaceId,
      sectionId: sectionIdentity.data,
      schemaVersion: record.schemaVersion,
      version: record.version,
      status: parsed.success ? record.status : 'INVALID',
      validationStatus: parsed.success
        ? record.validationStatus
        : 'INVALID',
      source: record.source,
      data: parsed.success
        ? immutablePreferenceValue(parsed.data)
        : null,
      fingerprint: record.fingerprint,
      metadata: safePreferenceMetadata(record.metadata),
      completedAt: record.completedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }),
  };
}

export function createMerchantBusinessProfile(
  record: MerchantBusinessProfileRecord,
  registry: MerchantPreferenceRegistry,
): MerchantBusinessProfile {
  const sections: MerchantPreferenceSection[] = [];
  const sectionVersions:
  Partial<Record<MerchantPreferenceSectionId, number>> = {};
  const seen = new Set<MerchantPreferenceSectionId>();
  let corrupt = false;
  for (const rawSection of record.sections) {
    const result = toImmutableSection(
      rawSection,
      record.workspaceId,
      registry,
    );
    corrupt ||= result.corrupt;
    if (!result.section) continue;
    if (seen.has(result.section.sectionId)) {
      corrupt = true;
      continue;
    }
    seen.add(result.section.sectionId);
    sections.push(result.section);
    sectionVersions[result.section.sectionId] = result.section.version;
  }
  sections.sort(({ sectionId: left }, { sectionId: right }) => (
    left.localeCompare(right)
  ));
  const lastCompleted = merchantPreferenceSectionIdSchema.safeParse(
    record.lastCompletedSectionId,
  );
  const activeSectionIds = registry.activeSectionIds();
  const fingerprint = stableMerchantPreferenceFingerprint({
    workspaceId: record.workspaceId,
    status: corrupt ? 'INVALID' : record.status,
    activeSectionIds,
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      schemaVersion: section.schemaVersion,
      status: section.status,
      validationStatus: section.validationStatus,
      source: section.source,
      fingerprint: section.fingerprint,
    })),
  });
  return immutablePreferenceValue({
    id: record.id,
    workspaceId: record.workspaceId,
    version: record.version,
    status: corrupt ? 'INVALID' : record.status,
    activeSectionIds,
    sections,
    sectionVersions,
    lastCompletedSectionId: lastCompleted.success
      ? lastCompleted.data
      : null,
    fingerprint,
    metadata: safePreferenceMetadata(record.metadata),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function findMerchantPreferenceSection<T = unknown>(
  profile: MerchantBusinessProfile | null,
  sectionId: MerchantPreferenceSectionId,
): MerchantPreferenceSection<T> | null {
  return (profile?.sections.find(
    (section) => section.sectionId === sectionId,
  ) as MerchantPreferenceSection<T> | undefined) ?? null;
}
