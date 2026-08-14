import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoldFixture, duplicateGoldFixture, transitionGoldFixture, updateGoldFixture } from '../application/gold-fixture.ts';
import { calibrateListingDraft, classifyMerchantEdits } from '../comparison/calibration-engine.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import { goldFixtureFingerprint, validateGoldFixture } from '../validation/gold-fixture-validation.ts';
import { actorId, approvedFixture, calibrationInput, draftFixture, projectId, savedDraft, workspaceId } from './fixtures.ts';

test('creates a versioned immutable Gold Fixture without modifying the saved draft', async () => {
  const draft = await savedDraft();
  const snapshot = structuredClone(draft);
  const fixture = createGoldFixture({ workspaceId, projectId, actorUserId: actorId, draft, name: '  Acme Gold  ', category: 'Televisions' });
  assert.equal(fixture.schemaVersion, 1); assert.equal(fixture.fixtureVersion, '1.0.0'); assert.equal(fixture.approvalStatus, 'DRAFT');
  assert.equal(fixture.name, 'Acme Gold'); assert.equal(fixture.fingerprint, goldFixtureFingerprint(fixture)); assert.deepEqual(draft, snapshot); assert.equal(Object.isFrozen(fixture), true);
});

test('enforces lifecycle, approval evidence and optimistic draft-only editing rules', async () => {
  const draft = await draftFixture();
  const edited = { ...draft, description: 'Merchant-approved calibration reference.', fingerprint: '' };
  const fingerprinted = { ...edited, fingerprint: goldFixtureFingerprint(edited as typeof draft) } as typeof draft;
  const updated = updateGoldFixture(draft, fingerprinted, actorId);
  assert.equal(updated.version, 2);
  const review = transitionGoldFixture(updated, 'UNDER_REVIEW', actorId);
  const approved = transitionGoldFixture(review, 'APPROVED', actorId);
  assert.equal(approved.approvedBy, actorId); assert.ok(approved.approvedAt);
  assert.throws(() => updateGoldFixture(approved, approved, actorId), ListingCalibrationError);
  assert.equal(transitionGoldFixture(approved, 'DEPRECATED', actorId).approvalStatus, 'DEPRECATED');
});

test('duplicates a fixture safely as an independent unapproved draft', async () => {
  const approved = await approvedFixture();
  const copy = duplicateGoldFixture(approved, actorId, { fixtureId: '41000000-0000-4000-8000-000000000041', now: '2026-08-02T00:30:00.000Z' });
  assert.notEqual(copy.fixtureId, approved.fixtureId); assert.equal(copy.approvalStatus, 'DRAFT'); assert.equal(copy.approvedBy, null); assert.equal(copy.version, 1); assert.match(copy.name, /Copy$/u); assert.equal(approved.approvalStatus, 'APPROVED');
});

test('rejects unsupported fixture versions, fingerprints and factual values', async () => {
  const fixture = await draftFixture();
  assert.throws(() => validateGoldFixture({ ...fixture, fixtureVersion: '2.0.0' }), ListingCalibrationError);
  assert.throws(() => validateGoldFixture({ ...fixture, fingerprint: '0'.repeat(16) }), ListingCalibrationError);
  const invalid = { ...fixture, expectedSpecifications: [{ label: 'Resolution', value: '16K', factIds: fixture.expectedSpecifications[0]?.factIds ?? [] }] };
  const fingerprinted = { ...invalid, fingerprint: goldFixtureFingerprint(invalid as typeof fixture) } as typeof fixture;
  assert.throws(() => transitionGoldFixture(transitionGoldFixture(fingerprinted, 'UNDER_REVIEW', actorId), 'APPROVED', actorId), (error: unknown) => error instanceof ListingCalibrationError && error.code === 'FACT_NOT_SUPPORTED_BY_TRUTH');
});

test('produces deterministic excellent, blocked, duplicate and craft-version reports', async () => {
  const input = await calibrationInput();
  const first = calibrateListingDraft(input, { reportId: '50000000-0000-4000-8000-000000000005', now: () => '2026-08-02T01:00:00.000Z' });
  const second = calibrateListingDraft(input, { reportId: '50000000-0000-4000-8000-000000000005', now: () => '2026-08-02T01:00:00.000Z' });
  assert.equal(first.status, 'EXCELLENT_MATCH'); assert.equal(first.overallScore, 100); assert.equal(first.fingerprint, second.fingerprint); assert.deepEqual(first, second);
  const wrong = structuredClone(input); (wrong.draft as { specifications: typeof wrong.draft.specifications }).specifications = wrong.draft.specifications.map((item) => item.label === 'Key Technologies' ? { ...item, value: '16K' } : item);
  const blocked = calibrateListingDraft(wrong); assert.equal(blocked.status, 'BLOCKED'); assert.ok(blocked.findings.some(({ differenceType }) => differenceType === 'FACTUAL_CONFLICT'));
  const duplicate = structuredClone(input); (duplicate.draft as { features: typeof duplicate.draft.features }).features = [duplicate.draft.features[0]!, duplicate.draft.features[0]!];
  assert.ok(calibrateListingDraft(duplicate).findings.some(({ differenceType }) => differenceType === 'DUPLICATION'));
  assert.equal(calibrateListingDraft({ ...input, craftPackReference: { ...input.craftPackReference, version: '9.9.9' } }).metadata.craftVersionMismatch, true);
});

test('applies product-specific exceptions and classifies merchant edits safely', async () => {
  const fixture = await approvedFixture();
  const input = await calibrationInput({ ...fixture, expectedOverview: { ...fixture.expectedOverview, value: `${fixture.expectedOverview.value}\n\n${fixture.expectedOverview.value}` }, productSpecificExceptions: [{ exceptionId: 'exception-1', scope: 'FIXTURE', reason: 'This category uses one paragraph.', affectedFields: ['overview.paragraphs'], temporaryOrPermanent: 'PERMANENT', merchantApproved: true }] });
  const singleParagraph = input;
  const report = calibrateListingDraft(singleParagraph);
  assert.equal(report.findings.some(({ field, differenceType }) => field === 'overview' && differenceType === 'STRUCTURAL_DIFFERENCE'), false);
  assert.deepEqual(report.productSpecificExceptionsApplied, ['exception-1']);
  const classified = classifyMerchantEdits({ ...input, merchantEdits: ['title', 'seo.title', 'catalog.vendor'], lockedFields: ['title'] });
  assert.deepEqual(classified.map(({ type }) => type), ['LOCKED_CONTENT_PREFERENCE', 'SEO_ONLY_CHANGE', 'CATALOG_ONLY_CHANGE']);
});
