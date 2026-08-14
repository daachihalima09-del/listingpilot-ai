import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { GenerationInstructions } from '../../generation-instructions/domain/contracts.ts';
import { validateDraftCraftCompliance } from '../../listing-craft/index.ts';
import type { GenerationProvider, ListingDraft } from '../domain/contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { evaluateListingStyleCompliance, validateListingDraftOutput } from '../validation/draft-validator.ts';
import { createListingDraftReviewWorkspace } from '../review/review-workspace.ts';
import type { ListingGenerationTrace } from '../persistence/generation-trace.server.ts';

export interface ListingDraftEngineOptions {
  readonly provider: GenerationProvider;
  readonly now?: () => string;
  readonly trace?: ListingGenerationTrace;
}

export class ListingDraftEngine {
  private readonly provider: GenerationProvider;
  private readonly now: () => string;
  private readonly trace?: ListingGenerationTrace;

  constructor(options: ListingDraftEngineOptions) {
    this.provider = options.provider;
    this.now = options.now ?? (() => new Date().toISOString());
    this.trace = options.trace;
  }

  async generate(
    instructions: GenerationInstructions,
    signal?: AbortSignal,
  ): Promise<ListingDraft> {
    if (!instructions.groups.SAFETY.generationAllowed) {
      throw new ListingDraftError(
        'DRAFT_GENERATION_BLOCKED',
        'Resolve the blocking product and policy issues before generating a draft.',
        409,
      );
    }
    let providerResult;
    try {
      this.trace?.start('provider_request');
      providerResult = await this.provider.generate(instructions, signal);
    } catch (error) {
      this.trace?.fail(error);
      if (error instanceof ListingDraftError) throw error;
      throw new ListingDraftError(
        'DRAFT_PROVIDER_FAILED',
        error instanceof Error ? error.message : 'The listing draft could not be generated.',
        502,
      );
    }
    this.trace?.start('factual_validation');
    let output;
    try { output = validateListingDraftOutput(providerResult.output, instructions); this.trace?.complete('factual_validation'); } catch (error) { this.trace?.fail(error); throw error; }
    const styleCompliance = evaluateListingStyleCompliance(output, instructions);
    const priorityGroups = Array.isArray(instructions.groups.FEATURES.instructions.priorityGroups)
      ? instructions.groups.FEATURES.instructions.priorityGroups
      : [];
    const priorityFieldIds = priorityGroups.flatMap((group) => group && typeof group === 'object' && 'fieldIds' in group && Array.isArray(group.fieldIds)
      ? group.fieldIds.filter((value: unknown): value is string => typeof value === 'string')
      : []);
    const rawFactBlock = instructions.groups.DESCRIPTION.instructions.structuredFactBlock;
    const structuredFactBlock = rawFactBlock && typeof rawFactBlock === 'object' && 'fields' in rawFactBlock && Array.isArray(rawFactBlock.fields)
      ? rawFactBlock as { required: boolean; fields: readonly { label: string; factIds: readonly string[]; required: boolean }[] }
      : undefined;
    const rawFeatureTarget = instructions.groups.FEATURES.instructions.targetCount;
    this.trace?.start('craft_validation');
    const craftCompliance = instructions.craft
      ? validateDraftCraftCompliance({
          draft: output,
          facts: instructions.allowedFacts,
          craft: instructions.craft,
          productIntelligencePriorityFieldIds: priorityFieldIds,
          ...(structuredFactBlock ? { structuredFactBlock } : {}),
          ...(typeof rawFeatureTarget === 'number' ? { featureTargetCount: rawFeatureTarget } : {}),
        })
      : null;
    this.trace?.complete('craft_validation', { status: craftCompliance?.status ?? 'NOT_APPLICABLE' });
    if (craftCompliance?.status === 'REJECTED') {
      throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The generated draft failed factual Craft compliance.', 422);
    }
    const timestamp = this.now();
    const warnings = [
      ...(instructions.sourcePlan.generationStatus === 'READY_WITH_WARNINGS'
        ? ['The source plan contains non-blocking warnings. Review the complete draft before saving.']
        : []),
      ...styleCompliance.findings
        .filter(({ severity }) => severity !== 'ERROR')
        .map(({ message }) => message),
    ];
    const productTruthSummary = instructions.allowedFacts.map((fact) =>
      `${fact.fieldId}: ${fact.value} (${fact.truthStatus}, ${Math.round(fact.confidence * 100)}% confidence)`);
    const aiDetectiveSummary = instructions.groups.SAFETY.blockedClaims.length
      ? instructions.groups.SAFETY.blockedClaims.map(({ reason }) => reason)
      : ['No blocking intelligence findings were projected into this draft.'];
    const draftFingerprint = new DeterministicHasher().hash({
      sourceInstructionFingerprint: instructions.instructionFingerprint,
      output,
      providerRequestId: providerResult.requestId,
    });
    return immutableCopy({
      draftId: `listing_draft_${draftFingerprint}`,
      schemaVersion: 1,
      draftVersion: '1.0.0',
      projectId: instructions.sourcePlan.projectId,
      workspaceId: instructions.sourcePlan.workspaceId,
      sourceInstructionFingerprint: instructions.instructionFingerprint,
      providerRequestId: providerResult.requestId,
      status: 'GENERATED',
      ...output,
      warnings,
      productTruthSummary,
      aiDetectiveSummary,
      reviewWorkspace: createListingDraftReviewWorkspace(output, instructions, craftCompliance ?? undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: {
        generationStatus: instructions.sourcePlan.generationStatus,
        selectedFactCount: instructions.allowedFacts.length,
        merchantEdited: false,
        listingStandardId: instructions.sourcePlan.listingStandardId,
        listingProfileVersion: instructions.sourcePlan.listingProfileVersion,
        listingProfileFingerprint: instructions.sourcePlan.listingProfileFingerprint,
        descriptionStructure: String(instructions.groups.DESCRIPTION.instructions.structure),
        styleComplianceStatus: styleCompliance.status,
        styleFindingCount: styleCompliance.findings.length,
        ...(craftCompliance ? {
          craftPackId: craftCompliance.packId,
          craftPackVersion: craftCompliance.packVersion,
          craftComplianceStatus: craftCompliance.status,
          craftFindingSummary: craftCompliance.summary,
        } : {}),
      },
    }) as ListingDraft;
  }
}
