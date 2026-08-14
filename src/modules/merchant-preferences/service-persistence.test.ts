import assert from 'node:assert/strict';
import test from 'node:test';
import {
  merchantProfileCreatedAuditEvent,
  preferenceSectionAuditEvent,
} from './audit.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import {
  MerchantPreferenceConcurrencyError,
  MerchantPreferenceError,
} from './errors.ts';
import type {
  MerchantBusinessProfileRepository,
} from './repository.ts';
import { createMerchantPreferenceService } from './service.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { createListingProfileForStandard } from './listing-standard.ts';
import { createSeoProfile } from './seo-profile.ts';
import { createPublishingProfile } from './publishing-profile.ts';
import { createAiProfile } from './ai-profile.ts';
import type {
  MerchantBusinessProfileRecord,
  MerchantPreferenceSectionRecord,
} from './types.ts';

const workspaceA = '00000000-0000-4000-8000-000000000001';
const workspaceB = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-08-02T12:00:00.000Z');

function access(
  workspaceId = workspaceA,
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' = 'OWNER',
) {
  return {
    actorUserId: '00000000-0000-4000-8000-000000000011',
    organizationId: '00000000-0000-4000-8000-000000000021',
    workspaceId,
    role,
  } as const;
}

function catalogWrite(
  overrides: Partial<{
    workspaceId: string;
    sectionId: 'catalog' | 'ai';
    schemaVersion: number;
    expectedVersion: number | null;
    source: 'MANUAL' | 'SHOPIFY_IMPORT' | 'MERCHANT_EDIT';
    payload: unknown;
  }> = {},
) {
  return {
    workspaceId: workspaceA,
    sectionId: 'catalog' as const,
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL' as const,
    payload: {
      setupMode: 'MANUAL',
      collections: ['Featured'],
      productTypes: ['Table'],
      vendors: ['Northwind'],
    },
    ...overrides,
  };
}

class InMemoryMerchantPreferenceRepository
implements MerchantBusinessProfileRepository {
  readonly records = new Map<string, MerchantBusinessProfileRecord>();
  readonly audits: ReturnType<typeof preferenceSectionAuditEvent>[] = [];
  readonly profileAudits: ReturnType<
  typeof merchantProfileCreatedAuditEvent
  >[] = [];
  failBeforeCommit = false;

  async findByWorkspaceId(workspaceId: string) {
    return this.records.get(workspaceId) ?? null;
  }

  async saveSection(
    input: Parameters<MerchantBusinessProfileRepository['saveSection']>[0],
  ) {
    const existing = this.records.get(input.workspaceId);
    const existingSection = existing?.sections.find(
      ({ sectionId }) => sectionId === input.sectionId,
    );
    if (
      (existingSection
        && existingSection.version !== input.expectedSectionVersion)
      || (!existingSection && input.expectedSectionVersion !== null)
    ) {
      throw new MerchantPreferenceConcurrencyError();
    }
    const nextSectionVersion = (existingSection?.version ?? 0) + 1;
    const section: MerchantPreferenceSectionRecord = {
      id: existingSection?.id ?? `section:${input.workspaceId}:${input.sectionId}`,
      workspaceId: input.workspaceId,
      sectionId: input.sectionId,
      schemaVersion: input.schemaVersion,
      version: nextSectionVersion,
      status: input.status,
      validationStatus: input.validationStatus,
      source: input.source,
      payload: input.payload,
      fingerprint: input.fingerprint,
      metadata: input.metadata,
      completedAt: input.completedAt,
      createdAt: existingSection?.createdAt ?? now,
      updatedAt: now,
    };
    const sections = [
      ...(existing?.sections.filter(
        ({ sectionId }) => sectionId !== input.sectionId,
      ) ?? []),
      section,
    ];
    const next: MerchantBusinessProfileRecord = {
      id: existing?.id ?? `profile:${input.workspaceId}`,
      workspaceId: input.workspaceId,
      version: (existing?.version ?? 0) + 1,
      status: input.status === 'COMPLETE'
        ? 'COMPLETE'
        : input.status === 'NEEDS_REVIEW'
          ? 'NEEDS_REVIEW'
          : input.status === 'INVALID'
            ? 'INVALID'
            : 'INCOMPLETE',
      lastCompletedSectionId: input.status === 'COMPLETE'
        ? input.sectionId
        : existing?.lastCompletedSectionId ?? null,
      fingerprint: stableMerchantPreferenceFingerprint({
        workspaceId: input.workspaceId,
        sections: sections.map(({ sectionId, fingerprint }) => ({
          sectionId,
          fingerprint,
        })),
      }),
      metadata: { architectureVersion: 1 },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      sections,
    };
    if (this.failBeforeCommit) {
      throw new Error('simulated transaction failure');
    }
    this.records.set(input.workspaceId, next);
    if (!existing) {
      this.profileAudits.push(merchantProfileCreatedAuditEvent());
    }
    this.audits.push(preferenceSectionAuditEvent({
      sectionId: input.sectionId,
      source: input.source,
      previousVersion: existingSection?.version ?? null,
      previousStatus: existingSection?.status ?? null,
      newVersion: nextSectionVersion,
      status: input.status,
      changedFields: input.auditChangedFields,
      listingEvent: input.auditEvent,
      seoEvent: input.seoAuditEvent,
      publishingEvent: input.publishingAuditEvent,
      publishingMetadata: input.publishingAuditMetadata,
      aiEvent: input.aiAuditEvent,
      aiMetadata: input.aiAuditMetadata,
    }));
    return next;
  }
}

