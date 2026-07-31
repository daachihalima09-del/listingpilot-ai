import type { ZodType } from 'zod';
import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionId } from './section-ids.ts';
import type {
  MerchantPreferenceSectionStatus,
  MerchantPreferenceValidationStatus,
} from './types.ts';

export interface MerchantPreferenceCompletion {
  status: MerchantPreferenceSectionStatus;
  validationStatus: MerchantPreferenceValidationStatus;
  complete: boolean;
  issues: readonly string[];
}

export interface MerchantPreferenceSectionDefinition<T> {
  readonly sectionId: MerchantPreferenceSectionId;
  readonly active: boolean;
  readonly currentSchemaVersion: number;
  readonly validator: ZodType<T>;
  readonly defaultProvider: () => T;
  readonly completionEvaluator: (data: T) => MerchantPreferenceCompletion;
  readonly serialize: (data: T) => unknown;
  readonly deserialize: (payload: unknown) => T;
  readonly migrate: (
    payload: unknown,
    fromSchemaVersion: number,
  ) => { schemaVersion: number; data: T };
}

export class MerchantPreferenceRegistry {
  readonly #definitions = new Map<
  MerchantPreferenceSectionId,
  MerchantPreferenceSectionDefinition<unknown>
  >();

  register<T>(definition: MerchantPreferenceSectionDefinition<T>): this {
    if (this.#definitions.has(definition.sectionId)) {
      throw new MerchantPreferenceError(
        'UNSUPPORTED_SECTION',
        409,
        `Merchant preference section "${definition.sectionId}" is already registered.`,
      );
    }
    this.#definitions.set(
      definition.sectionId,
      definition as MerchantPreferenceSectionDefinition<unknown>,
    );
    return this;
  }

  has(sectionId: MerchantPreferenceSectionId): boolean {
    return this.#definitions.has(sectionId);
  }

  get<T = unknown>(
    sectionId: MerchantPreferenceSectionId,
  ): MerchantPreferenceSectionDefinition<T> {
    const definition = this.#definitions.get(sectionId);
    if (!definition) {
      throw new MerchantPreferenceError(
        'UNSUPPORTED_SECTION',
        400,
        `Merchant preference section "${sectionId}" is not active.`,
      );
    }
    return definition as MerchantPreferenceSectionDefinition<T>;
  }

  activeSectionIds(): readonly MerchantPreferenceSectionId[] {
    return Object.freeze(
      [...this.#definitions.values()]
        .filter(({ active }) => active)
        .map(({ sectionId }) => sectionId)
        .sort(),
    );
  }
}
