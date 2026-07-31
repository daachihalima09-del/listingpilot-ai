import { stableSerialize } from '../deterministic/services.ts';
import type { ValueType } from '../domain/types.ts';
import { parseExactDecimal } from '../rules/decimal.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import type {
  ClaimComparisonResult,
  TruthComparison,
} from './types.ts';

export interface NormalizedTruthValue {
  readonly usable: boolean;
  readonly canonicalValue: string;
  readonly displayValue: string;
  readonly valueType: ValueType;
  readonly unit?: string;
  readonly warning?: string;
}

function normalizeString(value: string, configuration: ProductTruthConfiguration): string {
  let result = value.normalize(configuration.stringNormalization.unicodeMode);
  if (configuration.stringNormalization.trim) result = result.trim();
  if (configuration.stringNormalization.collapseWhitespace) result = result.replace(/\s+/gu, ' ');
  if (!configuration.stringNormalization.caseSensitive) result = result.toLocaleLowerCase();
  return result;
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return stableSerialize(value);
}

function canonicalDecimal(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  const parsed = parseExactDecimal(text);
  if (!parsed) return null;
  const raw = parsed.digits.toString().padStart(parsed.scale + 1, '0');
  const whole = parsed.scale ? raw.slice(0, -parsed.scale) || '0' : raw;
  const fraction = parsed.scale ? raw.slice(-parsed.scale).replace(/0+$/u, '') : '';
  const magnitude = fraction ? `${whole}.${fraction}` : whole;
  return `${parsed.negative && parsed.digits !== BigInt(0) ? '-' : ''}${magnitude}`;
}

function canonicalInteger(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^-?\d+$/u.test(text)) return null;
  return BigInt(text).toString();
}

