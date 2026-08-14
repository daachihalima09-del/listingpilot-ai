import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import type {
  Evidence,
  NormalizedProduct,
  SourceReference,
} from '../../intelligence/domain/types.ts';
import type {
  ProductTruthReport,
  TruthFinding,
  TruthResolutionStatus,
} from '../../intelligence/product-truth/types.ts';
import {
  analyzeProductIntelligence,
  defaultProductIntelligenceRegistry,
} from '../../product-intelligence/index.ts';
import {
  createAiPolicyContext,
  createPublishingPolicyContext,
  type EffectiveMerchantPreferences,
  type MerchantBusinessProfile,
} from '../../merchant-preferences/index.ts';
import type { ProjectDetail } from '../../projects/services/project-service.ts';
import { createListingGenerationPlan } from '../composition/generation-plan-composer.ts';
import type { ListingGenerationPlan } from '../domain/contracts.ts';

function normalizedField(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
}

function sourceReference(project: ProjectDetail, timestamp: string): SourceReference {
  const sourceType = project.sourceType === 'SUPPLIER_URL' || project.sourceType === 'PRODUCT_URL'
    ? 'SUPPLIER_WEBSITE'
    : project.sourceType === 'UPLOADED_PDF'
      ? 'DOCUMENT'
      : project.sourceType === 'SHOPIFY_IMPORT'
        ? 'COMMERCE_PLATFORM'
        : 'MANUAL';
  return {
    sourceType,
    ...(project.sourceUrl ? { url: project.sourceUrl } : {}),
    label: project.sourceType?.replaceAll('_', ' ') ?? 'Saved project',
    retrievedAt: timestamp,
    metadata: {},
  };
}

function createProductAndEvidence(project: ProjectDetail): {
  product: NormalizedProduct;
  evidence: readonly Evidence[];
} {
  if (!project.analysisData) throw new Error('Project analysis is required before generation.');
  const timestamp = project.updatedAt.toISOString();
  const reference = sourceReference(project, timestamp);
  const verifiedRows = project.analysisData.truthRows.filter(({ status, value }) =>
    status !== 'Missing' && value.trim() && value.trim().toLocaleLowerCase('en-US') !== 'missing');
  const evidence = verifiedRows.flatMap((row, index): Evidence[] => {
    if (row.status === 'Likely') return [];
    const field = normalizedField(row.field);
    const values = row.status === 'Conflict'
      ? [
          project.analysisData!.activeProduct.conflict.official,
          project.analysisData!.activeProduct.conflict.amazon,
        ].filter(Boolean)
      : [row.value];
    return values.map((value, valueIndex) => ({
      id: `project-evidence-${index}-${valueIndex}`,
      providerId: `project-source-${index}-${valueIndex}`,
      type: 'SOURCE_VALUE',
      sourceReference: reference,
      claim: `${row.field}: ${value}`,
      affectedField: field,
      rawValue: value,
      normalizedValue: value,
      reliability: row.status === 'Verified' ? 'HIGH' : 'MEDIUM',
      freshness: 1,
      priority: row.status === 'Conflict' ? 100 : 50,
      retrievedAt: timestamp,
      metadata: {
        productId: project.id,
        claimNamespace: 'product',
        claimKey: field,
        affectedFieldPath: field,
        displayLabel: row.field,
        valueType: 'STRING',
        providerType: row.source.toLocaleLowerCase('en-US').includes('official') ? 'MANUFACTURER' : 'MERCHANT',
        structured: true,
        direct: row.status === 'Verified',
        sourceIdentity: `project:${project.id}:${row.source}`,
        importance: ['brand', 'model', 'product_type'].includes(field) ? 'CRITICAL' : 'HIGH',
      },
    }));
  });
  const evidenceByField = new Map<string, string[]>();
  for (const item of evidence) {
    if (!item.affectedField) continue;
    evidenceByField.set(item.affectedField, [...(evidenceByField.get(item.affectedField) ?? []), item.id]);
  }
  const firstRawLine = project.rawInput?.split(/\r?\n/u).find((line) => line.trim())?.trim();
  const existingTitle = project.generatedListing?.title;
  const title = firstRawLine || existingTitle || project.name;
  const attributes = Object.fromEntries(verifiedRows.map((row) => [normalizedField(row.field), row.value]));
  const brand = project.analysisData.activeProduct.brand;
  const model = project.analysisData.activeProduct.model;
  const productTypeRow = verifiedRows.find(({ field }) => ['type', 'product type'].includes(field.trim().toLocaleLowerCase('en-US')));
  const product: NormalizedProduct = {
    id: project.id,
    sourceReferences: [reference],
    title,
    ...(project.generatedListing?.description ? { description: project.generatedListing.description } : {}),
    ...(productTypeRow ? { productType: productTypeRow.value } : {}),
    categories: [],
    tags: project.seoData?.tags.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
    status: project.status,
    specifications: verifiedRows.map((row) => {
      const key = normalizedField(row.field);
      return {
        key,
        label: row.field,
        rawValue: row.value,
        normalizedValue: row.value,
        valueType: 'STRING',
        evidenceIds: evidenceByField.get(key) ?? [],
      };
    }),
    variants: [],
    media: [],
    seo: {
      ...(project.seoData?.seoTitle ? { title: project.seoData.seoTitle } : {}),
      ...(project.seoData?.seoDescription ? { description: project.seoData.seoDescription } : {}),
      evidenceIds: [],
    },
    attributes: {
      ...attributes,
      ...(brand && brand !== 'Missing' ? { brand } : {}),
      ...(model && model !== 'Missing' ? { model } : {}),
    },
    evidenceIds: evidence.map(({ id }) => id),
    createdAt: project.createdAt.toISOString(),
    updatedAt: timestamp,
    extensions: {},
  };
  return { product, evidence };
}

