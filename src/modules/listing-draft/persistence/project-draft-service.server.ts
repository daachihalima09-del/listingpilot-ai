import 'server-only';

import { createGenerationInstructions } from '../../generation-instructions/index.ts';
import {
  canonicalGenerationEligibility,
  createProjectListingGenerationPlan,
} from '../../listing-generation/index.ts';
import { createServerMerchantPreferenceService } from '../../merchant-preferences/composition.server.ts';
import { resolveMerchantListingProfileAccess } from '../../onboarding/listing-profile/listing-profile-context.server.ts';
import { getUserProject, saveUserProjectState } from '../../projects/server/project-operations.ts';
import { getUserProduct, saveUserProductState } from '../../products/services/product-service.server.ts';
import { createOpenAiGenerationProvider } from '../adapter/openai-generation-provider.server.ts';
import { createOpenAiRegenerationProvider } from '../adapter/openai-regeneration-provider.server.ts';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import { ListingDraftRegenerationEngine } from '../builder/regeneration-engine.ts';
import type { DraftRegenerationSection, ListingDraft } from '../domain/contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { listingDraftSchema } from '../validation/draft-schema.ts';
import {
  assertListingDraftSaveIdentity,
  listingDraftProjectFields,
  prepareListingDraftForSave,
} from './draft-persistence.ts';
import { generatedListingReadiness } from './authoritative-draft-state.ts';
import { generateAndPersistListingDraft } from './generation-lifecycle.ts';
import type { ListingGenerationTrace } from './generation-trace.server.ts';

async function generationContext(actorUserId: string, workspaceId: string, projectId: string, containerProjectId?: string, trace?: ListingGenerationTrace) {
  trace?.start('authorization');
  await resolveMerchantListingProfileAccess(actorUserId, workspaceId, true);
  trace?.complete('authorization');
  trace?.start('project_load');
  const project = containerProjectId
    ? await getUserProduct(actorUserId, { workspaceId, projectId: containerProjectId, productId: projectId })
    : await getUserProject(actorUserId, { workspaceId, projectId });
  trace?.complete('project_load', {
    projectName: project.name,
    productIdentity: {
      brand: project.analysisData?.activeProduct.brand ?? null,
      model: project.analysisData?.activeProduct.model ?? null,
    },
  });
  trace?.context({ workspaceId, projectVersion: project.version, product: { brand: project.analysisData?.activeProduct.brand ?? null, model: project.analysisData?.activeProduct.model ?? null, type: project.analysisData?.activeProduct.panel ?? null } });
  if (project.status === 'ARCHIVED') {
    throw new ListingDraftError('DRAFT_FORBIDDEN', 'Restore this project before generating a listing draft.', 409);
  }
  if (!project.analysisData) {
    throw new ListingDraftError('DRAFT_GENERATION_BLOCKED', 'Analyze the project before generating a listing draft.', 409);
  }

  trace?.start('merchant_profile');
  const preferences = createServerMerchantPreferenceService();
  const [businessProfile, effectivePreferences] = await Promise.all([
    preferences.getProfile(workspaceId),
    preferences.getEffectivePreferences(workspaceId),
  ]);
  trace?.complete('merchant_profile');
  if (!businessProfile) {
    throw new ListingDraftError(
      'DRAFT_GENERATION_BLOCKED',
      'Complete the merchant profile before generating a listing draft.',
      409,
    );
  }
  trace?.start('generation_plan');
  const plan = createProjectListingGenerationPlan({ project, effectivePreferences, businessProfile });
  trace?.complete('generation_plan', { eligibility: plan.generationStatus });
  trace?.start('generation_eligibility');
  const eligibility = canonicalGenerationEligibility(plan);
  trace?.complete('generation_eligibility', { canGenerate: eligibility.canGenerate, status: eligibility.status });
  trace?.start('generation_instructions');
  const instructions = createGenerationInstructions(plan);
  trace?.complete('generation_instructions', { instructionFingerprint: instructions.instructionFingerprint });
  trace?.context({ instructionFingerprint: instructions.instructionFingerprint });
  return {
    project,
    eligibility,
    instructions,
  };
}

export async function getProjectListingGenerationEligibility(input: {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly containerProjectId?: string;
}) {
  const context = await generationContext(input.actorUserId, input.workspaceId, input.projectId, input.containerProjectId);
  return { eligibility: context.eligibility, projectVersion: context.project.version };
}

