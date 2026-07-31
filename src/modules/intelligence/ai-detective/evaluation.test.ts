import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { contextFixture, productFixture } from '../testing/fixtures.ts';
import {
  detectiveDependencies,
  truthFindingFixture,
  truthReportFixture,
} from '../testing/ai-detective-fixtures.ts';
import {
  evaluateCombinationConflicts,
  evaluateIdentityConflicts,
  evaluateListingConflicts,
  evaluateTruthConflicts,
  evaluateWeakEvidenceConflicts,
} from './evaluation.ts';
import {
  createAIDetectiveConfiguration,
} from './configuration.ts';
import {
  ContradictionRuleRegistry,
  createDefaultContradictionRuleRegistry,
  type ContradictionRuleDefinition,
} from './rules.ts';

function combinationRule(input: {
  readonly id: string;
  readonly type: 'IMPOSSIBLE_COMBINATION' | 'SUSPICIOUS_COMBINATION';
  readonly leftPath: string;
  readonly leftValue: unknown;
  readonly rightPath: string;
  readonly rightValue: unknown;
}): ContradictionRuleDefinition {
  return {
    id: input.id,
    version: '1.0.0',
    name: input.id,
    description: 'Test data-driven combination.',
    contradictionType: input.type,
    severity: input.type === 'IMPOSSIBLE_COMBINATION' ? 'CRITICAL' : 'MEDIUM',
    enabled: true,
    deterministic: true,
    explanationTemplate: '{leftField}={leftValue} conflicts with {rightField}={rightValue}.',
    recommendationTemplate: 'Review the combination.',
    detectorFamily: 'combination',
    combination: {
      left: {
        source: 'ANY',
        fieldPath: input.leftPath,
        operator: 'EQUALS',
        value: input.leftValue,
      },
      right: {
        source: 'NORMALIZED_FIELD',
        fieldPath: input.rightPath,
        operator: 'EQUALS',
        value: input.rightValue,
      },
    },
    metadata: {},
  };
}

test('conflicting Product Truth values produce a traceable value contradiction', () => {
  const finding = truthFindingFixture({
    status: 'CONFLICTED',
    selectedValue: undefined,
    candidateValues: ['120 Hz', '144 Hz'],
    conflictSummary: {
      materiallySupportedCandidateCount: 2,
      conflictingEvidenceCount: 2,
      hasMaterialConflict: true,
    },
    metadata: {
      supportingEvidenceIds: ['evidence-a'],
      conflictingEvidenceIds: ['evidence-b'],
    },
  });
  const contradictions = evaluateTruthConflicts(detectiveDependencies({
    truthReport: truthReportFixture([finding]),
  }));
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, 'VALUE_CONFLICT');
  assert.deepEqual(contradictions[0].involvedTruthFindingIds, [finding.id]);
  assert.deepEqual(contradictions[0].involvedEvidenceIds, ['evidence-a', 'evidence-b']);
  assert.deepEqual(contradictions[0].involvedClaims.map(({ displayValue }) => displayValue), ['120 Hz', '144 Hz']);
});

test('verified and unresolved Product Truth findings do not become value conflicts', () => {
  const report = truthReportFixture([
    truthFindingFixture({ id: 'verified', status: 'VERIFIED' }),
    truthFindingFixture({ id: 'unresolved', status: 'UNRESOLVED', selectedValue: undefined }),
  ]);
  assert.deepEqual(evaluateTruthConflicts(detectiveDependencies({ truthReport: report })), []);
});

test('two independently verified findings for the same field are compared without pairwise scans', () => {
  const findings = [
    truthFindingFixture({
      id: 'verified-a',
      claimGroupId: 'group-a',
      selectedValue: '120 Hz',
    }),
    truthFindingFixture({
      id: 'verified-b',
      claimGroupId: 'group-b',
      selectedValue: '144 Hz',
    }),
  ];
  const contradiction = evaluateTruthConflicts(detectiveDependencies({
    truthReport: truthReportFixture(findings),
  }))[0];
  assert.ok(contradiction);
  assert.equal(contradiction.type, 'VALUE_CONFLICT');
  assert.deepEqual(contradiction.involvedTruthFindingIds, ['verified-a', 'verified-b']);
  assert.equal(contradiction.metadata.crossFindingConflict, true);
});