export function createPersistedProductTruthReport(project: ProjectDetail): ProductTruthReport {
  if (!project.analysisData) throw new Error('Project analysis is required before generation.');
  const hasher = new DeterministicHasher();
  const timestamp = project.updatedAt.toISOString();
  const conflict = project.analysisData.activeProduct.conflict;
  const findings = project.analysisData.truthRows.map((row): TruthFinding => {
    const fieldPath = normalizedField(row.field);
    const status: TruthResolutionStatus = row.status === 'Verified'
      ? 'VERIFIED'
      : row.status === 'Conflict'
        ? 'CONFLICTED'
        : row.status === 'Likely'
          ? 'LIKELY'
          : 'INSUFFICIENT_EVIDENCE';
    const conflictValues = row.status === 'Conflict'
      && normalizedField(conflict.label) === fieldPath
      ? [conflict.official, conflict.amazon, conflict.lg, row.value]
      : [row.value];
    const candidateValues = [...new Set(conflictValues
      .map((value) => value.trim())
      .filter((value) => value && value.toLocaleLowerCase('en-US') !== 'missing'))];
    const importance = ['brand', 'model', 'product_type', 'type', 'title'].includes(fieldPath)
      ? 'CRITICAL' as const
      : 'HIGH' as const;
    const fingerprint = hasher.hash({
      projectId: project.id,
      fieldPath,
      status,
      candidateValues,
      confidence: row.confidence,
      source: row.source,
    });
    return {
      id: `persisted_truth_${fingerprint}`,
      productId: project.id,
      claimGroupId: `persisted_group_${hasher.hash({ projectId: project.id, fieldPath })}`,
      fieldPath,
      claimLabel: row.field,
      importance,
      status,
      ...(status === 'VERIFIED' || status === 'LIKELY' ? { selectedValue: row.value } : {}),
      candidateValues,
      confidence: {
        value: row.confidence / 100,
        level: row.confidence >= 90 ? 'VERY_HIGH' : row.confidence >= 75 ? 'HIGH' : row.confidence >= 50 ? 'MEDIUM' : row.confidence > 0 ? 'LOW' : 'VERY_LOW',
        strategyVersion: 'persisted-analysis-v1',
        factors: [],
      },
      confidenceMeaning: 'RESOLUTION_STATUS',
      evidenceSummary: {
        evidenceCount: row.sourcesCount,
        independentSourceCount: row.sourcesCount,
        strongestAuthority: row.status === 'Missing'
          ? 'UNKNOWN'
          : row.source.toLocaleLowerCase('en-US').includes('official')
            ? 'MANUFACTURER_STRUCTURED'
            : project.sourceType === 'RAW_SPECIFICATIONS'
              ? 'MERCHANT_LISTING'
              : 'RETAILER_STRUCTURED',
        missingProvenanceCount: row.sourcesCount > 0 ? 0 : 1,
      },
      conflictSummary: {
        materiallySupportedCandidateCount: status === 'CONFLICTED' ? candidateValues.length : candidateValues.length ? 1 : 0,
        conflictingEvidenceCount: status === 'CONFLICTED' ? candidateValues.length : 0,
        hasMaterialConflict: status === 'CONFLICTED',
      },
      explanation: row.reasoning ?? `${row.field} is ${row.status.toLocaleLowerCase('en-US')} in the saved analysis.`,
      reviewRequirement: status === 'CONFLICTED'
        ? importance === 'CRITICAL' ? 'BLOCKING' : 'REQUIRED'
        : status === 'LIKELY' ? 'REQUIRED' : status === 'INSUFFICIENT_EVIDENCE' ? 'OPTIONAL' : 'NONE',
      associatedIssueIds: [],
      associatedRecommendationIds: [],
      deterministicFingerprint: fingerprint,
      metadata: { persistedAnalysis: true },
    };
  }).sort((left, right) => left.fieldPath.localeCompare(right.fieldPath));
  const count = (status: TruthResolutionStatus) => findings.filter((finding) => finding.status === status).length;
  return {
    schemaVersion: '1.0.0',
    capabilityId: 'product-truth',
    capabilityVersion: 'persisted-analysis-v1',
    analysisScope: 'SINGLE_PRODUCT',
    productCount: 1,
    claimCount: findings.length,
    claimGroupCount: findings.length,
    resolvedCount: findings.filter(({ status }) => !['UNRESOLVED', 'INSUFFICIENT_EVIDENCE'].includes(status)).length,
    verifiedCount: count('VERIFIED'),
    likelyCount: count('LIKELY'),
    conflictedCount: count('CONFLICTED'),
    unresolvedCount: count('UNRESOLVED'),
    insufficientEvidenceCount: count('INSUFFICIENT_EVIDENCE'),
    merchantOverrideCount: count('MERCHANT_OVERRIDE'),
    notApplicableCount: count('NOT_APPLICABLE'),
    findings,
    confidenceDistribution: {},
    evidenceSourceDistribution: {},
    resolutionStrategyStatistics: {},
    warnings: [],
    deterministicFingerprint: hasher.hash(findings.map(({ deterministicFingerprint }) => deterministicFingerprint)),
    createdAt: timestamp,
  };
}

