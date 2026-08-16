export interface CandidatePersistenceFailure<T> {
  candidate: T;
  error: unknown;
}

export async function persistCandidatesIndependently<T>(
  candidates: readonly T[],
  persist: (candidate: T) => Promise<void>,
  onFailure: (failure: CandidatePersistenceFailure<T>) => void,
) {
  let persistedCount = 0;
  const failures: Array<CandidatePersistenceFailure<T>> = [];
  for (const candidate of candidates) {
    try {
      await persist(candidate);
      persistedCount += 1;
    } catch (error) {
      const failure = { candidate, error };
      failures.push(failure);
      onFailure(failure);
    }
  }
  return { persistedCount, failures };
}