test('duplicate SKU identities across products are found with map-based grouping', () => {
  const first = productFixture({
    id: 'p1',
    variants: [{ ...productFixture().variants[0], id: 'v1', sku: ' Shared-SKU ' }],
  });
  const second = productFixture({
    id: 'p2',
    variants: [{ ...productFixture().variants[0], id: 'v2', sku: 'shared-sku' }],
  });
  const dependencies = detectiveDependencies({
    context: contextFixture({ products: [first, second] }),
    truthReport: truthReportFixture([], { productCount: 2 }),
  });
  const contradictions = evaluateIdentityConflicts(dependencies);
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, 'DUPLICATE_IDENTITY');
  assert.deepEqual(contradictions[0].affectedProductIds, ['p1', 'p2']);
  assert.deepEqual(contradictions[0].affectedVariantIds, ['v1', 'v2']);
});

test('unique SKU and barcode identities do not produce duplicate conflicts', () => {
  const first = productFixture({
    id: 'p1',
    variants: [{ ...productFixture().variants[0], id: 'v1', sku: 'sku-1', barcode: 'bar-1' }],
  });
  const second = productFixture({
    id: 'p2',
    variants: [{ ...productFixture().variants[0], id: 'v2', sku: 'sku-2', barcode: 'bar-2' }],
  });
  assert.deepEqual(evaluateIdentityConflicts(detectiveDependencies({
    context: contextFixture({ products: [first, second] }),
    truthReport: truthReportFixture([], { productCount: 2 }),
  })), []);
});

test('duplicate identity fields can be disabled independently', () => {
  const product = productFixture({
    variants: [
      { ...productFixture().variants[0], id: 'v1', sku: 'same', barcode: 'same-bar' },
      { ...productFixture().variants[0], id: 'v2', sku: 'same', barcode: 'same-bar' },
    ],
  });
  const base = detectiveDependencies({
    context: contextFixture({ products: [product] }),
    truthReport: truthReportFixture([]),
  });
  const contradictions = evaluateIdentityConflicts({
    ...base,
    configuration: createAIDetectiveConfiguration({ duplicateIdentityFields: ['barcode'] }),
  });
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].metadata.identityField, 'barcode');
});

test('impossible combinations are evaluated entirely from registered facts', () => {
  const rules = new ContradictionRuleRegistry();
  rules.register(combinationRule({
    id: 'test.impossible',
    type: 'IMPOSSIBLE_COMBINATION',
    leftPath: 'status',
    leftValue: 'ACTIVE',
    rightPath: 'attributes.discontinued',
    rightValue: true,
  }));
  const product = productFixture({ status: 'ACTIVE', attributes: { discontinued: true } });
  const base = detectiveDependencies({
    context: contextFixture({ products: [product] }),
    truthReport: truthReportFixture([]),
  });
  const contradictions = evaluateCombinationConflicts({ ...base, rules });
  assert.equal(contradictions.length, 1);
  assert.equal(contradictions[0].type, 'IMPOSSIBLE_COMBINATION');
  assert.equal(contradictions[0].severity, 'CRITICAL');
});

test('suspicious combinations use the same generic fact engine', () => {
  const rules = new ContradictionRuleRegistry();
  rules.register(combinationRule({
    id: 'test.suspicious',
    type: 'SUSPICIOUS_COMBINATION',
    leftPath: 'vendor',
    leftValue: 'Example vendor',
    rightPath: 'attributes.unverifiedSupplier',
    rightValue: true,
  }));
  const product = productFixture({ attributes: { unverifiedSupplier: true } });
  const base = detectiveDependencies({
    context: contextFixture({ products: [product] }),
    truthReport: truthReportFixture([]),
  });
  assert.equal(evaluateCombinationConflicts({ ...base, rules })[0].type, 'SUSPICIOUS_COMBINATION');
});

test('combination facts can use selected Product Truth values', () => {
  const rules = new ContradictionRuleRegistry();
  rules.register(combinationRule({
    id: 'test.truth-combination',
    type: 'IMPOSSIBLE_COMBINATION',
    leftPath: 'status',
    leftValue: 'ARCHIVED',
    rightPath: 'attributes.available',
    rightValue: true,
  }));
  const finding = truthFindingFixture({
    fieldPath: 'status',
    selectedValue: 'ARCHIVED',
  });
  const product = productFixture({ status: 'ACTIVE', attributes: { available: true } });
  const base = detectiveDependencies({
    context: contextFixture({ products: [product] }),
    truthReport: truthReportFixture([finding]),
  });
  const contradiction = evaluateCombinationConflicts({ ...base, rules })[0];
  assert.ok(contradiction);
  assert.deepEqual(contradiction.involvedTruthFindingIds, [finding.id]);
});