export async function generateProjectListingDraft(input: {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly containerProjectId?: string;
  readonly version: number;
  readonly signal?: AbortSignal;
  readonly trace?: ListingGenerationTrace;
}) {
  const context = await generationContext(input.actorUserId, input.workspaceId, input.projectId, input.containerProjectId, input.trace);
  if (!context.eligibility.canGenerate) {
    throw new ListingDraftError(
      'DRAFT_GENERATION_BLOCKED',
      context.eligibility.blockingFindings[0]?.explanation ?? 'Generation is blocked by a project safety requirement.',
      409,
      { eligibility: context.eligibility },
    );
  }
  const readinessData = generatedListingReadiness(context.project.readinessData);
  const result = await generateAndPersistListingDraft({
    expectedVersion: input.version,
    currentVersion: context.project.version,
    generate: () => new ListingDraftEngine({ provider: createOpenAiGenerationProvider(input.trace), trace: input.trace })
      .generate(context.instructions, input.signal),
    persist: (draft) => {
      input.trace?.start('persistence');
      const state = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      version: input.version,
      sourceType: context.project.sourceType,
      sourceUrl: context.project.sourceUrl,
      rawInput: context.project.rawInput,
      analysisData: context.project.analysisData,
      ...listingDraftProjectFields(draft),
      readinessData,
      };
      const operation = input.containerProjectId
        ? saveUserProductState(input.actorUserId, { ...state, projectId: input.containerProjectId, productId: input.projectId })
        : saveUserProjectState(input.actorUserId, state);
      return operation.then((project) => {
        input.trace?.complete('persistence');
        return project;
      });
    },
  });
  return { ...result, readinessData };
}

export async function saveProjectListingDraft(input: {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly containerProjectId?: string;
  readonly version: number;
  readonly draft: unknown;
  readonly now?: () => string;
}) {
  const context = await generationContext(input.actorUserId, input.workspaceId, input.projectId, input.containerProjectId);
  if (context.project.version !== input.version) {
    throw new ListingDraftError('DRAFT_STALE_WRITE', 'A newer project version exists. Refresh before saving this draft.', 409);
  }
  const parsed = listingDraftSchema.safeParse(input.draft);
  if (!parsed.success) {
    throw new ListingDraftError('DRAFT_INVALID_PROVIDER_OUTPUT', 'The edited listing draft is incomplete or malformed.', 400);
  }
  assertListingDraftSaveIdentity(parsed.data as ListingDraft, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    instructionFingerprint: context.instructions.instructionFingerprint,
    persistedDraftId: context.project.generatedListing?.listingDraft?.draftId ?? null,
  });

  const draft = prepareListingDraftForSave(
    parsed.data,
    context.instructions,
    (input.now ?? (() => new Date().toISOString()))(),
  );
  const projectFields = listingDraftProjectFields(draft);
  const state = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    version: input.version,
    sourceType: context.project.sourceType,
    sourceUrl: context.project.sourceUrl,
    rawInput: context.project.rawInput,
    analysisData: context.project.analysisData,
    ...projectFields,
    readinessData: context.project.readinessData,
  };
  const project = input.containerProjectId
    ? await saveUserProductState(input.actorUserId, { ...state, projectId: input.containerProjectId, productId: input.projectId })
    : await saveUserProjectState(input.actorUserId, state);
  return { draft, project };
}

export async function regenerateProjectListingDraft(input: {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly containerProjectId?: string;
  readonly version: number;
  readonly section: DraftRegenerationSection;
  readonly signal?: AbortSignal;
}) {
  await resolveMerchantListingProfileAccess(input.actorUserId, input.workspaceId, true);
  const project = input.containerProjectId
    ? await getUserProduct(input.actorUserId, { workspaceId: input.workspaceId, projectId: input.containerProjectId, productId: input.projectId })
    : await getUserProject(input.actorUserId, { workspaceId: input.workspaceId, projectId: input.projectId });
  if (project.version !== input.version) {
    throw new ListingDraftError('DRAFT_STALE_WRITE', 'A newer project version exists. Refresh before regenerating.', 409);
  }
  if (project.status === 'ARCHIVED') {
    throw new ListingDraftError('DRAFT_FORBIDDEN', 'Restore this project before regenerating a listing section.', 409);
  }
  const storedDraft = project.generatedListing?.listingDraft;
  if (!storedDraft) {
    throw new ListingDraftError('DRAFT_NOT_FOUND', 'Save the listing draft before regenerating a section.', 409);
  }
  const engine = new ListingDraftRegenerationEngine(createOpenAiRegenerationProvider());
  const draft = await engine.regenerate(storedDraft as ListingDraft, input.section, input.signal);
  const projectFields = listingDraftProjectFields(draft);
  const state = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    version: input.version,
    sourceType: project.sourceType,
    sourceUrl: project.sourceUrl,
    rawInput: project.rawInput,
    analysisData: project.analysisData,
    ...projectFields,
    readinessData: project.readinessData,
  };
  const savedProject = input.containerProjectId
    ? await saveUserProductState(input.actorUserId, { ...state, projectId: input.containerProjectId, productId: input.projectId })
    : await saveUserProjectState(input.actorUserId, state);
  return { draft, project: savedProject };
}