function context() {
  const repository = new InMemoryMerchantPreferenceRepository();
  return {
    repository,
    service: createMerchantPreferenceService(
      repository,
      createMerchantPreferenceRegistry(),
    ),
  };
}

test('creates and reads a workspace-scoped Catalog preference section', async () => {
  const { repository, service } = context();
  const profile = await service.saveSection(access(), catalogWrite());
  assert.equal(profile.workspaceId, workspaceA);
  assert.equal(profile.sections[0].sectionId, 'catalog');
  assert.equal(profile.sections[0].version, 1);
  assert.equal((await service.getProfile(workspaceB)), null);
  assert.equal(repository.records.size, 1);
});

test('updates the same unique section with an optimistic version', async () => {
  const { repository, service } = context();
  await service.saveSection(access(), catalogWrite());
  const updated = await service.saveSection(access(), catalogWrite({
    expectedVersion: 1,
    source: 'MERCHANT_EDIT',
    payload: {
      setupMode: 'MANUAL',
      collections: ['Featured', 'Sale'],
      productTypes: ['Table'],
      vendors: ['Northwind'],
    },
  }));
  assert.equal(updated.sections.length, 1);
  assert.equal(updated.sections[0].version, 2);
  assert.equal(repository.records.get(workspaceA)?.sections.length, 1);
});

test('rejects stale optimistic versions without changing persisted data', async () => {
  const { repository, service } = context();
  await service.saveSection(access(), catalogWrite());
  await assert.rejects(
    service.saveSection(access(), catalogWrite({ expectedVersion: 99 })),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'PREFERENCE_CONCURRENCY_CONFLICT'
      && error.statusCode === 409
    ),
  );
  assert.equal(repository.records.get(workspaceA)?.sections[0].version, 1);
});

test('leaves no partial profile when a transactional write fails', async () => {
  const { repository, service } = context();
  repository.failBeforeCommit = true;
  await assert.rejects(
    service.saveSection(access(), catalogWrite()),
    /simulated transaction failure/,
  );
  assert.equal(repository.records.size, 0);
  assert.equal(repository.audits.length, 0);
});

