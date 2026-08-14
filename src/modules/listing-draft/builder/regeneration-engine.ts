import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import { validateDraftCraftCompliance } from '../../listing-craft/index.ts';
import type { DraftRegenerationSection, DraftTextField, ListingDraft } from '../domain/contracts.ts';
import type { PartialGenerationOutput, PartialGenerationProvider } from '../domain/regeneration-contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { listingDraftSchema } from '../validation/draft-schema.ts';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, ' ');
}

function validateText(field: DraftTextField, draft: ListingDraft): void {
  const facts = new Map(draft.reviewWorkspace?.facts.map((fact) => [fact.factId, fact]) ?? []);
  if (field.value.trim() && !field.factIds.length) {
    throw new ListingDraftError('DRAFT_INVENTED_VALUE', 'Regenerated factual content requires verified facts.', 422);
  }
  for (const factId of field.factIds) {
    const fact = facts.get(factId);
    if (!fact || !normalized(field.value).includes(normalized(fact.value))) {
      throw new ListingDraftError('DRAFT_FORBIDDEN_FACT', 'Regenerated content used an unapproved or unrelated fact.', 422);
    }
  }
}

function textFields(output: PartialGenerationOutput): readonly DraftTextField[] {
  if (output.section === 'TITLE') return [output.title];
  if (output.section === 'DESCRIPTION') return [
    output.overview,
    ...output.specifications,
    ...output.whatsIncluded,
  ];
  if (output.section === 'FEATURES') return output.features;
  return [output.seo.title, output.seo.description, output.seo.handle];
}

function serializedSection(draft: ListingDraft, section: DraftRegenerationSection): string {
  if (section === 'TITLE') return draft.title.value;
  if (section === 'DESCRIPTION') return JSON.stringify({
    overview: draft.overview.value,
    specifications: draft.specifications.map(({ label, value }) => ({ label, value })),
    whatsIncluded: draft.whatsIncluded.map(({ value }) => value),
  }, null, 2);
  if (section === 'FEATURES') return draft.features.map(({ value }) => value).join('\n');
  return JSON.stringify({
    title: draft.seo.title.value,
    description: draft.seo.description.value,
    handle: draft.seo.handle.value,
  }, null, 2);
}

function targetKeys(section: DraftRegenerationSection, draft: ListingDraft): string[] {
  if (section === 'TITLE') return ['title'];
  if (section === 'DESCRIPTION') return ['overview', 'specifications', 'whatsIncluded'];
  if (section === 'FEATURES') return draft.features.map((_, index) => `features.${index}`);
  return ['seo.title', 'seo.description', 'seo.handle'];
}

function merge(draft: ListingDraft, output: PartialGenerationOutput): ListingDraft {
  const locks = new Set(draft.reviewWorkspace?.lockedFields ?? []);
  if (output.section === 'TITLE') return { ...draft, title: locks.has('title') ? draft.title : output.title };
  if (output.section === 'DESCRIPTION') return {
    ...draft,
    overview: locks.has('overview') ? draft.overview : output.overview,
    specifications: locks.has('specifications') ? draft.specifications : output.specifications,
    whatsIncluded: output.whatsIncluded,
  };
  if (output.section === 'FEATURES') {
    const features = [...output.features];
    draft.features.forEach((feature, index) => {
      if (locks.has(`features.${index}`)) features.splice(Math.min(index, features.length), 0, feature);
    });
    return { ...draft, features };
  }
  return {
    ...draft,
    seo: {
      title: locks.has('seo') || locks.has('seo.title') ? draft.seo.title : output.seo.title,
      description: locks.has('seo') || locks.has('seo.description') ? draft.seo.description : output.seo.description,
      handle: locks.has('seo') || locks.has('seo.handle') ? draft.seo.handle : output.seo.handle,
    },
  };
}

export class ListingDraftRegenerationEngine {
  private readonly provider: PartialGenerationProvider;
  private readonly now: () => string;

  constructor(
    provider: PartialGenerationProvider,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.provider = provider;
    this.now = now;
  }

  async regenerate(
    draft: ListingDraft,
    section: DraftRegenerationSection,
    signal?: AbortSignal,
  ): Promise<ListingDraft> {
    if (!draft.reviewWorkspace) {
      throw new ListingDraftError('DRAFT_GENERATION_BLOCKED', 'Save a new draft before regenerating a section.', 409);
    }
    const keys = targetKeys(section, draft);
    const locks = new Set(draft.reviewWorkspace.lockedFields);
    if (keys.every((key) => locks.has(key) || (section === 'SEO' && locks.has('seo')))) {
      throw new ListingDraftError('DRAFT_GENERATION_BLOCKED', 'Unlock at least one field in this section before regenerating.', 409);
    }
    let result;
    try {
      result = await this.provider.regenerate(draft, section, signal);
    } catch (error) {
      if (error instanceof ListingDraftError) throw error;
      throw new ListingDraftError('DRAFT_PROVIDER_FAILED', 'This section could not be regenerated. Please try again.', 502);
    }
    for (const field of textFields(result.output)) validateText(field, draft);
    if (result.output.section === 'DESCRIPTION') {
      const exactFacts = new Map(draft.reviewWorkspace.facts.map((fact) => [fact.factId, fact.value]));
      for (const specification of result.output.specifications) {
        const specificationValue = normalized(specification.value);
        if (!specification.factIds.length || specification.factIds.some((factId) => {
          const factValue = normalized(exactFacts.get(factId) ?? '');
          return !factValue || !specificationValue.includes(factValue);
        })) {
          throw new ListingDraftError('DRAFT_INVENTED_VALUE', 'Regenerated specifications must exactly match verified facts.', 422);
        }
      }
    }
    const previous = serializedSection(draft, section);
    const merged = merge(draft, result.output);
    const craftCompliance = draft.reviewWorkspace.craft
      ? validateDraftCraftCompliance({
          draft: merged,
          facts: draft.reviewWorkspace.facts,
          craft: draft.reviewWorkspace.craft.rules,
        })
      : null;
    if (craftCompliance?.status === 'REJECTED') {
      throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The regenerated section failed factual Craft compliance.', 422);
    }
    const current = serializedSection(merged, section);
    const changedFields = keys.filter((key) => !locks.has(key));
    const timestamp = this.now();
    const next = listingDraftSchema.parse({
      ...merged,
      providerRequestId: result.requestId,
      status: 'EDITED',
      updatedAt: timestamp,
      reviewWorkspace: {
        ...draft.reviewWorkspace,
        editedFields: draft.reviewWorkspace.editedFields.filter((key) => !changedFields.includes(key)),
        comparison: {
          section,
          previous,
          current,
          changedFields,
          merchantEditedFields: draft.reviewWorkspace.editedFields.filter((key) => keys.includes(key)),
          createdAt: timestamp,
        },
        ...(draft.reviewWorkspace.craft && craftCompliance ? { craft: {
          ...draft.reviewWorkspace.craft,
          status: craftCompliance.status,
          findings: craftCompliance.findings,
        } } : {}),
      },
      metadata: {
        ...draft.metadata,
        ...(craftCompliance ? {
          craftComplianceStatus: craftCompliance.status,
          craftFindingSummary: craftCompliance.summary,
        } : {}),
      },
    });
    return immutableCopy(next) as ListingDraft;
  }
}
