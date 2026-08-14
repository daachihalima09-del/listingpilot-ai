import type { ProjectReadinessData } from '../../projects/validators/project.ts';
import { listingDraftSchema, type ListingDraftInput } from '../validation/draft-schema.ts';

interface ProjectableListingDraft {
  readonly title: { readonly value: string };
  readonly overview: { readonly value: string };
  readonly specifications: readonly { readonly label: string; readonly value: string }[];
  readonly features: readonly { readonly value: string }[];
  readonly whatsIncluded: readonly { readonly value: string }[];
  readonly seo: {
    readonly title: { readonly value: string };
    readonly description: { readonly value: string };
  };
  readonly catalog: { readonly tags: readonly { readonly value: string }[] };
  readonly metadata: { readonly descriptionStructure?: string };
}

export function readAuthoritativeListingDraft(value: unknown): ListingDraftInput | null {
  if (!value || typeof value !== 'object' || !('listingDraft' in value)) return null;
  const parsed = listingDraftSchema.safeParse((value as { listingDraft?: unknown }).listingDraft);
  return parsed.success ? parsed.data : null;
}

export function listingDraftProjectFields<TDraft extends ProjectableListingDraft>(draft: TDraft): {
  generatedListing: {
    title: string;
    description: string;
    keyFeatures: string;
    listingDraft: TDraft;
  };
  seoData: { seoTitle: string; seoDescription: string; tags: string };
} {
  const specifications = draft.specifications.length
    ? `\n\nSpecifications\n${draft.specifications.map(({ label, value }) => `${label}: ${value}`).join('\n')}`
    : '';
  const included = draft.whatsIncluded.length
    ? `\n\nWhat's Included\n${draft.whatsIncluded.map(({ value }) => value).join('\n')}`
    : '';
  const overviewAndSpecifications = draft.metadata.descriptionStructure === 'SPECIFICATIONS_FIRST'
    ? `${specifications.trim()}\n\n${draft.overview.value}`.trim()
    : `${draft.overview.value}${specifications}`.trim();
  return {
    generatedListing: {
      title: draft.title.value,
      description: `${overviewAndSpecifications}${included}`.trim(),
      keyFeatures: draft.features.map(({ value }) => value).join('\n'),
      listingDraft: draft,
    },
    seoData: {
      seoTitle: draft.seo.title.value,
      seoDescription: draft.seo.description.value,
      tags: draft.catalog.tags.map(({ value }) => value).join(', '),
    },
  };
}

export function generatedListingReadiness(
  current: ProjectReadinessData | null,
): ProjectReadinessData {
  return {
    analysisStarted: true,
    activeStage: 'review',
    completedStages: [...new Set([...(current?.completedStages ?? []), 'generate'] as const)],
    shopifyReady: false,
  };
}
