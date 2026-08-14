import type { GenerationInstructions } from '../../generation-instructions/domain/contracts.ts';
import type { ListingDraft, ListingDraftProviderOutput } from '../domain/contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { listingDraftSchema } from '../validation/draft-schema.ts';
import { evaluateListingStyleCompliance, validateListingDraftOutput } from '../validation/draft-validator.ts';
export { listingDraftProjectFields } from './authoritative-draft-state.ts';

function providerOutput(draft: ListingDraft): ListingDraftProviderOutput {
  return {
    title: draft.title,
    overview: draft.overview,
    specifications: draft.specifications,
    features: draft.features,
    whatsIncluded: draft.whatsIncluded,
    seo: draft.seo,
    catalog: draft.catalog,
    metafields: draft.metafields,
    media: draft.media,
    reviewNotes: draft.reviewNotes,
    confidence: draft.confidence,
  };
}

export function prepareListingDraftForSave(
  value: unknown,
  instructions: GenerationInstructions,
  now: string,
): ListingDraft {
  const parsed = listingDraftSchema.parse(value);
  const output = providerOutput(parsed as ListingDraft);
  validateListingDraftOutput(output, instructions, { enforceListingStyle: false });
  const usesCurrentStyle = parsed.sourceInstructionFingerprint
    === instructions.instructionFingerprint;
  const styleCompliance = usesCurrentStyle
    ? evaluateListingStyleCompliance(output, instructions)
    : null;
  return listingDraftSchema.parse({
    ...parsed,
    status: 'SAVED',
    updatedAt: now,
    metadata: {
      ...parsed.metadata,
      merchantEdited: true,
      ...(styleCompliance
        ? {
            styleComplianceStatus: styleCompliance.status,
            styleFindingCount: styleCompliance.findings.length,
          }
        : {}),
    },
  }) as ListingDraft;
}

export function assertListingDraftSaveIdentity(
  draft: ListingDraft,
  expected: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly instructionFingerprint: string;
    readonly persistedDraftId: string | null;
  },
): void {
  if (draft.projectId !== expected.projectId || draft.workspaceId !== expected.workspaceId) {
    throw new ListingDraftError('DRAFT_STALE_WRITE', 'The listing draft does not belong to this project.', 409);
  }
  const isCurrentGeneratedDraft = draft.sourceInstructionFingerprint === expected.instructionFingerprint;
  const isExistingPersistedDraft = expected.persistedDraftId === draft.draftId;
  if (!isCurrentGeneratedDraft && !isExistingPersistedDraft) {
    throw new ListingDraftError('DRAFT_STALE_WRITE', 'The listing draft no longer matches the current project instructions.', 409);
  }
}
