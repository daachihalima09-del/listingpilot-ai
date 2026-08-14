import type { ListingDraftInput } from '../validation/draft-schema.ts';
import { confidenceLabel } from './review-workspace.ts';

export type ReviewWorkspaceInput = NonNullable<ListingDraftInput['reviewWorkspace']>;
export type FieldReviewStatus = 'Verified' | 'Needs Review' | 'Merchant Edited';

export function reviewWorkspaceForDraft(draft: ListingDraftInput): ReviewWorkspaceInput {
  return draft.reviewWorkspace ?? {
    lockedFields: [],
    reviewedSections: [],
    editedFields: [],
    traceability: [],
    facts: [],
    comparison: null,
    advanced: {
      localization: ['Merchant default language.', 'No automatic translation or regional substitution.'],
      publishingConstraints: ['Nothing is published during review.', 'Merchant approval is required before publishing.'],
      aiPolicySummary: ['Verified Product Truth remains authoritative.', 'Merchant review is required.'],
    },
    policy: {
      titleMaximum: 200,
      seoTitleMaximum: 120,
      seoDescriptionMaximum: 320,
      prohibitedTerms: [],
      lockedHandle: null,
    },
  };
}

export function fieldReviewStatus(
  workspace: ReviewWorkspaceInput,
  fieldKey: string,
): FieldReviewStatus {
  if (workspace.editedFields.includes(fieldKey)) return 'Merchant Edited';
  const trace = workspace.traceability.find((item) => item.fieldKey === fieldKey);
  return trace && trace.factIds.length > 0 && trace.confidence >= 80 ? 'Verified' : 'Needs Review';
}

export function confidenceBreakdown(draft: ListingDraftInput) {
  const workspace = reviewWorkspaceForDraft(draft);
  const verified = workspace.traceability.filter((trace) => trace.factIds.length > 0 && trace.confidence >= 80).length;
  const unresolved = workspace.traceability.filter((trace) => trace.factIds.length === 0 || trace.confidence < 80).length;
  const blocked = draft.metadata.generationStatus === 'BLOCKED'
    ? workspace.traceability.length || 1
    : 0;
  return {
    label: confidenceLabel(draft.confidence.overall, blocked > 0),
    verified,
    unresolved,
    blocked,
  };
}

export function comparisonLines(value: string): string[] {
  try {
    const decoded = JSON.parse(value) as unknown;
    return JSON.stringify(decoded, null, 2).split('\n');
  } catch {
    return value.split(/\r?\n/u).filter(Boolean);
  }
}

export function comparisonDiff(previous: string, current: string) {
  const before = comparisonLines(previous);
  const after = comparisonLines(current);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    removed: before.filter((line) => !afterSet.has(line)),
    added: after.filter((line) => !beforeSet.has(line)),
    unchanged: after.filter((line) => beforeSet.has(line)),
  };
}

export function merchantFriendlyWarning(value: string): string {
  return value
    .replace(/^[A-Z_]+:/u, '')
    .replaceAll('_', ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