export function createProjectListingGenerationPlan(input: {
  readonly project: ProjectDetail;
  readonly effectivePreferences: EffectiveMerchantPreferences;
  readonly businessProfile: MerchantBusinessProfile;
}): ListingGenerationPlan {
  const { project, effectivePreferences, businessProfile } = input;
  const { product } = createProductAndEvidence(project);
  const hasher = new DeterministicHasher();
  const truth = createPersistedProductTruthReport(project);
  const intelligence = analyzeProductIntelligence(product, defaultProductIntelligenceRegistry);
  const pack = intelligence.intelligencePack
    ? defaultProductIntelligenceRegistry.getById(intelligence.intelligencePack.id) ?? null
    : null;
  const sectionVersion = (id: 'catalog' | 'listing' | 'seo' | 'publishing' | 'ai') =>
    businessProfile.sectionVersions[id] ?? 1;
  return createListingGenerationPlan({
    project: {
      id: project.id,
      workspaceId: project.workspaceId,
      productId: product.id,
      version: project.version,
      expectedVersion: project.version,
      status: project.status,
      currentListing: {
        ...(project.generatedListing?.title ? { title: project.generatedListing.title } : {}),
        ...(project.generatedListing?.description ? { description: project.generatedListing.description } : {}),
        ...(project.generatedListing?.keyFeatures ? { features: project.generatedListing.keyFeatures } : {}),
      },
      currentSeo: {
        ...(project.seoData?.seoTitle ? { title: project.seoData.seoTitle } : {}),
        ...(project.seoData?.seoDescription ? { description: project.seoData.seoDescription } : {}),
      },
      shopifyProductId: null,
    },
    product,
    productTruth: truth,
    productIntelligence: { analysis: intelligence, pack },
    merchantPreferences: effectivePreferences,
    aiPolicy: createAiPolicyContext(effectivePreferences.ai),
    publishingPolicy: createPublishingPolicyContext(effectivePreferences.publishing),
    aiDetectiveFindings: [],
    recommendations: [],
    lockedFields: [],
    sourceFingerprint: hasher.hash({
      projectId: project.id,
      projectVersion: project.version,
      analysisData: project.analysisData,
      effectivePreferences: effectivePreferences.fingerprint,
    }),
    snapshotCreatedAt: project.updatedAt.toISOString(),
    profileVersions: {
      catalog: { schemaVersion: 1, version: sectionVersion('catalog'), fingerprint: effectivePreferences.catalog.fingerprint },
      listing: { schemaVersion: 1, version: sectionVersion('listing'), fingerprint: effectivePreferences.listing.fingerprint },
      seo: { schemaVersion: 1, version: sectionVersion('seo'), fingerprint: effectivePreferences.seo.fingerprint },
      publishing: { schemaVersion: 1, version: sectionVersion('publishing'), fingerprint: effectivePreferences.publishing.fingerprint },
      ai: { schemaVersion: 1, version: sectionVersion('ai'), fingerprint: effectivePreferences.ai.fingerprint },
    },
  });
}
