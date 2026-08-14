import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import type { GenerationInstructions } from '../domain/contracts.ts';

export function semanticGenerationInstructionValue(
  instructions: Omit<GenerationInstructions, 'instructionId' | 'instructionFingerprint' | 'createdAt'> | GenerationInstructions,
): unknown {
  return Object.fromEntries(
    Object.entries(instructions).filter(
      ([key]) => !['instructionId', 'instructionFingerprint', 'createdAt'].includes(key),
    ),
  );
}

export function generationInstructionFingerprint(value: unknown): string {
  const detachedValue: unknown = JSON.parse(JSON.stringify(value));
  return new DeterministicHasher().hash(detachedValue);
}