function booleanValue(value: unknown, configuration: ProductTruthConfiguration): string | null {
  if (typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = normalizeString(String(value), configuration);
  if (configuration.booleanAliases.trueValues.includes(normalized)) return 'true';
  if (configuration.booleanAliases.falseValues.includes(normalized)) return 'false';
  return null;
}

function normalizeUnit(unit: string | undefined, configuration: ProductTruthConfiguration): string | undefined {
  if (!unit?.trim()) return undefined;
  const normalized = normalizeString(unit, configuration);
  return configuration.unitAliases[normalized] ?? normalized;
}

function aliasValue(
  namespace: string,
  key: string,
  value: string,
  configuration: ProductTruthConfiguration,
): string {
  return configuration.valueAliases[`${namespace}.${key}`]?.[value] ?? value;
}

export function normalizeTruthValue(input: {
  readonly namespace: string;
  readonly key: string;
  readonly value: unknown;
  readonly valueType: ValueType;
  readonly unit?: string;
  readonly configuration: ProductTruthConfiguration;
}): NormalizedTruthValue {
  const { valueType, configuration } = input;
  const display = displayValue(input.value);
  const unit = normalizeUnit(input.unit, configuration);
  if (input.value === undefined || input.value === null || (typeof input.value === 'string' && !input.value.trim())) {
    return { usable: false, canonicalValue: '', displayValue: display, valueType, ...(unit ? { unit } : {}) };
  }
  if (valueType === 'DECIMAL') {
    const canonical = canonicalDecimal(input.value);
    if (canonical === null) {
      return {
        usable: false,
        canonicalValue: '',
        displayValue: display,
        valueType,
        ...(unit ? { unit } : {}),
        warning: `Unsupported decimal value for ${input.namespace}.${input.key}.`,
      };
    }
    return {
      usable: true,
      canonicalValue: unit ? `${canonical}|${unit}` : canonical,
      displayValue: display,
      valueType,
      ...(unit ? { unit } : {}),
    };
  }
  if (valueType === 'INTEGER') {
    const canonical = canonicalInteger(input.value);
    if (canonical === null) {
      return {
        usable: false,
        canonicalValue: '',
        displayValue: display,
        valueType,
        ...(unit ? { unit } : {}),
        warning: `Unsupported integer value for ${input.namespace}.${input.key}.`,
      };
    }
    return {
      usable: true,
      canonicalValue: unit ? `${canonical}|${unit}` : canonical,
      displayValue: display,
      valueType,
      ...(unit ? { unit } : {}),
    };
  }
  if (valueType === 'BOOLEAN') {
    const canonical = booleanValue(input.value, configuration);
    if (canonical === null) {
      return {
        usable: false,
        canonicalValue: '',
        displayValue: display,
        valueType,
        warning: `Unsupported boolean value for ${input.namespace}.${input.key}.`,
      };
    }
    return { usable: true, canonicalValue: canonical, displayValue: display, valueType };
  }
  if (valueType === 'LIST') {
    if (!Array.isArray(input.value)) {
      return {
        usable: false,
        canonicalValue: '',
        displayValue: display,
        valueType,
        warning: `Unsupported list value for ${input.namespace}.${input.key}.`,
      };
    }
    const normalized = input.value.map((item) => normalizeString(String(item), configuration));
    if (configuration.unorderedListClaims.includes(`${input.namespace}.${input.key}`)) normalized.sort();
    return {
      usable: normalized.length > 0,
      canonicalValue: stableSerialize(normalized),
      displayValue: display,
      valueType,
    };
  }
  if (valueType === 'OBJECT') {
    return {
      usable: true,
      canonicalValue: stableSerialize(input.value),
      displayValue: display,
      valueType,
    };
  }
  if (valueType === 'DATE' || valueType === 'DATETIME') {
    if (typeof input.value !== 'string') {
      return {
        usable: false,
        canonicalValue: '',
        displayValue: display,
        valueType,
        warning: `Unsupported date value for ${input.namespace}.${input.key}.`,
      };
    }
    return {
      usable: true,
      canonicalValue: input.value,
      displayValue: display,
      valueType,
    };
  }
  const normalized = aliasValue(
    input.namespace,
    input.key,
    normalizeString(String(input.value), configuration),
    configuration,
  );
  return {
    usable: Boolean(normalized),
    canonicalValue: unit ? `${normalized}|${unit}` : normalized,
    displayValue: display,
    valueType,
    ...(unit ? { unit } : {}),
  };
}

export interface TruthValueComparisonStrategy {
  readonly id: string;
  readonly version: string;
  compare(
    left: NormalizedTruthValue,
    right: NormalizedTruthValue,
  ): TruthComparison;
}

export class GenericTruthValueComparisonStrategy implements TruthValueComparisonStrategy {
  readonly id = 'truth-value.generic';
  readonly version = '1.0.0';

  compare(left: NormalizedTruthValue, right: NormalizedTruthValue): TruthComparison {
    if (!left.usable || !right.usable) {
      return result('INCOMPARABLE', 'At least one value is not usable for deterministic comparison.', -0.2);
    }
    const numericTypes = new Set<ValueType>(['INTEGER', 'DECIMAL']);
    if (left.valueType !== right.valueType
      && !(numericTypes.has(left.valueType) && numericTypes.has(right.valueType))) {
      return result('INCOMPARABLE', 'The candidate value types are not safely comparable.', -0.1);
    }
    if (left.unit !== right.unit) {
      return result('INCOMPARABLE', 'The candidate units have no supplied canonical equivalence.', -0.2, {
        leftUnit: left.unit ?? null,
        rightUnit: right.unit ?? null,
      });
    }
    if (left.canonicalValue === right.canonicalValue) {
      if (left.valueType !== right.valueType) {
        return result(
          'COMPATIBLE',
          'The integer-like and decimal-like candidates represent the same exact numeric value.',
          0.1,
        );
      }
      return result('EQUIVALENT', 'The candidates share the same deterministic canonical value.', 0.15);
    }
    return result('CONFLICTING', 'The deterministically comparable candidate values differ.', -0.2);
  }
}

function result(
  comparison: ClaimComparisonResult,
  explanation: string,
  confidenceImpact: number,
  metadata: Readonly<Record<string, unknown>> = {},
): TruthComparison {
  return {
    result: comparison,
    explanation,
    confidenceImpact,
    metadata,
  };
}