test('blocks cross-workspace reads and writes before repository access', async () => {
  const { repository, service } = context();
  await assert.rejects(
    service.getProfileForAccess(access(workspaceA), workspaceB),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'WORKSPACE_FORBIDDEN'
      && error.statusCode === 404
    ),
  );
  await assert.rejects(
    service.saveSection(access(workspaceA), catalogWrite({
      workspaceId: workspaceB,
    })),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'WORKSPACE_FORBIDDEN'
      && error.statusCode === 404
    ),
  );
  assert.equal(repository.records.size, 0);
});

test('allows same-workspace reads but restricts edits to owners', async () => {
  const { repository, service } = context();
  await service.saveSection(access(), catalogWrite());
  const profile = await service.getProfileForAccess(
    access(workspaceA, 'MEMBER'),
    workspaceA,
  );
  assert.equal(profile?.workspaceId, workspaceA);
  await assert.rejects(
    service.saveSection(
      access(workspaceA, 'ADMIN'),
      catalogWrite({ expectedVersion: 1 }),
    ),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'WORKSPACE_FORBIDDEN'
      && error.statusCode === 403
    ),
  );
  assert.equal(repository.records.get(workspaceA)?.sections[0].version, 1);
});

test('rejects unsupported versions and malformed payloads', async () => {
  const { repository, service } = context();
  const cases = [
    {
      input: catalogWrite({ schemaVersion: 2 }),
      code: 'UNSUPPORTED_SECTION_VERSION',
    },
    {
      input: catalogWrite({
        payload: {
          setupMode: 'MANUAL',
          collections: ['   '],
          productTypes: [],
          vendors: [],
        },
      }),
      code: 'INVALID_PREFERENCE_PAYLOAD',
    },
    {
      input: { ...catalogWrite(), unexpected: true },
      code: 'INVALID_PREFERENCE_PAYLOAD',
    },
  ] as const;
  for (const { input, code } of cases) {
    await assert.rejects(
      service.saveSection(access(), input),
      (error: unknown) => (
        error instanceof MerchantPreferenceError
        && error.code === code
      ),
    );
  }
  assert.equal(repository.records.size, 0);
});

test('keeps default resolution isolated by workspace', async () => {
  const { service } = context();
  const left = await service.getEffectivePreferences(workspaceA);
  const right = await service.getEffectivePreferences(workspaceB);
  assert.equal(left.workspaceId, workspaceA);
  assert.equal(right.workspaceId, workspaceB);
  assert.notEqual(left.fingerprint, right.fingerprint);
  assert.deepEqual(left.catalog.collections, []);
  assert.deepEqual(right.catalog.collections, []);
});

test('persists Listing Profiles through the same workspace-scoped concurrency path', async () => {
  const { repository, service } = context();
  const selected = createListingProfileForStandard('NEOVIX');
  const first = await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'listing',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: selected,
  });
  const listing = first.sections.find(({ sectionId }) => sectionId === 'listing');
  assert.equal(listing?.status, 'IN_PROGRESS');
  await assert.rejects(
    service.saveSection(access(), {
      workspaceId: workspaceA,
      sectionId: 'listing',
      schemaVersion: 1,
      expectedVersion: 99,
      source: 'MERCHANT_EDIT',
      payload: { ...selected, configurationStatus: 'CONFIGURED' },
    }),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.code === 'PREFERENCE_CONCURRENCY_CONFLICT',
  );
  assert.equal(repository.records.get(workspaceA)?.sections.find(
    ({ sectionId }) => sectionId === 'listing',
  )?.version, 1);
});

