import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';

export type TextComparisonMode =
  | 'EXACT'
  | 'TRIMMED'
  | 'COLLAPSED_WHITESPACE'
  | 'CASE_INSENSITIVE'
  | 'CASE_INSENSITIVE_COLLAPSED';
export type MediaUrlNormalizationMode =
  | 'EXACT'
  | 'REMOVE_FRAGMENT'
  | 'REMOVE_QUERY_AND_FRAGMENT';

export interface DeterministicRuleConfiguration {
  readonly description: {
    readonly minimumLength: number;
    readonly duplicateComparisonMode: TextComparisonMode;
  };
  readonly seoTitle: {
    readonly minimumLength: number;
    readonly maximumLength: number;
  };
  readonly seoDescription: {
    readonly minimumLength: number;
    readonly maximumLength: number;
  };
  readonly tags: {
    readonly maximumCount: number;
  };
  readonly duplicateDetection: {
    readonly caseSensitive: boolean;
    readonly trimWhitespace: boolean;
    readonly collapseWhitespace: boolean;
    readonly compareEmptyValues: boolean;
    readonly descriptionComparisonMode: TextComparisonMode;
    readonly mediaUrlNormalization: MediaUrlNormalizationMode;
  };
  readonly media: {
    readonly requireAltTextForImages: boolean;
  };
  readonly catalog: {
    readonly enableCrossProductChecks: boolean;
  };
}

export type DeterministicRuleConfigurationInput = {
  readonly description?: Partial<DeterministicRuleConfiguration['description']>;
  readonly seoTitle?: Partial<DeterministicRuleConfiguration['seoTitle']>;
  readonly seoDescription?: Partial<DeterministicRuleConfiguration['seoDescription']>;
  readonly tags?: Partial<DeterministicRuleConfiguration['tags']>;
  readonly duplicateDetection?: Partial<DeterministicRuleConfiguration['duplicateDetection']>;
  readonly media?: Partial<DeterministicRuleConfiguration['media']>;
  readonly catalog?: Partial<DeterministicRuleConfiguration['catalog']>;
};

export const DEFAULT_DETERMINISTIC_RULE_CONFIGURATION: DeterministicRuleConfiguration = Object.freeze({
  description: Object.freeze({
    minimumLength: 80,
    duplicateComparisonMode: 'CASE_INSENSITIVE_COLLAPSED' as const,
  }),
  seoTitle: Object.freeze({ minimumLength: 10, maximumLength: 70 }),
  seoDescription: Object.freeze({ minimumLength: 50, maximumLength: 160 }),
  tags: Object.freeze({ maximumCount: 20 }),
  duplicateDetection: Object.freeze({
    caseSensitive: false,
    trimWhitespace: true,
    collapseWhitespace: true,
    compareEmptyValues: false,
    descriptionComparisonMode: 'CASE_INSENSITIVE_COLLAPSED' as const,
    mediaUrlNormalization: 'REMOVE_FRAGMENT' as const,
  }),
  media: Object.freeze({ requireAltTextForImages: true }),
  catalog: Object.freeze({ enableCrossProductChecks: true }),
});

const textModes = new Set<TextComparisonMode>([
  'EXACT',
  'TRIMMED',
  'COLLAPSED_WHITESPACE',
  'CASE_INSENSITIVE',
  'CASE_INSENSITIVE_COLLAPSED',
]);
const mediaModes = new Set<MediaUrlNormalizationMode>([
  'EXACT',
  'REMOVE_FRAGMENT',
  'REMOVE_QUERY_AND_FRAGMENT',
]);

function validateRange(minimum: number, maximum: number, field: string): void {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} thresholds must be non-negative integers.`);
  }
  if (minimum > maximum) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} minimum cannot exceed maximum.`);
  }
}

export function createDeterministicRuleConfiguration(
  input: DeterministicRuleConfigurationInput = {},
): DeterministicRuleConfiguration {
  const configuration: DeterministicRuleConfiguration = {
    description: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.description, ...input.description },
    seoTitle: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.seoTitle, ...input.seoTitle },
    seoDescription: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.seoDescription, ...input.seoDescription },
    tags: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.tags, ...input.tags },
    duplicateDetection: {
      ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.duplicateDetection,
      ...input.duplicateDetection,
    },
    media: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.media, ...input.media },
    catalog: { ...DEFAULT_DETERMINISTIC_RULE_CONFIGURATION.catalog, ...input.catalog },
  };
  if (!Number.isInteger(configuration.description.minimumLength) || configuration.description.minimumLength < 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Description minimum length must be a non-negative integer.');
  }
  validateRange(configuration.seoTitle.minimumLength, configuration.seoTitle.maximumLength, 'SEO title');
  validateRange(
    configuration.seoDescription.minimumLength,
    configuration.seoDescription.maximumLength,
    'SEO description',
  );
  if (!Number.isInteger(configuration.tags.maximumCount) || configuration.tags.maximumCount < 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Maximum tag count must be a non-negative integer.');
  }
  if (
    !textModes.has(configuration.description.duplicateComparisonMode)
    || !textModes.has(configuration.duplicateDetection.descriptionComparisonMode)
  ) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Unsupported description comparison mode.');
  }
  if (!mediaModes.has(configuration.duplicateDetection.mediaUrlNormalization)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Unsupported media URL normalization mode.');
  }
  return immutableCopy(configuration) as DeterministicRuleConfiguration;
}
