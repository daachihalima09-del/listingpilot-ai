import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ListingCalibrationService } from '../application/calibration-service.ts';
import { calibrateListingDraft } from '../comparison/calibration-engine.ts';
import type { CraftRuleAdjustmentProposal, ListingCalibrationReport, NeovixGoldFixture } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import type { ListingCalibrationRepository } from '../persistence/repository.ts';
import { buildCraftRuleProposals, reviewCraftRuleProposal } from '../proposals/proposal-builder.ts';
import { actorId, approvedFixture, calibrationInput, projectId, reportWithReusableFinding, savedDraft, workspaceId } from './fixtures.ts';

async function evidence(count: number) {
  const base = calibrateListingDraft(await calibrationInput());
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const id = `40000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
    const fixture = await approvedFixture(id);
    return { fixture, report: reportWithReusableFinding({ ...base, fixtureId: id }, `finding-${index}`) };
  }));
}

test('requires repeated approved evidence, reduces confidence for contradictions and never mutates Craft Pack code', async () => {
  assert.equal(buildCraftRuleProposals({ workspaceId, actorUserId: actorId, evidence: await evidence(1) }).length, 0);
  const repeated = buildCraftRuleProposals({ workspaceId, actorUserId: actorId, evidence: await evidence(3), now: () => '2026-08-02T02:00:00.000Z' });
  assert.equal(repeated.length, 1); assert.equal(repeated[0]!.status, 'READY_FOR_REVIEW'); assert.equal(repeated[0]!.confidence, 1);
  const approved = reviewCraftRuleProposal(repeated[0]!, 'APPROVED', actorId); assert.equal(approved.status, 'APPROVED'); assert.equal(approved.version, 2);
  const mixed = [...await evidence(3), { fixture: await approvedFixture('40000000-0000-4000-8000-000000000099'), report: calibrateListingDraft(await calibrationInput()) }];
  const contradicted = buildCraftRuleProposals({ workspaceId, actorUserId: actorId, evidence: mixed, thresholds: { minimumApprovedFixtures: 3, minimumRepeatedSignalCount: 3, minimumProposalConfidence: 0, maximumContradictingFixtureRatio: 1 } });
  assert.ok(contradicted[0]!.confidence < 1); assert.equal(Object.isFrozen(approved), true);
});

class MemoryRepository implements ListingCalibrationRepository {
  fixtures: NeovixGoldFixture[] = []; reports: ListingCalibrationReport[] = []; proposals: CraftRuleAdjustmentProposal[] = []; audits: string[] = [];
  async listFixtures(id: string) { return this.fixtures.filter(({ workspaceId: scope }) => scope === id); }
  async findFixture(id: string, fixtureId: string) { return this.fixtures.find((item) => item.workspaceId === id && item.fixtureId === fixtureId) ?? null; }
  async createFixture(fixture: NeovixGoldFixture, _organizationId: string, audit: { action: string }) { this.fixtures.push(fixture); this.audits.push(audit.action); return fixture; }
  async updateFixture(fixture: NeovixGoldFixture, expectedVersion: number, _organizationId: string, _actor: string, audit: { action: string }) { const index = this.fixtures.findIndex((item) => item.fixtureId === fixture.fixtureId && item.version === expectedVersion); if (index < 0) return null; this.fixtures[index] = fixture; this.audits.push(audit.action); return fixture; }
  async listReports(id: string) { return this.reports.filter(({ workspaceId: scope }) => scope === id); }
  async createReport(report: ListingCalibrationReport, _organizationId: string, _actor: string, audit: { action: string }) { this.reports.push(report); this.audits.push(audit.action); return report; }
  async listProposals(id: string) { return this.proposals.filter(({ workspaceId: scope }) => scope === id); }
  async upsertProposals(items: readonly CraftRuleAdjustmentProposal[]) { for (const item of items) if (!this.proposals.some(({ fingerprint }) => fingerprint === item.fingerprint)) this.proposals.push(item); }
  async updateProposal(proposal: CraftRuleAdjustmentProposal, expectedVersion: number, _organizationId: string, _actor: string, audit: { action: string }) { const index = this.proposals.findIndex((item) => item.proposalId === proposal.proposalId && item.version === expectedVersion); if (index < 0) return null; this.proposals[index] = proposal; this.audits.push(audit.action); return proposal; }
}

test('service scopes reads, requires OWNER writes and rejects stale updates without audit', async () => {
  const repository = new MemoryRepository(); const draft = await savedDraft();
  const service = new ListingCalibrationService({ repository, loadProject: async () => ({ id: projectId, workspaceId, generatedListing: { listingDraft: draft } }) });
  const member = { actorUserId: actorId, organizationId: '60000000-0000-4000-8000-000000000006', workspaceId, role: 'MEMBER' as const };
  await assert.rejects(service.createFixture(member, { workspaceId, projectId, name: 'Gold draft', category: 'Televisions' }), (error: unknown) => error instanceof ListingCalibrationError && error.statusCode === 403);
  const owner = { ...member, role: 'OWNER' as const }; const fixture = await service.createFixture(owner, { workspaceId, projectId, name: 'Gold draft', category: 'Televisions' });
  assert.equal(repository.audits.at(-1), 'listing_gold_fixture.created'); assert.equal((await service.listFixtures(member, workspaceId)).length, 1);
  await assert.rejects(service.transitionFixture(owner, { workspaceId, fixtureId: fixture.fixtureId, expectedVersion: 99, status: 'UNDER_REVIEW' }), (error: unknown) => error instanceof ListingCalibrationError && error.statusCode === 409);
  assert.equal(repository.audits.length, 1);
  assert.throws(() => service.listFixtures(member, '70000000-0000-4000-8000-000000000007'), (error: unknown) => error instanceof ListingCalibrationError && error.statusCode === 404);
});

test('architecture exposes protected APIs and OWNER-only Gold Library action with accessible UI states', async () => {
  const [fixturesRoute, proposalRoute, review, workspace, craft] = await Promise.all([
    readFile('src/app/api/listing-calibration/fixtures/route.ts', 'utf8'), readFile('src/app/api/listing-calibration/proposals/[proposalId]/route.ts', 'utf8'), readFile('src/modules/listing-draft/review/ListingDraftReview.tsx', 'utf8'), readFile('src/modules/listing-calibration/review/CalibrationWorkspace.tsx', 'utf8'), readFile('src/modules/listing-craft/packs/neovix/neovix-craft-pack.ts', 'utf8'),
  ]);
  assert.match(fixturesRoute, /resolveCalibrationRequestAccess/); assert.match(proposalRoute, /reviewProposal/); assert.match(review, /Add to NEOVIX Gold Library/); assert.match(workspace, /role="tablist"/); assert.match(workspace, /aria-label="Filter fixtures by status"/); assert.match(workspace, /No Gold Fixtures/); assert.match(workspace, /Duplicate safely/); assert.match(workspace, /Save fixture changes/); assert.doesNotMatch(craft, /listing-calibration/);
});

test('calibrates 1,000 fixtures and aggregates 10,000 reusable signals deterministically', async () => {
  const input = await calibrationInput(); let last = '';
  for (let index = 0; index < 1_000; index += 1) last = calibrateListingDraft(input, { reportId: '50000000-0000-4000-8000-000000000005', now: () => '2026-08-02T01:00:00.000Z' }).fingerprint;
  assert.equal(last.length, 16);
  const baseEvidence = await evidence(3); const large = Array.from({ length: 10_000 }, (_, index) => ({ fixture: baseEvidence[index % 3]!.fixture, report: { ...baseEvidence[index % 3]!.report, findings: [{ ...baseEvidence[index % 3]!.report.findings[0]!, findingId: `signal-${index}` }] } }));
  const proposals = buildCraftRuleProposals({ workspaceId, actorUserId: actorId, evidence: large }); assert.equal(proposals.length, 1); assert.equal(proposals[0]!.metadata.signalCount, 3);
});
