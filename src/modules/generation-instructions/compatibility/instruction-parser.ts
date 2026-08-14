import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type { GenerationInstructions } from '../domain/contracts.ts';
import { validateGenerationInstructionPackage } from '../validation/instruction-validator.ts';

export function parseGenerationInstructions(value: unknown): GenerationInstructions {
  return immutableCopy(validateGenerationInstructionPackage(value)) as GenerationInstructions;
}
