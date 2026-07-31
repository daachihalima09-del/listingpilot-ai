import { stableSerialize } from '../deterministic/services.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type {
  IntelligenceContext,
  IssueSeverity,
  NormalizedProduct,
} from '../domain/types.ts';
import type {
  ProductTruthReport,
  TruthFinding,
} from '../product-truth/types.ts';
import type { AIDetectiveConfiguration } from './configuration.ts';
import { AIDetectiveConfidenceStrategy } from './confidence.ts';
import type {
  CombinationContradictionPolicy,
  ContradictionFactCondition,
  ContradictionRuleDefinition,
  ContradictionRuleRegistry,
} from './rules.ts';
import type {
  Contradiction,
  ContradictionClaimReference,
} from './types.ts';

const severityRank: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

interface FactValue {
  readonly value: unknown;
  readonly displayValue: string;
  readonly fieldPath: string;
  readonly source: ContradictionClaimReference['source'];
  readonly finding?: TruthFinding;
}

export interface DetectiveEvaluationDependencies {
  readonly context: IntelligenceContext;
  readonly truthReport: ProductTruthReport;
  readonly configuration: AIDetectiveConfiguration;
  readonly rules: ContradictionRuleRegistry;
  readonly confidenceStrategy: AIDetectiveConfidenceStrategy;
  readonly hasher: IntelligenceHasher;
}

function canonical(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s+/gu, ' ').normalize('NFKC').toLocaleLowerCase();
    if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
      const negative = trimmed.startsWith('-');
      const unsigned = negative ? trimmed.slice(1) : trimmed;
      const [whole, decimal = ''] = unsigned.split('.');
      const normalizedWhole = BigInt(whole).toString();
      const normalizedDecimal = decimal.replace(/0+$/u, '');
      const magnitude = normalizedDecimal ? `${normalizedWhole}.${normalizedDecimal}` : normalizedWhole;
      return `${negative && magnitude !== '0' ? '-' : ''}${magnitude}`;
    }
    return trimmed;
  }
  return stableSerialize(value);
}

function display(value: unknown): string {
  return typeof value === 'string' ? value : stableSerialize(value);
}

function template(value: string, replacements: Readonly<Record<string, string>>): string {
  return Object.entries(replacements).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, replacement),
    value,
  );
}

function evidenceIds(finding: TruthFinding): readonly string[] {
  return [...new Set([
    ...(Array.isArray(finding.metadata.supportingEvidenceIds)
      ? finding.metadata.supportingEvidenceIds.filter((id): id is string => typeof id === 'string')
      : []),
    ...(Array.isArray(finding.metadata.conflictingEvidenceIds)
      ? finding.metadata.conflictingEvidenceIds.filter((id): id is string => typeof id === 'string')
      : []),
  ])].sort();
}

function claimForFinding(finding: TruthFinding): ContradictionClaimReference {
  return {
    productId: finding.productId,
    ...(finding.variantId ? { variantId: finding.variantId } : {}),
    namespace: finding.fieldPath.split('.')[0] || 'product',
    key: finding.fieldPath.split('.').slice(1).join('.') || finding.fieldPath,
    fieldPath: finding.fieldPath,
    ...(finding.selectedValue !== undefined ? { displayValue: finding.selectedValue } : {}),
    source: 'PRODUCT_TRUTH',
    metadata: {
      truthFindingId: finding.id,
      truthStatus: finding.status,
    },
  };
}

function claimsForConflictedFinding(
  finding: TruthFinding,
): readonly ContradictionClaimReference[] {
  return finding.candidateValues.map((candidateValue, candidateIndex) => ({
    productId: finding.productId,
    ...(finding.variantId ? { variantId: finding.variantId } : {}),
    namespace: finding.fieldPath.split('.')[0] || 'product',
    key: finding.fieldPath.split('.').slice(1).join('.') || finding.fieldPath,
    fieldPath: finding.fieldPath,
    displayValue: candidateValue,
    source: 'PRODUCT_TRUTH',
    metadata: {
      truthFindingId: finding.id,
      candidateIndex,
      truthStatus: finding.status,
    },
  }));
}

function recommendationId(
  identity: Readonly<Record<string, unknown>>,
  hasher: IntelligenceHasher,
): string {
  return `detective_recommendation_${hasher.hash(identity)}`;
}

