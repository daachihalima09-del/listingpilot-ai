import { immutableCopy } from '../domain/immutability.ts';
import type {
  ExtensionMetadata,
  IntelligenceContext,
} from '../domain/types.ts';

const DETECTOR_RESULTS_KEY = 'detectorResults';

function resultRecord(context: IntelligenceContext): Readonly<Record<string, ExtensionMetadata>> {
  const value = context.execution.metadata[DETECTOR_RESULTS_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Readonly<Record<string, ExtensionMetadata>>;
}

export function getPriorDetectorMetadata(
  context: IntelligenceContext,
  detectorId: string,
): ExtensionMetadata | undefined {
  return resultRecord(context)[detectorId];
}

export function getAllPriorDetectorMetadata(
  context: IntelligenceContext,
): Readonly<Record<string, ExtensionMetadata>> {
  return resultRecord(context);
}

export function withDetectorResultMetadata(
  context: IntelligenceContext,
  detectorId: string,
  metadata: ExtensionMetadata,
): IntelligenceContext {
  const detached = immutableCopy(metadata) as ExtensionMetadata;
  const detectorResults = Object.freeze({
    ...resultRecord(context),
    [detectorId]: detached,
  });
  return Object.freeze({
    ...context,
    execution: Object.freeze({
      ...context.execution,
      metadata: Object.freeze({
        ...context.execution.metadata,
        [DETECTOR_RESULTS_KEY]: detectorResults,
      }),
    }),
  });
}
