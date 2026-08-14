import { ListingDraftEngine } from '../../listing-draft/builder/draft-engine.ts';
import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import { draftInstructions, validProviderOutput } from '../../listing-draft/tests/fixtures.ts';
import { neovixCraftRulePack, projectCraftPack } from '../../listing-craft/index.ts';
import { createGoldFixture, transitionGoldFixture } from '../application/gold-fixture.ts';
import type { ListingCalibrationInput, ListingCalibrationReport, NeovixGoldFixture } from '../domain/contracts.ts';

export const workspaceId = '10000000-0000-4000-8000-000000000001';
export const projectId = '20000000-0000-4000-8000-000000000002';
export const actorId = '30000000-0000-4000-8000-000000000003';

export async function savedDraft(): Promise<ListingDraft> {
  const instructions = draftInstructions();
  const generated = await new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: 'req_calibration' }) },
    now: () => '2026-08-02T00:00:00.000Z',
  }).generate(instructions);
  return structuredClone({ ...generated, projectId, workspaceId, status: 'SAVED' as const });
}

export async function draftFixture(): Promise<NeovixGoldFixture> {
  return createGoldFixture({ workspaceId, projectId, actorUserId: actorId, draft: await savedDraft(), name: 'Acme X1000 Gold', category: 'Televisions', fixtureId: '40000000-0000-4000-8000-000000000004', now: () => '2026-08-02T00:01:00.000Z' });
}

export async function approvedFixture(id = '40000000-0000-4000-8000-000000000004'): Promise<NeovixGoldFixture> {
  const fixture = { ...(await draftFixture()), fixtureId: id } as NeovixGoldFixture;
  const { goldFixtureFingerprint } = await import('../validation/gold-fixture-validation.ts');
  const fingerprinted = { ...fixture, fingerprint: goldFixtureFingerprint(fixture) } as NeovixGoldFixture;
  return transitionGoldFixture(transitionGoldFixture(fingerprinted, 'UNDER_REVIEW', actorId), 'APPROVED', actorId);
}

export async function calibrationInput(sourceFixture?: NeovixGoldFixture): Promise<ListingCalibrationInput> {
  const fixture = sourceFixture ?? await approvedFixture();
  const draft = await savedDraft();
  return {
    workspaceId, projectId, draft, goldFixture: fixture,
    productTruthReference: { fingerprint: fixture.productTruthFingerprint, facts: fixture.productTruthFacts },
    productIntelligenceReference: fixture.productIntelligencePack,
    craftPackReference: { id: neovixCraftRulePack.id, version: neovixCraftRulePack.version, rules: projectCraftPack(neovixCraftRulePack) },
    merchantProfileReferences: {}, reviewWorkspaceState: draft.reviewWorkspace,
    lockedFields: draft.reviewWorkspace?.lockedFields ?? [], merchantEdits: draft.reviewWorkspace?.editedFields ?? [],
    comparisonOptions: { allowSemanticVariation: true, includeSeo: true },
  };
}

export function reportWithReusableFinding(report: ListingCalibrationReport, findingId: string): ListingCalibrationReport {
  return { ...report, findings: [{ findingId, section: 'FEATURES', field: 'features', differenceType: 'DUPLICATION', severity: 'HIGH', message: 'Repeated feature concepts should be removed.', expected: 'Unique feature concepts', actual: null, relatedFactIds: [], craftRuleId: 'neovix.duplication.semantic', reusableSignal: true, productSpecific: false, scorePenalty: 16 }] };
}