test('non-matching combination facts produce no contradiction', () => {
  const rules = new ContradictionRuleRegistry();
  rules.register(combinationRule({
    id: 'test.no-match',
    type: 'IMPOSSIBLE_COMBINATION',
    leftPath: 'status',
    leftValue: 'ACTIVE',
    rightPath: 'attributes.discontinued',
    rightValue: true,
  }));
  const base = detectiveDependencies({
    context: contextFixture({ products: [productFixture({ attributes: { discontinued: false } })] }),
    truthReport: truthReportFixture([]),
  });
  assert.deepEqual(evaluateCombinationConflicts({ ...base, rules }), []);
});

test('conflicting merchant override becomes a weak-evidence contradiction', () => {
  const finding = truthFindingFixture({
    status: 'MERCHANT_OVERRIDE',
    selectedValue: 'Merchant value',
    conflictSummary: {
      materiallySupportedCandidateCount: 2,
      conflictingEvidenceCount: 1,
      hasMaterialConflict: true,
    },
  });
  const contradiction = evaluateWeakEvidenceConflicts(detectiveDependencies({
    truthReport: truthReportFixture([finding]),
  }))[0];
  assert.ok(contradiction);
  assert.equal(contradiction.type, 'WEAK_EVIDENCE');
  assert.deepEqual(contradiction.involvedTruthFindingIds, [finding.id]);
});

test('merchant override without a material conflict is not flagged', () => {
  const finding = truthFindingFixture({
    status: 'MERCHANT_OVERRIDE',
    conflictSummary: {
      materiallySupportedCandidateCount: 1,
      conflictingEvidenceCount: 0,
      hasMaterialConflict: false,
    },
  });
  assert.deepEqual(evaluateWeakEvidenceConflicts(detectiveDependencies({
    truthReport: truthReportFixture([finding]),
  })), []);
});

test('verified Product Truth different from the normalized listing produces a mismatch', () => {
  const finding = truthFindingFixture({ selectedValue: 'Verified title' });
  const contradiction = evaluateListingConflicts(detectiveDependencies({
    context: contextFixture({ products: [productFixture({ title: 'Current listing title' })] }),
    truthReport: truthReportFixture([finding]),
  }))[0];
  assert.ok(contradiction);
  assert.equal(contradiction.type, 'TRUTH_LISTING_MISMATCH');
  assert.deepEqual(contradiction.involvedClaims.map(({ source }) => source), [
    'NORMALIZED_FIELD',
    'PRODUCT_TRUTH',
  ]);
});

test('equivalent normalized listing and Product Truth values are not mismatches', () => {
  const finding = truthFindingFixture({ selectedValue: ' generic   PRODUCT ' });
  assert.deepEqual(evaluateListingConflicts(detectiveDependencies({
    context: contextFixture({ products: [productFixture({ title: 'Generic product' })] }),
    truthReport: truthReportFixture([finding]),
  })), []);
});

test('configuration severity and confidence thresholds filter contradictions', () => {
  const finding = truthFindingFixture({
    status: 'CONFLICTED',
    selectedValue: undefined,
    candidateValues: ['A', 'B'],
  });
  const base = detectiveDependencies({ truthReport: truthReportFixture([finding]) });
  assert.deepEqual(evaluateTruthConflicts({
    ...base,
    configuration: createAIDetectiveConfiguration({ minimumSeverity: 'CRITICAL' }),
  }), []);
  assert.deepEqual(evaluateTruthConflicts({
    ...base,
    configuration: createAIDetectiveConfiguration({
      confidenceThresholds: { VALUE_CONFLICT: 0.99 },
    }),
  }), []);
});

test('same facts produce stable contradiction IDs and fingerprints', () => {
  const finding = truthFindingFixture({
    status: 'CONFLICTED',
    selectedValue: undefined,
    candidateValues: ['A', 'B'],
  });
  const dependencies = detectiveDependencies({ truthReport: truthReportFixture([finding]) });
  const first = evaluateTruthConflicts(dependencies)[0];
  const second = evaluateTruthConflicts({
    ...dependencies,
    hasher: new DeterministicHasher(),
  })[0];
  assert.equal(first.id, second.id);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.recommendationIds, second.recommendationIds);
});

test('default rule registry contains no product-category hardcoding', () => {
  const serialized = JSON.stringify(createDefaultContradictionRuleRegistry().filter());
  assert.equal(/television|refresh.?rate|tv-specific/iu.test(serialized), false);
});
