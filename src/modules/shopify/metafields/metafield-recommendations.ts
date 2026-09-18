import { projectAnalysisDataSchema } from '../../projects/validators/project.ts';

export type CatalogCategory = 'TELEVISION' | 'HAIR_DRYER' | 'VACUUM' | 'AIR_PURIFIER' | 'GENERIC';

export interface RecommendationRule {
  catalogId: string;
  label: string;
  aliases: readonly string[];
}

const rule = (key: string, label: string, aliases: readonly string[]): RecommendationRule => ({
  catalogId: `listingpilot_specs.${key}`,
  label,
  aliases,
});

const profiles: Record<Exclude<CatalogCategory, 'GENERIC'>, readonly RecommendationRule[]> = {
  TELEVISION: [
    rule('screen_size', 'Screen size', ['screen size', 'size']),
    rule('display_type', 'Display type', ['display type', 'panel', 'panel type']),
    rule('resolution', 'Resolution', ['resolution']),
    rule('refresh_rate', 'Refresh rate', ['refresh rate']),
    rule('hdr_support', 'HDR support', ['hdr', 'hdr support']),
    rule('smart_platform', 'Smart platform', ['smart platform', 'operating system']),
    rule('connectivity', 'Connectivity', ['connectivity', 'ports', 'wireless connectivity']),
  ],
  HAIR_DRYER: [
    rule('motor_power', 'Motor power', ['motor power', 'power', 'wattage']),
    rule('heat_settings', 'Heat settings', ['heat settings', 'temperature settings']),
    rule('speed_settings', 'Speed settings', ['speed settings', 'speeds']),
    rule('attachments', 'Attachments', ['attachments', 'included attachments']),
    rule('ionic_technology', 'Ionic technology', ['ionic technology', 'ion technology']),
    rule('cable_length', 'Cable length', ['cable length', 'cord length']),
    rule('weight', 'Weight', ['weight', 'product weight']),
  ],
  VACUUM: [
    rule('battery_runtime', 'Battery runtime', ['battery runtime', 'runtime', 'run time']),
    rule('suction_power', 'Suction power', ['suction power']),
    rule('bin_capacity', 'Bin capacity', ['bin capacity', 'dust bin capacity']),
    rule('filtration', 'Filtration', ['filtration', 'filter type']),
    rule('weight', 'Weight', ['weight', 'product weight']),
    rule('accessories', 'Accessories', ['accessories', 'included accessories']),
    rule('floor_compatibility', 'Floor compatibility', ['floor compatibility', 'floor types']),
  ],
  AIR_PURIFIER: [
    rule('coverage_area', 'Coverage area', ['coverage area', 'room coverage']),
    rule('cadr', 'CADR', ['cadr', 'clean air delivery rate']),
    rule('filtration', 'Filtration', ['filtration', 'filter type']),
    rule('noise_level', 'Noise level', ['noise level', 'sound level']),
    rule('power_consumption', 'Power consumption', ['power consumption', 'power', 'wattage']),
    rule('dimensions', 'Dimensions', ['dimensions', 'product dimensions']),
    rule('filter_life', 'Filter life', ['filter life', 'filter lifespan']),
  ],
};

const normalize = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim();

export function classifyCatalogCategory(productType: string | null | undefined, analysisData: unknown): CatalogCategory {
  const parsed = projectAnalysisDataSchema.safeParse(analysisData);
  const identity = normalize([
    productType ?? '',
    ...(parsed.success ? parsed.data.truthRows.filter(({ field }) => normalize(field) === 'product type').map(({ value }) => value) : []),
  ].join(' '));
  if (/\b(tv|television|display|monitor)\b/.test(identity)) return 'TELEVISION';
  if (/\b(hair dryer|hairdryer|blow dryer)\b/.test(identity)) return 'HAIR_DRYER';
  if (/\b(vacuum|floor cleaner)\b/.test(identity)) return 'VACUUM';
  if (/\b(air purifier|air treatment|purifier)\b/.test(identity)) return 'AIR_PURIFIER';
  return 'GENERIC';
}

export function recommendationsForCategory(category: CatalogCategory): readonly RecommendationRule[] {
  return category === 'GENERIC' ? [] : profiles[category];
}

export function verifiedRecommendationValues(productType: string | null | undefined, analysisData: unknown) {
  const parsed = projectAnalysisDataSchema.safeParse(analysisData);
  const category = classifyCatalogCategory(productType, analysisData);
  if (!parsed.success) return { category, values: new Map<string, string>() };
  const verified = parsed.data.truthRows.filter(({ status, value }) => status === 'Verified' && value.trim());
  const values = new Map<string, string>();
  for (const rule of recommendationsForCategory(category)) {
    const row = verified.find(({ field }) => rule.aliases.includes(normalize(field)));
    if (row) values.set(rule.catalogId, row.value.trim());
  }
  return { category, values };
}

export const nativeShopifyLabels = new Set([
  'title', 'vendor', 'brand', 'product type', 'tags', 'seo title', 'seo description',
  'price', 'sku', 'barcode', 'images', 'collections', 'collection',
]);

export const normalizeFactLabel = normalize;