test('permanent Settings changes completed Listing Standards without reopening onboarding', async () => {
  const { service } = context();
  const initial = createListingProfileForStandard('NEOVIX');
  const completed = await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'listing',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: { ...initial, configurationStatus: 'CONFIGURED' },
  });
  let version = completed.sectionVersions.listing!;
  let fingerprint = completed.sections.find(
    ({ sectionId }) => sectionId === 'listing',
  )!.fingerprint;

  for (const standardId of ['MINIMAL', 'CUSTOM', 'NEOVIX'] as const) {
    const updated = await service.savePermanentSection(access(), {
      workspaceId: workspaceA,
      sectionId: 'listing',
      schemaVersion: 1,
      expectedVersion: version,
      source: 'MERCHANT_EDIT',
      payload: createListingProfileForStandard(standardId),
    });
    const listing = updated.sections.find(
      ({ sectionId }) => sectionId === 'listing',
    )!;
    assert.equal(listing.status, 'COMPLETE');
    assert.equal(listing.data && (listing.data as { standardId: string }).standardId, standardId);
    assert.equal(listing.metadata.onboardingCompletionPreserved, true);
    assert.equal(listing.version, version + 1);
    assert.notEqual(listing.fingerprint, fingerprint);
    assert.equal((await service.getProfile(workspaceA))?.sections.find(
      ({ sectionId }) => sectionId === 'listing',
    )?.fingerprint, listing.fingerprint);
    const completion = await service.getCompletion(workspaceA);
    assert.equal(completion.listingComplete, true);
    assert.equal(completion.nextRequiredSection, 'catalog');
    const effective = await service.getEffectivePreferences(workspaceA);
    assert.equal(effective.listing.standardId, standardId);
    assert.equal(effective.listing.source, 'MERCHANT_EDIT');
    version = listing.version;
    fingerprint = listing.fingerprint;
  }
});

test('onboarding still rejects COMPLETE to IN_PROGRESS Listing Standard transitions', async () => {
  const { service } = context();
  const initial = createListingProfileForStandard('NEOVIX');
  await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'listing',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: { ...initial, configurationStatus: 'CONFIGURED' },
  });
  await assert.rejects(
    service.saveSection(access(), {
      workspaceId: workspaceA,
      sectionId: 'listing',
      schemaVersion: 1,
      expectedVersion: 1,
      source: 'MERCHANT_EDIT',
      payload: createListingProfileForStandard('MINIMAL'),
    }),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.code === 'INVALID_COMPLETION_TRANSITION',
  );
});

test('permanent Settings keeps OWNER and workspace boundaries server-enforced', async () => {
  const { repository, service } = context();
  await assert.rejects(
    service.savePermanentSection(access(workspaceA, 'MEMBER'), catalogWrite()),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.statusCode === 403,
  );
  await assert.rejects(
    service.savePermanentSection(access(workspaceA), catalogWrite({
      workspaceId: workspaceB,
    })),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.statusCode === 404,
  );
  assert.equal(repository.records.size, 0);
});

test('persists SEO Profiles with workspace isolation, safe audit and optimistic concurrency', async () => {
  const { repository, service } = context();
  const created = await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'seo',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: createSeoProfile('REVIEW_EXISTING_SEO'),
  });
  const seo = created.sections.find(({ sectionId }) => sectionId === 'seo');
  assert.equal(seo?.status, 'COMPLETE');
  assert.equal(seo?.version, 1);
  assert.equal(repository.audits.at(-1)?.action, 'seo_profile.review_requested');
  assert.deepEqual(repository.audits.at(-1)?.metadata.changedFields, [
    'title', 'metaDescription', 'urlHandle', 'searchIntent', 'keywords',
    'branding', 'imageSeo', 'structuredData', 'indexing', 'quality',
  ]);
  assert.equal(await service.getProfile(workspaceB), null);

  await assert.rejects(
    service.saveSection(access(), {
      workspaceId: workspaceA,
      sectionId: 'seo',
      schemaVersion: 1,
      expectedVersion: 7,
      source: 'MERCHANT_EDIT',
      payload: createSeoProfile('MANUAL'),
    }),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.code === 'PREFERENCE_CONCURRENCY_CONFLICT',
  );
  assert.equal(repository.records.get(workspaceA)?.sections[0]?.version, 1);
});

