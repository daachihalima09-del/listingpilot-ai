import type { SavedProjectWorkspace } from '@/modules/projects/client/use-project-autosave';

export function hasMeaningfulProductContext(
  project: SavedProjectWorkspace,
): boolean {
  return Boolean(
    project.analysisData
    || project.generatedListing?.listingDraft
    || project.sourceType === 'SHOPIFY_IMPORT',
  );
}

export function shouldShowProjectEntry(
  project: SavedProjectWorkspace | undefined,
  analysisStarted: boolean,
): boolean {
  return Boolean(
    project
    && !analysisStarted
    && !hasMeaningfulProductContext(project),
  );
}
