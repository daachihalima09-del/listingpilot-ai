import type {
  Evidence,
  ExtensionMetadata,
  NormalizedProduct,
  SourceReference,
  SourceType,
} from '../domain/types.ts';

export interface SourceProductInput<TPayload = unknown> {
  readonly sourceType: SourceType;
  readonly sourceReference: SourceReference;
  readonly payload: TPayload;
  readonly metadata: ExtensionMetadata;
}

export interface NormalizationResult {
  readonly products: readonly NormalizedProduct[];
  readonly evidence: readonly Evidence[];
  readonly warnings: readonly string[];
  readonly metadata: ExtensionMetadata;
}

export interface ProductNormalizer<TPayload = unknown> {
  readonly id: string;
  readonly version: string;
  readonly supportedSourceTypes: readonly SourceType[];
  normalize(input: SourceProductInput<TPayload>): NormalizationResult;
}
