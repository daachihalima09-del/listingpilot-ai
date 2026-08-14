import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import { defaultListingCraftRegistry, projectCraftPack } from '../../listing-craft/index.ts';
import { calibrateListingDraft } from '../comparison/calibration-engine.ts';
import type { GoldFixtureStatus, NeovixGoldFixture, ProposalStatus } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import { buildCraftRuleProposals, reviewCraftRuleProposal } from '../proposals/proposal-builder.ts';
import type { ListingCalibrationRepository } from '../persistence/repository.ts';
import { goldFixtureSchema } from '../validation/gold-fixture-schema.ts';
import { createGoldFixture, duplicateGoldFixture, transitionGoldFixture, updateGoldFixture } from './gold-fixture.ts';

export interface CalibrationAccess { readonly actorUserId: string; readonly organizationId: string; readonly workspaceId: string; readonly role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' }
export interface CalibrationProject { readonly id: string; readonly workspaceId: string; readonly generatedListing: { readonly listingDraft?: ListingDraft } | null }
export interface CalibrationServiceDependencies { readonly repository: ListingCalibrationRepository; readonly loadProject: (actorUserId: string, workspaceId: string, projectId: string) => Promise<CalibrationProject> }

function scope(access: CalibrationAccess, workspaceId: string, owner = false) {
  if (access.workspaceId !== workspaceId) throw new ListingCalibrationError('CALIBRATION_NOT_FOUND', 'The requested calibration resource is unavailable.', 404);
  if (owner && access.role !== 'OWNER') throw new ListingCalibrationError('CALIBRATION_OWNER_REQUIRED', 'Workspace owner permission is required.', 403);
}
function requireFixture<T>(value: T | null): T { if (!value) throw new ListingCalibrationError('FIXTURE_NOT_FOUND', 'The Gold Fixture is unavailable.', 404); return value; }

export class ListingCalibrationService {
  private readonly dependencies: CalibrationServiceDependencies;

  constructor(dependencies: CalibrationServiceDependencies) {
    this.dependencies = dependencies;
  }

  listFixtures(access: CalibrationAccess, workspaceId: string, filters?: { category?: string; status?: string; search?: string }) { scope(access, workspaceId); return this.dependencies.repository.listFixtures(workspaceId, filters); }
  async getFixture(access: CalibrationAccess, workspaceId: string, fixtureId: string) { scope(access, workspaceId); return requireFixture(await this.dependencies.repository.findFixture(workspaceId, fixtureId)); }
  listReports(access: CalibrationAccess, workspaceId: string, fixtureId?: string) { scope(access, workspaceId); return this.dependencies.repository.listReports(workspaceId, fixtureId); }
  listProposals(access: CalibrationAccess, workspaceId: string, status?: ProposalStatus) { scope(access, workspaceId); return this.dependencies.repository.listProposals(workspaceId, status); }

  async createFixture(access: CalibrationAccess, input: { workspaceId: string; projectId: string; name: string; category: string }) {
    scope(access, input.workspaceId, true);
    const project = await this.dependencies.loadProject(access.actorUserId, input.workspaceId, input.projectId);
    const draft = project.generatedListing?.listingDraft;
    if (!draft) throw new ListingCalibrationError('DRAFT_NOT_FOUND', 'Save a NEOVIX listing draft before creating a Gold Fixture.', 409);
    const fixture = createGoldFixture({ ...input, actorUserId: access.actorUserId, draft });
    return this.dependencies.repository.createFixture(fixture, access.organizationId, { action: 'listing_gold_fixture.created', entityType: 'ListingGoldFixture', entityId: fixture.fixtureId, projectId: fixture.sourceProjectId, status: fixture.approvalStatus, version: fixture.version });
  }

  async updateFixture(access: CalibrationAccess, input: { workspaceId: string; fixtureId: string; expectedVersion: number; fixture: unknown }) {
    scope(access, input.workspaceId, true);
    const current = requireFixture(await this.dependencies.repository.findFixture(input.workspaceId, input.fixtureId));
    if (current.version !== input.expectedVersion) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This Gold Fixture changed. Refresh and try again.', 409);
    const edited = goldFixtureSchema.parse(input.fixture);
    const next = updateGoldFixture(current, edited as NeovixGoldFixture, access.actorUserId);
    const saved = await this.dependencies.repository.updateFixture(next, input.expectedVersion, access.organizationId, access.actorUserId, { action: 'listing_gold_fixture.updated', entityType: 'ListingGoldFixture', entityId: next.fixtureId, projectId: next.sourceProjectId, status: next.approvalStatus, version: next.version });
    if (!saved) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This Gold Fixture changed. Refresh and try again.', 409);
    return saved;
  }

  async duplicateFixture(access: CalibrationAccess, input: { workspaceId: string; fixtureId: string }) {
    scope(access, input.workspaceId, true);
    const current = requireFixture(await this.dependencies.repository.findFixture(input.workspaceId, input.fixtureId));
    const duplicate = duplicateGoldFixture(current, access.actorUserId);
    return this.dependencies.repository.createFixture(duplicate, access.organizationId, { action: 'listing_gold_fixture.created', entityType: 'ListingGoldFixture', entityId: duplicate.fixtureId, projectId: duplicate.sourceProjectId, status: duplicate.approvalStatus, version: duplicate.version });
  }

