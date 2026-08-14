import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';

export function listingGenerationPlanFingerprint(value: unknown): string {
  // Plans intentionally reuse immutable policy fragments. Detach those shared
  // references before passing the JSON-safe contract to the legacy hasher,
  // whose cycle guard also treats repeated references as circular.
  const detachedValue: unknown = JSON.parse(JSON.stringify(value));
  return new DeterministicHasher().hash(detachedValue);
}