test('records SEO mode changes without raw profile values in audit metadata', async () => {
  const { repository, service } = context();
  await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'seo',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: createSeoProfile('LISTINGPILOT_STANDARD'),
  });
  const manual = createSeoProfile('MANUAL');
  manual.rules.title.separator = 'DASH';
  await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'seo',
    schemaVersion: 1,
    expectedVersion: 1,
    source: 'MERCHANT_EDIT',
    payload: manual,
  });
  const audit = repository.audits.at(-1);
  assert.equal(audit?.action, 'seo_profile.mode_selected');
  assert.deepEqual(audit?.metadata.changedFields, ['title']);
  assert.doesNotMatch(JSON.stringify(audit), /preferredStoreDisplayName|prohibitedTerms|targetRange/);
});

test('persists Publishing Profiles with OWNER access, optimistic concurrency and safe audit metadata', async () => {
  const { repository, service } = context();
  const created = await service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'publishing',
    schemaVersion: 1,
    expectedVersion: null,
    source: 'MANUAL',
    payload: createPublishingProfile('LISTINGPILOT_SAFE_DEFAULTS'),
  });
  const publishing = created.sections.find(({ sectionId }) => sectionId === 'publishing');
  assert.equal(publishing?.version, 1);
  assert.equal(publishing?.status, 'COMPLETE');
  assert.equal(repository.audits.at(-1)?.action, 'publishing_profile.created');
  assert.equal(repository.audits.at(-1)?.metadata.setupMode, 'LISTINGPILOT_SAFE_DEFAULTS');
  assert.doesNotMatch(JSON.stringify(repository.audits.at(-1)), /approvedNamespaces|accessToken|MANAGED_BY_LISTINGPILOT/i);
  await assert.rejects(service.saveSection(access(), {
    workspaceId: workspaceA,
    sectionId: 'publishing',
    schemaVersion: 1,
    expectedVersion: 99,
    source: 'MERCHANT_EDIT',
    payload: createPublishingProfile('MANUAL'),
  }), (error: unknown) => error instanceof MerchantPreferenceError && error.code === 'PREFERENCE_CONCURRENCY_CONFLICT');
  assert.equal(repository.audits.length, 1);
  assert.equal(repository.records.get(workspaceA)?.sections[0]?.version, 1);
});

test('persists AI Profiles with OWNER access, optimistic concurrency and bounded audit metadata', async () => {
  const { repository, service } = context();
  const created = await service.saveSection(access(), { workspaceId: workspaceA, sectionId: 'ai', schemaVersion: 1, expectedVersion: null, source: 'MANUAL', payload: createAiProfile('LISTINGPILOT_SAFE_AI') });
  const ai = created.sections.find(({ sectionId }) => sectionId === 'ai');
  assert.equal(ai?.version, 1);
  assert.equal(ai?.status, 'COMPLETE');
  assert.equal(repository.audits.at(-1)?.action, 'ai_profile.created');
  assert.equal(repository.audits.at(-1)?.metadata.creativityLevel, 'LOW');
  assert.equal(repository.audits.at(-1)?.metadata.reviewThresholdCount, 4);
  assert.doesNotMatch(JSON.stringify(repository.audits.at(-1)), /prompt|product content|api key|accessToken|INVENT_FACTS/i);
  await assert.rejects(service.saveSection(access(), { workspaceId: workspaceA, sectionId: 'ai', schemaVersion: 1, expectedVersion: 99, source: 'MERCHANT_EDIT', payload: createAiProfile('BALANCED_AI') }), (error: unknown) => error instanceof MerchantPreferenceError && error.code === 'PREFERENCE_CONCURRENCY_CONFLICT');
  assert.equal(repository.audits.length, 1);
  await assert.rejects(service.saveSection(access(workspaceA, 'MEMBER'), { workspaceId: workspaceA, sectionId: 'ai', schemaVersion: 1, expectedVersion: 1, source: 'MERCHANT_EDIT', payload: createAiProfile('BALANCED_AI') }), (error: unknown) => error instanceof MerchantPreferenceError && error.statusCode === 403);
});