function createContradiction(input: {
  readonly rule: ContradictionRuleDefinition;
  readonly context: IntelligenceContext;
  readonly configuration: AIDetectiveConfiguration;
  readonly confidenceStrategy: AIDetectiveConfidenceStrategy;
  readonly hasher: IntelligenceHasher;
  readonly productIds: readonly string[];
  readonly variantIds?: readonly string[];
  readonly claims: readonly ContradictionClaimReference[];
  readonly truthFindings?: readonly TruthFinding[];
  readonly evidenceIds?: readonly string[];
  readonly explanation: string;
  readonly contradictionCertainty: number;
  readonly evidenceQuality: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Contradiction | null {
  const productIds = [...new Set(input.productIds)].sort();
  const variantIds = [...new Set(input.variantIds ?? [])].sort();
  const truthFindings = [...(input.truthFindings ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  const severity = input.configuration.severityOverrides[input.rule.contradictionType]
    ?? input.rule.severity;
  if (!input.configuration.enabledContradictionTypes.includes(input.rule.contradictionType)
    || severityRank[severity] < severityRank[input.configuration.minimumSeverity]) return null;
  const confidence = input.confidenceStrategy.calculate({
    type: input.rule.contradictionType,
    truthFindings,
    contradictionCertainty: input.contradictionCertainty,
    evidenceQuality: input.evidenceQuality,
    thresholds: input.context.confidenceThresholds,
  });
  if (confidence.value < input.configuration.confidenceThresholds[input.rule.contradictionType]) return null;
  const identity = {
    ruleId: input.rule.id,
    productIds,
    variantIds,
    findingIds: truthFindings.map(({ id }) => id),
    claims: input.claims.map(({ productId, variantId, fieldPath, displayValue, source }) => ({
      productId,
      variantId: variantId ?? null,
      fieldPath,
      displayValue: displayValue ?? null,
      source,
    })),
  };
  const fingerprint = input.hasher.hash(identity);
  const id = `contradiction_${fingerprint}`;
  return {
    id,
    productId: productIds[0],
    affectedProductIds: productIds,
    ...(variantIds[0] ? { variantId: variantIds[0] } : {}),
    affectedVariantIds: variantIds,
    type: input.rule.contradictionType,
    severity,
    confidence,
    explanation: input.explanation,
    involvedClaims: input.claims,
    involvedTruthFindingIds: truthFindings.map(({ id: findingId }) => findingId),
    involvedEvidenceIds: [...new Set(input.evidenceIds ?? truthFindings.flatMap(evidenceIds))].sort(),
    recommendationIds: [recommendationId({ contradictionId: id, ruleId: input.rule.id }, input.hasher)],
    ruleId: input.rule.id,
    ruleVersion: input.rule.version,
    fingerprint,
    metadata: {
      deterministic: true,
      recommendationTemplate: input.rule.recommendationTemplate,
      detectorFamily: input.rule.detectorFamily,
      ...input.metadata,
    },
  };
}

function rulesFor(
  dependencies: DetectiveEvaluationDependencies,
  family: string,
): readonly ContradictionRuleDefinition[] {
  return dependencies.rules.filter({
    family,
    types: dependencies.configuration.enabledContradictionTypes,
  });
}

export function evaluateTruthConflicts(
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const rule of rulesFor(dependencies, 'truth-conflict')) {
    for (const finding of dependencies.truthReport.findings) {
      if (finding.status !== 'CONFLICTED') continue;
      const contradiction = createContradiction({
        rule,
        ...dependencies,
        productIds: [finding.productId],
        variantIds: finding.variantId ? [finding.variantId] : [],
        claims: claimsForConflictedFinding(finding),
        truthFindings: [finding],
        explanation: template(rule.explanationTemplate, {
          field: finding.fieldPath,
          values: finding.candidateValues.join(' versus '),
        }),
        contradictionCertainty: finding.confidence.value,
        evidenceQuality: Math.min(0.98, finding.evidenceSummary.strongestAuthority === 'UNKNOWN' ? 0.4 : 0.85),
        metadata: { candidateValues: finding.candidateValues },
      });
      if (contradiction) contradictions.push(contradiction);
    }
    const verifiedGroups = new Map<string, TruthFinding[]>();
    for (const finding of dependencies.truthReport.findings) {
      if (finding.status !== 'VERIFIED' || finding.selectedValue === undefined) continue;
      const key = stableSerialize({
        productId: finding.productId,
        variantId: finding.variantId ?? null,
        fieldPath: finding.fieldPath,
      });
      const group = verifiedGroups.get(key) ?? [];
      group.push(finding);
      verifiedGroups.set(key, group);
    }
    for (const findings of verifiedGroups.values()) {
      const values = [...new Set(findings.map(({ selectedValue }) => canonical(selectedValue)))];
      if (values.length < 2) continue;
      const ordered = [...findings].sort((left, right) => left.id.localeCompare(right.id));
      const contradiction = createContradiction({
        rule,
        ...dependencies,
        productIds: ordered.map(({ productId }) => productId),
        variantIds: ordered.flatMap(({ variantId }) => variantId ? [variantId] : []),
        claims: ordered.map(claimForFinding),
        truthFindings: ordered,
        explanation: template(rule.explanationTemplate, {
          field: ordered[0].fieldPath,
          values: ordered.map(({ selectedValue }) => selectedValue).join(' versus '),
        }),
        contradictionCertainty: Math.min(
          0.98,
          ordered.reduce((sum, finding) => sum + finding.confidence.value, 0) / ordered.length,
        ),
        evidenceQuality: Math.min(
          0.98,
          ordered.reduce((sum, finding) => (
            sum + (finding.evidenceSummary.strongestAuthority === 'UNKNOWN' ? 0.4 : 0.85)
          ), 0) / ordered.length,
        ),
        metadata: {
          candidateValues: ordered.map(({ selectedValue }) => selectedValue),
          crossFindingConflict: true,
        },
      });
      if (contradiction) contradictions.push(contradiction);
    }
  }
  return contradictions.sort((left, right) => left.id.localeCompare(right.id));
}

interface IdentityRecord {
  readonly productId: string;
  readonly variantId: string;
  readonly field: 'sku' | 'barcode';
  readonly value: string;
}

export function evaluateIdentityConflicts(
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const rule of rulesFor(dependencies, 'identity-conflict')) {
    const field = rule.metadata.identityField;
    if ((field !== 'sku' && field !== 'barcode')
      || !dependencies.configuration.duplicateIdentityFields.includes(field)) continue;
    const groups = new Map<string, IdentityRecord[]>();
    for (const product of dependencies.context.products) {
      for (const variant of product.variants) {
        const value = variant[field];
        if (!value?.trim()) continue;
        const key = canonical(value);
        const group = groups.get(key) ?? [];
        group.push({ productId: product.id, variantId: variant.id, field, value });
        groups.set(key, group);
      }
    }
    for (const [, records] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (records.length < 2) continue;
      const ordered = [...records].sort((left, right) => (
        left.productId.localeCompare(right.productId) || left.variantId.localeCompare(right.variantId)
      ));
      const claims = ordered.map((record): ContradictionClaimReference => ({
        productId: record.productId,
        variantId: record.variantId,
        namespace: 'variant',
        key: record.field,
        fieldPath: `variants.${record.variantId}.${record.field}`,
        displayValue: record.value,
        source: 'NORMALIZED_FIELD',
        metadata: {},
      }));
      const contradiction = createContradiction({
        rule,
        ...dependencies,
        productIds: ordered.map(({ productId }) => productId),
        variantIds: ordered.map(({ variantId }) => variantId),
        claims,
        explanation: template(rule.explanationTemplate, {
          identity: ordered[0].value,
          records: ordered.map(({ productId, variantId }) => `${productId}/${variantId}`).join(', '),
        }),
        contradictionCertainty: 0.98,
        evidenceQuality: 0.9,
        metadata: {
          identityField: field,
          normalizedIdentity: canonical(ordered[0].value),
          recordCount: ordered.length,
        },
      });
      if (contradiction) contradictions.push(contradiction);
    }
  }
  return contradictions.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizedField(product: NormalizedProduct, fieldPath: string): unknown {
  if (['title', 'description', 'vendor', 'productType', 'status'].includes(fieldPath)) {
    return product[fieldPath as 'title' | 'description' | 'vendor' | 'productType' | 'status'];
  }
  if (fieldPath.startsWith('seo.')) {
    return product.seo[fieldPath.slice(4) as keyof typeof product.seo];
  }
  if (fieldPath.startsWith('attributes.')) return product.attributes[fieldPath.slice(11)];
  if (fieldPath.startsWith('specifications.')) {
    const key = fieldPath.slice('specifications.'.length);
    const specification = product.specifications.find((item) => item.key === key);
    return specification?.normalizedValue ?? specification?.rawValue;
  }
  const variantMatch = /^variants\.([^.]+)\.(.+)$/u.exec(fieldPath);
  if (variantMatch) {
    const variant = product.variants.find(({ id }) => id === variantMatch[1]);
    if (!variant) return undefined;
    if (variantMatch[2].startsWith('options.')) return variant.options[variantMatch[2].slice(8)];
    if (variantMatch[2].startsWith('attributes.')) return variant.attributes[variantMatch[2].slice(11)];
    if (['title', 'sku', 'barcode', 'price', 'compareAtPrice'].includes(variantMatch[2])) {
      return variant[variantMatch[2] as 'title' | 'sku' | 'barcode' | 'price' | 'compareAtPrice'];
    }
  }
  return undefined;
}

function truthFact(
  report: ProductTruthReport,
  productId: string,
  fieldPath: string,
): FactValue | undefined {
  const finding = report.findings
    .filter((item) => item.productId === productId
      && item.fieldPath === fieldPath
      && item.selectedValue !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  return finding ? {
    value: finding.selectedValue,
    displayValue: finding.selectedValue!,
    fieldPath,
    source: 'PRODUCT_TRUTH',
    finding,
  } : undefined;
}

function factValue(
  condition: ContradictionFactCondition,
  product: NormalizedProduct,
  report: ProductTruthReport,
): FactValue | undefined {
  if (condition.source === 'PRODUCT_TRUTH' || condition.source === 'ANY') {
    const truth = truthFact(report, product.id, condition.fieldPath);
    if (truth) return truth;
  }
  if (condition.source === 'NORMALIZED_FIELD' || condition.source === 'ANY') {
    const value = normalizedField(product, condition.fieldPath);
    if (value !== undefined && value !== null && !(typeof value === 'string' && !value.trim())) {
      return {
        value,
        displayValue: display(value),
        fieldPath: condition.fieldPath,
        source: 'NORMALIZED_FIELD',
      };
    }
  }
  return undefined;
}

function conditionMatches(condition: ContradictionFactCondition, fact: FactValue | undefined): boolean {
  if (condition.operator === 'EXISTS') return Boolean(fact);
  if (!fact) return false;
  if (condition.operator === 'EQUALS') return canonical(fact.value) === canonical(condition.value);
  if (condition.operator === 'NOT_EQUALS') return canonical(fact.value) !== canonical(condition.value);
  return (condition.values ?? []).some((value) => canonical(fact.value) === canonical(value));
}

function claimForFact(productId: string, fact: FactValue): ContradictionClaimReference {
  return {
    productId,
    ...(fact.finding?.variantId ? { variantId: fact.finding.variantId } : {}),
    namespace: fact.fieldPath.split('.')[0] || 'product',
    key: fact.fieldPath.split('.').slice(1).join('.') || fact.fieldPath,
    fieldPath: fact.fieldPath,
    displayValue: fact.displayValue,
    source: fact.source,
    metadata: fact.finding ? { truthFindingId: fact.finding.id } : {},
  };
}

function evaluateCombinationRule(
  rule: ContradictionRuleDefinition,
  policy: CombinationContradictionPolicy,
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const product of dependencies.context.products) {
    const left = factValue(policy.left, product, dependencies.truthReport);
    const right = factValue(policy.right, product, dependencies.truthReport);
    if (!conditionMatches(policy.left, left) || !conditionMatches(policy.right, right) || !left || !right) continue;
    const findings = [left.finding, right.finding].filter((item): item is TruthFinding => Boolean(item));
    const contradiction = createContradiction({
      rule,
      ...dependencies,
      productIds: [product.id],
      variantIds: findings.flatMap(({ variantId }) => variantId ? [variantId] : []),
      claims: [claimForFact(product.id, left), claimForFact(product.id, right)],
      truthFindings: findings,
      explanation: template(rule.explanationTemplate, {
        leftField: left.fieldPath,
        leftValue: left.displayValue,
        rightField: right.fieldPath,
        rightValue: right.displayValue,
      }),
      contradictionCertainty: rule.contradictionType === 'IMPOSSIBLE_COMBINATION' ? 0.96 : 0.72,
      evidenceQuality: findings.length
        ? findings.reduce((sum, finding) => sum + finding.confidence.value, 0) / findings.length
        : 0.8,
      metadata: { combinationPolicy: policy },
    });
    if (contradiction) contradictions.push(contradiction);
  }
  return contradictions;
}

export function evaluateCombinationConflicts(
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  return dependencies.rules.filter({
    types: ['IMPOSSIBLE_COMBINATION', 'SUSPICIOUS_COMBINATION'],
  }).flatMap((rule) => (
    rule.combination ? evaluateCombinationRule(rule, rule.combination, dependencies) : []
  )).sort((left, right) => left.id.localeCompare(right.id));
}

export function evaluateWeakEvidenceConflicts(
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const rule of rulesFor(dependencies, 'weak-evidence')) {
    for (const finding of dependencies.truthReport.findings) {
      if (finding.status !== 'MERCHANT_OVERRIDE' || !finding.conflictSummary.hasMaterialConflict) continue;
      const contradiction = createContradiction({
        rule,
        ...dependencies,
        productIds: [finding.productId],
        variantIds: finding.variantId ? [finding.variantId] : [],
        claims: [claimForFinding(finding)],
        truthFindings: [finding],
        explanation: template(rule.explanationTemplate, { field: finding.fieldPath }),
        contradictionCertainty: 0.9,
        evidenceQuality: finding.confidence.value,
        metadata: { overrideValue: finding.selectedValue ?? null },
      });
      if (contradiction) contradictions.push(contradiction);
    }
  }
  return contradictions.sort((left, right) => left.id.localeCompare(right.id));
}

export function evaluateListingConflicts(
  dependencies: DetectiveEvaluationDependencies,
): readonly Contradiction[] {
  const productById = new Map(dependencies.context.products.map((product) => [product.id, product]));
  const contradictions: Contradiction[] = [];
  for (const rule of rulesFor(dependencies, 'listing-conflict')) {
    for (const finding of dependencies.truthReport.findings) {
      if (!dependencies.configuration.truthListingStatuses.includes(finding.status)
        || finding.selectedValue === undefined) continue;
      const product = productById.get(finding.productId);
      if (!product) continue;
      const listingValue = normalizedField(product, finding.fieldPath);
      if (listingValue === undefined || canonical(listingValue) === canonical(finding.selectedValue)) continue;
      const listingClaim: ContradictionClaimReference = {
        productId: finding.productId,
        ...(finding.variantId ? { variantId: finding.variantId } : {}),
        namespace: finding.fieldPath.split('.')[0] || 'product',
        key: finding.fieldPath.split('.').slice(1).join('.') || finding.fieldPath,
        fieldPath: finding.fieldPath,
        displayValue: display(listingValue),
        source: 'NORMALIZED_FIELD',
        metadata: {},
      };
      const contradiction = createContradiction({
        rule,
        ...dependencies,
        productIds: [finding.productId],
        variantIds: finding.variantId ? [finding.variantId] : [],
        claims: [listingClaim, claimForFinding(finding)],
        truthFindings: [finding],
        explanation: template(rule.explanationTemplate, {
          field: finding.fieldPath,
          listingValue: display(listingValue),
          truthValue: finding.selectedValue,
        }),
        contradictionCertainty: 0.96,
        evidenceQuality: finding.confidence.value,
        metadata: {
          listingValue: display(listingValue),
          truthValue: finding.selectedValue,
        },
      });
      if (contradiction) contradictions.push(contradiction);
    }
  }
  return contradictions.sort((left, right) => left.id.localeCompare(right.id));
}

export type DetectiveEvaluator = (
  dependencies: DetectiveEvaluationDependencies,
) => readonly Contradiction[];

export const DETECTIVE_EVALUATORS: Readonly<Record<string, DetectiveEvaluator>> = Object.freeze({
  'truth-conflict': evaluateTruthConflicts,
  'identity-conflict': evaluateIdentityConflicts,
  combination: evaluateCombinationConflicts,
  'weak-evidence': evaluateWeakEvidenceConflicts,
  'listing-conflict': evaluateListingConflicts,
});