  async transitionFixture(access: CalibrationAccess, input: { workspaceId: string; fixtureId: string; expectedVersion: number; status: GoldFixtureStatus }) {
    scope(access, input.workspaceId, true);
    const current = requireFixture(await this.dependencies.repository.findFixture(input.workspaceId, input.fixtureId));
    if (current.version !== input.expectedVersion) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This Gold Fixture changed. Refresh and try again.', 409);
    const next = transitionGoldFixture(current, input.status, access.actorUserId);
    const action = { UNDER_REVIEW: 'submitted', APPROVED: 'approved', REJECTED: 'rejected', DEPRECATED: 'deprecated', DRAFT: 'updated' }[input.status];
    const saved = await this.dependencies.repository.updateFixture(next, input.expectedVersion, access.organizationId, access.actorUserId, { action: `listing_gold_fixture.${action}`, entityType: 'ListingGoldFixture', entityId: next.fixtureId, projectId: next.sourceProjectId, status: next.approvalStatus, version: next.version });
    if (!saved) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This Gold Fixture changed. Refresh and try again.', 409);
    return saved;
  }

  async runCalibration(access: CalibrationAccess, input: { workspaceId: string; fixtureId: string }) {
    scope(access, input.workspaceId, true);
    const fixture = requireFixture(await this.dependencies.repository.findFixture(input.workspaceId, input.fixtureId));
    const project = await this.dependencies.loadProject(access.actorUserId, input.workspaceId, fixture.sourceProjectId);
    const draft = project.generatedListing?.listingDraft;
    if (!draft?.reviewWorkspace?.craft) throw new ListingCalibrationError('DRAFT_NOT_FOUND', 'The source draft cannot be calibrated.', 409);
    const pack = defaultListingCraftRegistry.getById(fixture.craftPackId);
    if (!pack) throw new ListingCalibrationError('CRAFT_PACK_UNAVAILABLE', 'The referenced Craft Pack is unavailable.', 409);
    const report = calibrateListingDraft({ workspaceId: input.workspaceId, projectId: project.id, draft, goldFixture: fixture, productTruthReference: { fingerprint: fixture.productTruthFingerprint, facts: fixture.productTruthFacts }, productIntelligenceReference: fixture.productIntelligencePack, craftPackReference: { id: pack.id, version: pack.version, rules: projectCraftPack(pack) }, merchantProfileReferences: {}, reviewWorkspaceState: draft.reviewWorkspace, lockedFields: draft.reviewWorkspace.lockedFields, merchantEdits: draft.reviewWorkspace.editedFields, comparisonOptions: { allowSemanticVariation: true, includeSeo: true } });
    await this.dependencies.repository.createReport(report, access.organizationId, access.actorUserId, { action: 'listing_calibration.completed', entityType: 'ListingCalibrationReport', entityId: report.reportId, projectId: report.projectId, status: report.status, score: report.overallScore, version: report.version });
    const [reports, fixtures] = await Promise.all([this.dependencies.repository.listReports(input.workspaceId), this.dependencies.repository.listFixtures(input.workspaceId, { status: 'APPROVED' })]);
    const fixtureById = new Map(fixtures.map((item) => [item.fixtureId, item]));
    const evidence = reports.flatMap((item) => { const source = fixtureById.get(item.fixtureId); return source ? [{ report: item, fixture: source }] : []; });
    const proposals = buildCraftRuleProposals({ workspaceId: input.workspaceId, actorUserId: access.actorUserId, evidence });
    await this.dependencies.repository.upsertProposals(proposals, access.organizationId, access.actorUserId);
    return report;
  }

  async reviewProposal(access: CalibrationAccess, input: { workspaceId: string; proposalId: string; expectedVersion: number; status: Extract<ProposalStatus, 'APPROVED' | 'REJECTED' | 'DEFERRED'> }) {
    scope(access, input.workspaceId, true);
    const proposal = (await this.dependencies.repository.listProposals(input.workspaceId)).find(({ proposalId }) => proposalId === input.proposalId);
    if (!proposal) throw new ListingCalibrationError('PROPOSAL_NOT_FOUND', 'The rule proposal is unavailable.', 404);
    if (proposal.version !== input.expectedVersion) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This proposal changed. Refresh and try again.', 409);
    const next = reviewCraftRuleProposal(proposal, input.status, access.actorUserId);
    const saved = await this.dependencies.repository.updateProposal(next, input.expectedVersion, access.organizationId, access.actorUserId, { action: `craft_rule_proposal.${input.status.toLocaleLowerCase('en-US')}`, entityType: 'CraftRuleProposal', entityId: next.proposalId, status: next.status, version: next.version });
    if (!saved) throw new ListingCalibrationError('CALIBRATION_VERSION_CONFLICT', 'This proposal changed. Refresh and try again.', 409);
    return saved;
  }
}
