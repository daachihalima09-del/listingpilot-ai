import { randomUUID } from 'node:crypto';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { GoldFixtureStatus, NeovixGoldFixture } from '../domain/contracts.ts';
import { GOLD_FIXTURE_SCHEMA_VERSION, GOLD_FIXTURE_VERSION } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import { goldFixtureFingerprint, unsupportedFixtureClaims, validateGoldFixture } from '../validation/gold-fixture-validation.ts';

export function selectedProductTruthFingerprint(draft: ListingDraft): string {
  const facts = draft.reviewWorkspace?.facts ?? [];
  return new DeterministicHasher().hash(facts.map(({ factId, fieldId, value, status }) => ({ factId, fieldId: fieldId ?? '', value, status })).sort((left, right) => left.factId.localeCompare(right.factId)));
}

export function createGoldFixture(input: Readonly<{ workspaceId: string; projectId: string; actorUserId: string; draft: ListingDraft; name: string; category: string; now?: () => string; fixtureId?: string }>): NeovixGoldFixture {
  if (input.draft.workspaceId !== input.workspaceId || input.draft.projectId !== input.projectId || input.draft.status !== 'SAVED') throw new ListingCalibrationError('DRAFT_NOT_APPROVED_FOR_FIXTURE', 'Save and approve the draft before adding it to the Gold Library.', 409);
  const workspace = input.draft.reviewWorkspace;
  if (!workspace?.craft || workspace.craft.packId !== 'neovix') throw new ListingCalibrationError('NEOVIX_FIXTURE_REQUIRED', 'Only NEOVIX drafts can be added to the NEOVIX Gold Library.', 409);
  const now = (input.now ?? (() => new Date().toISOString()))();
  const facts = workspace.facts.map(({ factId, fieldId, value, status }) => ({ factId, fieldId: fieldId ?? '', value, status }));
  const byField = new Map(facts.map((fact) => [fact.fieldId, fact.value]));
  const base = {
    fixtureId: input.fixtureId ?? randomUUID(), schemaVersion: GOLD_FIXTURE_SCHEMA_VERSION, fixtureVersion: GOLD_FIXTURE_VERSION, version: 1,
    workspaceId: input.workspaceId, name: input.name.trim(), description: '', category: input.category.trim(),
    productIdentity: { brand: byField.get('brand') ?? null, model: byField.get('model') ?? null, productType: byField.get('product_type') ?? null, variant: byField.get('variant') ?? null },
    sourceProjectId: input.projectId, sourceDraftId: input.draft.draftId, productTruthFingerprint: selectedProductTruthFingerprint(input.draft), productTruthFacts: facts, merchantOverrides: [],
    productIntelligencePack: null, craftPackId: workspace.craft.packId, craftPackVersion: workspace.craft.packVersion,
    expectedTitle: input.draft.title, expectedSpecifications: input.draft.specifications, expectedOverview: input.draft.overview, expectedFeatures: input.draft.features,
    expectedSeo: input.draft.seo, expectedCatalog: input.draft.catalog,
    requiredBehaviors: ['Specifications-first structure', 'Verified product identity preserved'], prohibitedBehaviors: ['Unsupported factual claims', 'Excessive promotional wording'], allowedVariations: ['Semantically equivalent factual wording'], productSpecificExceptions: [], merchantNotes: [],
    approvalStatus: 'DRAFT' as const, approvedBy: null, approvedAt: null, createdBy: input.actorUserId, createdAt: now, updatedAt: now, metadata: { lastCalibrationScore: null },
  };
  const fixture = { ...base, fingerprint: '' } as NeovixGoldFixture;
  return validateGoldFixture({ ...fixture, fingerprint: goldFixtureFingerprint(fixture) });
}

export function transitionGoldFixture(fixture: NeovixGoldFixture, status: GoldFixtureStatus, actorUserId: string, now = new Date().toISOString()): NeovixGoldFixture {
  const allowed: Readonly<Record<GoldFixtureStatus, readonly GoldFixtureStatus[]>> = {
    DRAFT: ['UNDER_REVIEW'], UNDER_REVIEW: ['APPROVED', 'REJECTED'], APPROVED: ['DEPRECATED'], REJECTED: ['DRAFT'], DEPRECATED: [],
  };
  if (!allowed[fixture.approvalStatus].includes(status)) throw new ListingCalibrationError('INVALID_FIXTURE_TRANSITION', 'This Gold Fixture status transition is not allowed.', 409);
  if (status === 'APPROVED' && unsupportedFixtureClaims(fixture).length) throw new ListingCalibrationError('FACT_NOT_SUPPORTED_BY_TRUTH', 'Resolve unsupported factual content before approving this Gold Fixture.', 409);
  const next = { ...fixture, version: fixture.version + 1, approvalStatus: status, approvedBy: status === 'APPROVED' ? actorUserId : null, approvedAt: status === 'APPROVED' ? now : null, updatedAt: now };
  return immutableCopy(next) as NeovixGoldFixture;
}

export function updateGoldFixture(fixture: NeovixGoldFixture, edited: NeovixGoldFixture, actorUserId: string, now = new Date().toISOString()): NeovixGoldFixture {
  if (fixture.fixtureId !== edited.fixtureId || fixture.workspaceId !== edited.workspaceId || fixture.approvalStatus !== 'DRAFT') throw new ListingCalibrationError('FIXTURE_NOT_EDITABLE', 'Only draft Gold Fixtures can be edited.', 409);
  const next = { ...edited, version: fixture.version + 1, approvalStatus: 'DRAFT' as const, approvedBy: null, approvedAt: null, createdBy: fixture.createdBy || actorUserId, createdAt: fixture.createdAt, updatedAt: now, fingerprint: '' };
  return validateGoldFixture({ ...next, fingerprint: goldFixtureFingerprint(next as NeovixGoldFixture) });
}

export function duplicateGoldFixture(fixture: NeovixGoldFixture, actorUserId: string, options: { fixtureId?: string; now?: string } = {}): NeovixGoldFixture {
  const now = options.now ?? new Date().toISOString();
  const duplicate = {
    ...fixture,
    fixtureId: options.fixtureId ?? randomUUID(),
    version: 1,
    name: `${fixture.name} Copy`,
    approvalStatus: 'DRAFT' as const,
    approvedBy: null,
    approvedAt: null,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
    fingerprint: '',
    metadata: { lastCalibrationScore: null },
  };
  return validateGoldFixture({ ...duplicate, fingerprint: goldFixtureFingerprint(duplicate as NeovixGoldFixture) });
}
