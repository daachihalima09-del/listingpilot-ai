import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type {
  ProductCategoryValidationFinding,
  ProductCategoryValidationInput,
  ProductIntelligencePack,
  ProductValidationRule,
} from '../domain/contracts.ts';
import { normalizeProductIntelligenceTerm } from '../registry/pack-validation.ts';

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(present);
  return true;
}

function flattened(value: unknown): readonly string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(present).map((item) => (
    typeof item === 'string' ? normalizeProductIntelligenceTerm(item) : String(item)
  ));
}

function stringParameter(parameters: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return typeof parameters[key] === 'string' ? parameters[key] : undefined;
}

function stringListParameter(parameters: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  return Array.isArray(parameters[key])
    ? (parameters[key] as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
}

function containsAny(value: unknown, terms: readonly string[]): boolean {
  const normalizedTerms = terms.map(normalizeProductIntelligenceTerm);
  return flattened(value).some((candidate) => normalizedTerms.some((term) => (` ${candidate} `).includes(` ${term} `)));
}

function conflicts(value: unknown, ignoreTerms: readonly string[] = []): boolean {
  const ignored = new Set(ignoreTerms.map(normalizeProductIntelligenceTerm));
  const values = [...new Set(flattened(value).filter((item) => !ignored.has(item)))];
  return values.length > 1;
}

function ruleViolated(rule: ProductValidationRule, input: ProductCategoryValidationInput): boolean {
  const parameters = rule.parameters;
  if (rule.evaluationType === 'REQUIRED_FIELD') {
    const fieldId = stringParameter(parameters, 'fieldId') ?? rule.requiredInputs[0];
    return Boolean(fieldId && !present(input.values[fieldId]));
  }
  if (rule.evaluationType === 'FIELD_VALUE_CONFLICT') {
    const fieldId = stringParameter(parameters, 'fieldId') ?? rule.requiredInputs[0];
    return Boolean(fieldId && conflicts(input.values[fieldId], stringListParameter(parameters, 'ignoreValues')));
  }
  if (rule.evaluationType === 'FIELDS_CONFLICT') {
    const leftFieldId = stringParameter(parameters, 'leftFieldId');
    const rightFieldId = stringParameter(parameters, 'rightFieldId');
    if (!leftFieldId || !rightFieldId) return false;
    return containsAny(input.values[leftFieldId], stringListParameter(parameters, 'leftValues'))
      && containsAny(input.values[rightFieldId], stringListParameter(parameters, 'rightValues'));
  }
  if (rule.evaluationType === 'FIELD_TEXT_CONFLICT') {
    const fieldId = stringParameter(parameters, 'fieldId');
    const text = input.identityText;
    if (!fieldId || !text
      || !containsAny(input.values[fieldId], stringListParameter(parameters, 'fieldValues'))
      || stringListParameter(parameters, 'ignoreTextTerms').some((term) => containsAny(text, [term]))) return false;
    return containsAny(text, stringListParameter(parameters, 'textTerms'));
  }
  if (rule.evaluationType === 'COUNT_MISMATCH') {
    const countFieldId = stringParameter(parameters, 'countFieldId');
    const listFieldId = stringParameter(parameters, 'listFieldId');
    if (!countFieldId || !listFieldId || !present(input.values[countFieldId]) || !Array.isArray(input.values[listFieldId])) return false;
    return Number(input.values[countFieldId]) !== (input.values[listFieldId] as unknown[]).length;
  }
  if (rule.evaluationType === 'PROHIBITED_DERIVATION') {
    const targetFieldId = stringParameter(parameters, 'targetFieldId');
    const sourceFieldIds = stringListParameter(parameters, 'sourceFieldIds');
    return Boolean(targetFieldId && input.derivations?.[targetFieldId]
      && sourceFieldIds.includes(input.derivations[targetFieldId]));
  }
  return false;
}

function finding(pack: ProductIntelligencePack, input: ProductCategoryValidationInput, rule: ProductValidationRule): ProductCategoryValidationFinding {
  const fieldIds = [...new Set(rule.requiredInputs)].sort();
  return {
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    category: pack.identity.categoryId,
    severity: rule.severity,
    fieldIds,
    message: rule.message,
    evidenceReferences: [...new Set(fieldIds.flatMap((fieldId) => input.evidenceReferences[fieldId] ?? []))].sort(),
    recommendation: rule.recommendation,
    packId: pack.identity.id,
    packVersion: pack.identity.version,
  };
}

export function evaluateProductIntelligencePack(
  pack: ProductIntelligencePack,
  input: ProductCategoryValidationInput,
): readonly ProductCategoryValidationFinding[] {
  const missing = pack.truthFields.filter(({ requirementLevel, fieldId }) => (
    (requirementLevel === 'IDENTITY_REQUIRED' || requirementLevel === 'CATEGORY_REQUIRED')
    && !present(input.values[fieldId])
  )).map((field): ProductCategoryValidationFinding => ({
    ruleId: `category.required.${field.fieldId}`,
    ruleVersion: pack.identity.version,
    category: pack.identity.categoryId,
    severity: field.requirementLevel === 'IDENTITY_REQUIRED' ? 'HIGH' : 'MEDIUM',
    fieldIds: [field.fieldId],
    message: `${field.displayName} is missing from the category truth record.`,
    evidenceReferences: [],
    recommendation: `Verify ${field.displayName.toLocaleLowerCase('en-US')} from appropriate source evidence.`,
    packId: pack.identity.id,
    packVersion: pack.identity.version,
  }));
  const violations = pack.validationRules
    .filter((rule) => ruleViolated(rule, input))
    .map((rule) => finding(pack, input, rule));
  return immutableCopy([...missing, ...violations].sort((left, right) => (
    left.ruleId.localeCompare(right.ruleId)
  ))) as readonly ProductCategoryValidationFinding[];
}
