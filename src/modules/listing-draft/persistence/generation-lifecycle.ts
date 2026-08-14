import { ListingDraftError } from '../domain/errors.ts';

export async function generateAndPersistListingDraft<TDraft, TProject>(input: {
  readonly expectedVersion: number;
  readonly currentVersion: number;
  readonly generate: () => Promise<TDraft>;
  readonly persist: (draft: TDraft) => Promise<TProject>;
}): Promise<{ draft: TDraft; project: TProject }> {
  if (input.currentVersion !== input.expectedVersion) {
    throw new ListingDraftError(
      'DRAFT_STALE_WRITE',
      'This project changed before generation started. Refresh and try again.',
      409,
    );
  }
  const draft = await input.generate();
  const project = await input.persist(draft);
  return { draft, project };
}
