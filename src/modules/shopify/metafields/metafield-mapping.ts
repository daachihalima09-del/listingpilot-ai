import { createHash } from 'node:crypto';
import {
  projectAnalysisDataSchema,
  projectGeneratedListingSchema,
  projectSeoDataSchema,
} from '../../projects/validators/project.ts';
import {
  SHOPIFY_METAFIELD_CATALOG,
  SHOPIFY_METAFIELD_CATALOG_VERSION,
  type MetafieldCatalogDefinition,
} from './metafield-catalog.ts';
import {
  deterministicJson,
  normalizeMetafieldValue,
} from './metafield-validation.ts';

const placeholders = new Set([
  '',
  'n/a',
  'na',
  'unknown',
  'not provided',
  'null',
  'missing',
]);

export interface MetafieldMappingProject {
  projectId: string;
  analysisData: unknown;
  generatedListing: unknown;
  seoData: unknown;
  lastPublishedAt?: Date | null;
}

export interface MappedMetafield {
  catalogId: string;
  namespace: string;
  key: string;
  type: MetafieldCatalogDefinition['type'];
  value: string;
  valueHash: string;
}

export function metafieldValueHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return placeholders.has(clean.toLocaleLowerCase('en-US'))
    ? undefined
    : clean;
}

function normalizedList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const seen = new Set<string>();
  const items = value
    .split(/\r?\n|,/)
    .map((item) => item.replace(/^\s*[-*•]\s*/, '').trim())
    .flatMap((item) => {
      const clean = cleanText(item);
      if (!clean) return [];
      const identity = clean.toLocaleLowerCase('en-US');
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [clean];
    });
  return items.length ? items : undefined;
}

export function opaqueProjectReference(projectId: string): string {
  return `lp_${createHash('sha256').update(projectId).digest('hex').slice(0, 24)}`;
}

export function mapProjectToMetafields(
  project: MetafieldMappingProject,
): MappedMetafield[] {
  const analysis = projectAnalysisDataSchema.safeParse(project.analysisData);
  const listing = projectGeneratedListingSchema.safeParse(
    project.generatedListing,
  );
  const seo = projectSeoDataSchema.safeParse(project.seoData);
  const truthRows = analysis.success ? analysis.data.truthRows : [];
  const availableRows = truthRows.filter(({ status, value }) => (
    status !== 'Missing' && cleanText(value)
  ));
  const row = (field: string) => cleanText(availableRows.find(
    (candidate) => (
      candidate.field.trim().toLocaleLowerCase('en-US')
      === field.toLocaleLowerCase('en-US')
    ),
  )?.value);
  const specsObject = Object.fromEntries(
    availableRows
      .map(({ field, value }) => [field.trim(), value.trim()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const verified = truthRows.filter(({ status }) => status === 'Verified').length;
  const conflicts = truthRows.filter(({ status }) => status === 'Conflict').length;
  const verificationStatus = conflicts
    ? 'CONFLICTS_FOUND'
    : truthRows.length && verified === truthRows.length
      ? 'VERIFIED'
      : verified
        ? 'PARTIALLY_VERIFIED'
        : 'UNVERIFIED';
  const analysisSafeValue = analysis.success ? {
    product: {
      brand: cleanText(analysis.data.activeProduct.brand),
      model: cleanText(analysis.data.activeProduct.model),
    },
    specifications: specsObject,
    verificationStatus,
    confidenceScore: analysis.data.activeProduct.catalogHealth.score,
    sourceCount: analysis.data.activeProduct.sources.length,
    verifiedFieldCount: verified,
    conflictCount: conflicts,
  } : undefined;
  const values: Record<string, unknown> = {
    'listingpilot_specs.specifications_json':
      Object.keys(specsObject).length ? specsObject : undefined,
    'listingpilot_specs.key_features':
      listing.success ? normalizedList(listing.data.keyFeatures) : undefined,
    'listingpilot_specs.model_number':
      analysis.success ? cleanText(analysis.data.activeProduct.model) : undefined,
    'listingpilot_specs.capacity': row('capacity'),
    'listingpilot_specs.technology': normalizedList(row('technology')),
    'listingpilot_specs.control': normalizedList(row('control')),
    'listingpilot_specs.finish': row('finish'),
    'listingpilot_specs.version': row('version'),
    'listingpilot_truth.verification_status':
      analysis.success ? verificationStatus : undefined,
    'listingpilot_truth.confidence_score':
      analysis.success
        ? String(analysis.data.activeProduct.catalogHealth.score)
        : undefined,
    'listingpilot_truth.source_count':
      analysis.success ? String(analysis.data.activeProduct.sources.length) : undefined,
    'listingpilot_truth.verified_field_count':
      analysis.success ? String(verified) : undefined,
    'listingpilot_truth.conflict_count':
      analysis.success ? String(conflicts) : undefined,
    'listingpilot_content.seo_title':
      seo.success ? cleanText(seo.data.seoTitle) : undefined,
    'listingpilot_content.seo_description':
      seo.success ? cleanText(seo.data.seoDescription) : undefined,
    'listingpilot_content.feature_summary':
      listing.success ? cleanText(listing.data.keyFeatures) : undefined,
    'listingpilot_content.generated_tags':
      seo.success ? normalizedList(seo.data.tags) : undefined,
    'listingpilot_system.schema_version': SHOPIFY_METAFIELD_CATALOG_VERSION,
    'listingpilot_system.project_reference':
      opaqueProjectReference(project.projectId),
    'listingpilot_system.analysis_hash':
      analysisSafeValue
        ? metafieldValueHash(deterministicJson(analysisSafeValue))
        : undefined,
    'listingpilot_system.published_at':
      project.lastPublishedAt?.toISOString(),
    'listingpilot_system.generator_version': 'listingpilot-ai/1',
  };

  return SHOPIFY_METAFIELD_CATALOG.flatMap((definition) => {
    const raw = values[definition.catalogId];
    if (raw === undefined || raw === null || raw === '') return [];
    const value = normalizeMetafieldValue(definition, raw);
    return [{
      catalogId: definition.catalogId,
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type,
      value,
      valueHash: metafieldValueHash(value),
    }];
  });
}
