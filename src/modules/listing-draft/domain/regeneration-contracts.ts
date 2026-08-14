import type {
  DraftRegenerationSection,
  DraftSpecification,
  DraftTextField,
  ListingDraft,
} from './contracts.ts';

export type PartialGenerationOutput =
  | Readonly<{ section: 'TITLE'; title: DraftTextField }>
  | Readonly<{
    section: 'DESCRIPTION';
    overview: DraftTextField;
    specifications: readonly DraftSpecification[];
    whatsIncluded: readonly DraftTextField[];
  }>
  | Readonly<{ section: 'FEATURES'; features: readonly DraftTextField[] }>
  | Readonly<{
    section: 'SEO';
    seo: Readonly<{
      title: DraftTextField;
      description: DraftTextField;
      handle: DraftTextField;
    }>;
  }>;

export interface PartialGenerationProviderResult {
  readonly output: PartialGenerationOutput;
  readonly requestId: string | null;
}

export interface PartialGenerationProvider {
  regenerate(
    draft: ListingDraft,
    section: DraftRegenerationSection,
    signal?: AbortSignal,
  ): Promise<PartialGenerationProviderResult>;
}
