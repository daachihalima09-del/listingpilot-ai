import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const root = join(process.cwd(), 'src', 'modules', 'intelligence');

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'testing') return [];
      return productionFiles(path);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

test('intelligence production domain has no forbidden application or infrastructure imports', () => {
  const forbidden = [
    /from\s+['"](?:next|react|openai|@prisma|prisma)/i,
    /from\s+['"][^'"]*shopify/i,
    /from\s+['"][^'"]*(?:repositories|route)/i,
    /process\.env/,
    /\bfetch\s*\(/,
    /node:fs/,
    /node:http/,
    /node:https/,
  ];
  const violations: string[] = [];
  for (const file of productionFiles(root)) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        violations.push(`${relative(root, file)} matched ${pattern}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('public API can be consumed from one module entrypoint', async () => {
  const api = await import('./index.ts');
  for (const name of [
    'IntelligenceEngine',
    'DetectorRegistry',
    'KnowledgePackRegistry',
    'CapabilityPackRegistry',
    'EvidenceProviderRegistry',
    'RuleRegistry',
    'RecommendationEngine',
    'NeutralConfidenceStrategy',
    'createNormalizedProduct',
    'createProductTruthConfiguration',
    'createProductTruthCapabilityPack',
    'createProductTruthBundle',
    'ProductTruthAnalyzer',
    'ProductTruthClaimExtractorRegistry',
    'ProductTruthResolutionStrategyRegistry',
    'ProductTruthDetector',
    'ProductTruthRecommendationStrategy',
    'evaluateProductTruthQualityStatus',
    'getProductTruthReport',
    'createAIDetectiveConfiguration',
    'createAIDetectiveCapabilityPack',
    'createAIDetectiveBundle',
    'ContradictionRuleRegistry',
    'TruthConflictDetector',
    'IdentityConflictDetector',
    'ImpossibleCombinationDetector',
    'WeakEvidenceDetector',
    'ListingConflictDetector',
    'AIDetectiveRecommendationStrategy',
    'evaluateDetectiveQualityStatus',
    'getAIDetectiveReport',
    'createRecommendationIntelligenceConfiguration',
    'createRecommendationIntelligenceCapabilityPack',
    'createRecommendationIntelligenceBundle',
    'RecommendationRuleRegistry',
    'RecommendationPlanner',
    'buildRecommendationDependencyGraph',
    'topologicalRecommendationOrder',
    'groupRecommendations',
    'prioritizeRecommendation',
    'createRecommendationPlanSummary',
    'evaluateRecommendationPlanQuality',
    'getRecommendationPlan',
    'createCatalogHealthConfiguration',
    'createCatalogHealthCapabilityPack',
    'createCatalogHealthBundle',
    'CatalogHealthReportBuilder',
    'calculateCatalogHealthScore',
    'evaluateProductHealth',
    'evaluateHealthDimensions',
    'evaluateCatalogCoverage',
    'aggregatePublishingReadiness',
    'evaluateAssessmentConfidence',
    'aggregateCatalogProblems',
    'analyzeProblemConcentration',
    'aggregateCatalogSegments',
    'buildCatalogFocusAreas',
    'CatalogHealthReportContributor',
    'getCatalogHealthReport',
    'gradeForHealthScore',
    'statusForHealthScore',
    'mostRestrictiveReadiness',
  ]) {
    assert.equal(name in api, true, `${name} is not publicly exported`);
  }
});
