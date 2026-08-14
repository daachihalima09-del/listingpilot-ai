import { immutableCopy } from '../../../intelligence/domain/immutability.ts';
import type {
  ConflictGuidanceRule,
  ProductFieldImportance,
  ProductIntelligencePack,
  ProductRequirementLevel,
  ProductTruthFieldDefinition,
  ProductVariantSensitivity,
} from '../../domain/contracts.ts';

export const TELEVISION_PACK_VERSION = '1.0.0';
export const TELEVISION_PACK_ID = 'television';
export const TELEVISION_CATEGORY_ID = 'TELEVISION';

const sources = [
  'OFFICIAL_MANUFACTURER_PRODUCT',
  'OFFICIAL_MANUFACTURER_SPECIFICATION',
  'OFFICIAL_PRODUCT_MANUAL',
  'OFFICIAL_PRODUCT_DATASHEET',
  'AUTHORIZED_DISTRIBUTOR',
  'TRUSTED_MAJOR_RETAILER',
  'MARKETPLACE_SELLER',
  'MERCHANT_ENTERED_CONTENT',
] as const;

function field(
  fieldId: string,
  displayName: string,
  requirementLevel: ProductRequirementLevel,
  importance: ProductFieldImportance,
  aliases: readonly string[],
  options: {
    readonly dataType?: ProductTruthFieldDefinition['dataType'];
    readonly unit?: string;
    readonly formats?: readonly string[];
    readonly hints?: readonly string[];
    readonly verification?: ProductTruthFieldDefinition['verificationPolicy'];
    readonly conflictSeverity?: ProductTruthFieldDefinition['conflictSeverity'];
    readonly variantSensitivity?: ProductVariantSensitivity;
    readonly regionalSensitivity?: boolean;
  } = {},
): ProductTruthFieldDefinition {
  return {
    fieldId,
    canonicalName: fieldId,
    displayName,
    dataType: options.dataType ?? 'STRING',
    requirementLevel,
    importance,
    aliases,
    ...(options.unit ? { unit: options.unit } : {}),
    allowedFormats: options.formats ?? [],
    normalizationHints: options.hints ?? [],
    verificationPolicy: options.verification ?? 'STANDARD',
    sourcePriority: sources,
    conflictSeverity: options.conflictSeverity ?? (importance === 'CRITICAL' ? 'CRITICAL' : importance === 'IMPORTANT' ? 'HIGH' : 'MEDIUM'),
    description: `Canonical Television Product Truth field for ${displayName.toLocaleLowerCase('en-US')}.`,
    variantSensitivity: options.variantSensitivity ?? 'MODEL_DEPENDENT',
    regionalSensitivity: options.regionalSensitivity ?? false,
  };
}

export const televisionTruthFields = [
  field('brand', 'Brand', 'IDENTITY_REQUIRED', 'CRITICAL', ['manufacturer brand'], { verification: 'EXPLICIT_EVIDENCE' }),
  field('vendor', 'Vendor', 'OPTIONAL', 'SUPPORTING', ['shopify vendor'], { variantSensitivity: 'GLOBAL' }),
  field('model', 'Model', 'IDENTITY_REQUIRED', 'CRITICAL', ['model number'], { verification: 'EXPLICIT_EVIDENCE', regionalSensitivity: true }),
  field('model_suffix', 'Model suffix', 'CONDITIONAL', 'CRITICAL', ['regional model suffix'], { verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('product_type', 'Product type', 'IDENTITY_REQUIRED', 'CRITICAL', ['television type'], { variantSensitivity: 'GLOBAL' }),
  field('screen_size', 'Screen size', 'IDENTITY_REQUIRED', 'CRITICAL', ['display size', 'diagonal size', 'screen diagonal', 'display diagonal', 'inch size'], { dataType: 'DECIMAL', unit: 'in', formats: ['NUMBER_INCHES'], hints: ['EXPLICIT_MARKETED_INCH_VALUE_ONLY', 'DO_NOT_VERIFY_APPROXIMATE_CM'], verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('resolution', 'Resolution', 'CATEGORY_REQUIRED', 'CRITICAL', ['native resolution', 'panel resolution'], { dataType: 'ENUM', formats: ['HD', 'FULL_HD', '4K_UHD', '8K_UHD'], hints: ['UPSCALING_IS_NOT_NATIVE_RESOLUTION'], verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('pixel_dimensions', 'Pixel dimensions', 'CONDITIONAL', 'IMPORTANT', ['native pixel dimensions'], { formats: ['WIDTH_X_HEIGHT'], verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('upscaling_capability', 'Upscaling capability', 'OPTIONAL', 'SUPPORTING', ['upscaling', 'ai upscaling'], { verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('display_technology', 'Display technology', 'CATEGORY_REQUIRED', 'CRITICAL', ['panel technology', 'display type', 'panel type', 'screen technology', 'panel'], { dataType: 'ENUM', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('backlight_technology', 'Backlight technology', 'CONDITIONAL', 'IMPORTANT', ['lcd backlight'], { verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('smart_platform', 'Smart platform', 'CATEGORY_REQUIRED', 'IMPORTANT', ['tv operating system'], { dataType: 'ENUM', verification: 'STRONG_EVIDENCE', variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('refresh_rate', 'Native refresh rate', 'RECOMMENDED', 'CRITICAL', ['panel refresh rate', 'refresh frequency', 'panel frequency', 'native hz'], { dataType: 'DECIMAL', unit: 'Hz', hints: ['NATIVE_OR_PANEL_RATE_ONLY'], verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('marketing_motion_metric', 'Marketing motion metric', 'CONDITIONAL', 'SUPPORTING', ['motion enhancement rate'], { hints: ['NEVER_NORMALIZE_AS_NATIVE_REFRESH_RATE'], variantSensitivity: 'SIZE_DEPENDENT' }),
  field('vrr_maximum', 'VRR maximum', 'CONDITIONAL', 'IMPORTANT', ['maximum variable refresh rate'], { dataType: 'DECIMAL', unit: 'Hz', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('input_signal_maximum', 'Input signal maximum', 'CONDITIONAL', 'SUPPORTING', ['maximum input rate'], { dataType: 'DECIMAL', unit: 'Hz', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('hdr_formats', 'HDR formats', 'RECOMMENDED', 'CRITICAL', ['supported hdr formats'], { dataType: 'LIST', hints: ['NORMALIZE_VERIFIED_FORMATS_AS_SET'], verification: 'STRONG_EVIDENCE', variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('dolby_vision_support', 'Dolby Vision support', 'CONDITIONAL', 'IMPORTANT', ['dolby vision compatibility'], { dataType: 'BOOLEAN', verification: 'STRONG_EVIDENCE', regionalSensitivity: true }),
  field('processor', 'Picture processor', 'RECOMMENDED', 'CRITICAL', ['picture engine'], { verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('hdmi_port_count', 'HDMI port count', 'RECOMMENDED', 'IMPORTANT', ['number of hdmi ports'], { dataType: 'INTEGER', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('hdmi_ports', 'HDMI ports', 'CONDITIONAL', 'IMPORTANT', ['hdmi port details'], { dataType: 'LIST', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('hdmi_version', 'HDMI version', 'RECOMMENDED', 'IMPORTANT', ['hdmi specification'], { verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('gaming_features', 'Gaming features', 'RECOMMENDED', 'IMPORTANT', ['game capabilities'], { dataType: 'LIST', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('vrr', 'Variable refresh rate', 'CONDITIONAL', 'IMPORTANT', ['variable refresh support'], { dataType: 'BOOLEAN', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('allm', 'Auto low latency mode', 'CONDITIONAL', 'IMPORTANT', ['auto low latency'], { dataType: 'BOOLEAN', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('earc', 'Enhanced audio return channel', 'CONDITIONAL', 'IMPORTANT', ['enhanced arc'], { dataType: 'BOOLEAN', verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('peak_brightness', 'Peak brightness', 'OPTIONAL', 'IMPORTANT', ['maximum brightness'], { dataType: 'DECIMAL', unit: 'nits', verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('local_dimming', 'Local dimming', 'OPTIONAL', 'IMPORTANT', ['dimming zones'], { verification: 'STRONG_EVIDENCE', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('audio_technologies', 'Audio technologies', 'RECOMMENDED', 'IMPORTANT', ['sound technologies'], { dataType: 'LIST', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('speaker_configuration', 'Speaker configuration', 'OPTIONAL', 'SUPPORTING', ['speaker layout'], { variantSensitivity: 'SIZE_DEPENDENT' }),
  field('audio_power', 'Audio power', 'OPTIONAL', 'SUPPORTING', ['speaker output'], { dataType: 'DECIMAL', unit: 'W', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('wireless_connectivity', 'Wireless connectivity', 'RECOMMENDED', 'IMPORTANT', ['wireless connections'], { dataType: 'LIST', regionalSensitivity: true }),
  field('wifi_standard', 'Wi-Fi standard', 'OPTIONAL', 'SUPPORTING', ['wireless lan standard'], { regionalSensitivity: true }),
  field('bluetooth_version', 'Bluetooth version', 'OPTIONAL', 'SUPPORTING', ['bluetooth specification'], { regionalSensitivity: true }),
  field('tuner_type', 'Tuner type', 'OPTIONAL', 'SUPPORTING', ['broadcast tuner'], { variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('year_or_series', 'Year or series', 'RECOMMENDED', 'IMPORTANT', ['model year'], { verification: 'STRONG_EVIDENCE', regionalSensitivity: true }),
  field('regional_variant', 'Regional variant', 'CONDITIONAL', 'CRITICAL', ['target region'], { verification: 'EXPLICIT_EVIDENCE', variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('market', 'Target market', 'CONDITIONAL', 'IMPORTANT', ['sales market'], { variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('dimensions', 'Dimensions', 'OPTIONAL', 'SUPPORTING', ['product measurements'], { dataType: 'OBJECT', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('weight', 'Weight', 'OPTIONAL', 'SUPPORTING', ['product weight'], { dataType: 'DECIMAL', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('vesa_mount', 'VESA mount', 'OPTIONAL', 'SUPPORTING', ['vesa pattern'], { variantSensitivity: 'SIZE_DEPENDENT' }),
  field('stand_type', 'Stand type', 'OPTIONAL', 'SUPPORTING', ['stand design'], { variantSensitivity: 'SIZE_DEPENDENT', regionalSensitivity: true }),
  field('remote_type', 'Remote type', 'OPTIONAL', 'SUPPORTING', ['included remote'], { variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('voice_assistants', 'Voice assistants', 'OPTIONAL', 'SUPPORTING', ['voice assistant support'], { dataType: 'LIST', regionalSensitivity: true }),
  field('design_features', 'Design features', 'OPTIONAL', 'SUPPORTING', ['physical design'], { dataType: 'LIST', variantSensitivity: 'SIZE_DEPENDENT' }),
  field('energy_rating', 'Energy rating', 'OPTIONAL', 'SUPPORTING', ['energy efficiency rating'], { variantSensitivity: 'REGION_DEPENDENT', regionalSensitivity: true }),
  field('ambient_mode', 'Ambient mode', 'OPTIONAL', 'OPTIONAL', ['ambient display mode']),
  field('art_mode', 'Art mode', 'OPTIONAL', 'OPTIONAL', ['art display mode']),
  field('gallery_features', 'Gallery features', 'OPTIONAL', 'OPTIONAL', ['gallery display features'], { dataType: 'LIST' }),
  field('camera_support', 'Camera support', 'OPTIONAL', 'OPTIONAL', ['webcam support'], { dataType: 'BOOLEAN', regionalSensitivity: true }),
  field('brand_specific_lifestyle_features', 'Brand-specific lifestyle features', 'OPTIONAL', 'OPTIONAL', ['lifestyle feature set'], { dataType: 'LIST' }),
] as const satisfies readonly ProductTruthFieldDefinition[];

const criticalConflictFields = ['brand', 'model', 'model_suffix', 'screen_size', 'resolution', 'display_technology', 'refresh_rate', 'processor', 'regional_variant', 'year_or_series'] as const;
const highConflictFields = ['hdr_formats', 'hdmi_version', 'hdmi_port_count', 'smart_platform', 'vrr', 'allm', 'earc', 'peak_brightness', 'local_dimming'] as const;
const mediumConflictFields = ['audio_power', 'speaker_configuration', 'voice_assistants', 'wifi_standard', 'bluetooth_version', 'remote_type', 'design_features'] as const;

function guidance(fieldId: string, priority: ConflictGuidanceRule['priority']): ConflictGuidanceRule {
  return {
    fieldId,
    priority,
    reason: `${fieldId} conflicts can change product identity or buyer-visible technical meaning.`,
    requiresManualReview: priority === 'CRITICAL' || priority === 'HIGH',
    autoResolutionAllowed: priority !== 'CRITICAL',
  };
}

export const televisionIntelligencePack = immutableCopy({
  identity: {
    id: TELEVISION_PACK_ID,
    version: TELEVISION_PACK_VERSION,
    categoryId: TELEVISION_CATEGORY_ID,
    displayName: 'Televisions',
    description: 'Deterministic product-domain knowledge for consumer televisions.',
    aliases: ['tv', 'television', 'smart television'],
    supportedProductTypes: ['Television', 'Smart TV', 'OLED TV', 'QLED TV', 'LED TV', 'Mini LED TV', '4K Television', '8K Television'],
    supportedCategoryTerms: ['consumer television', 'televisions', 'smart tv'],
    supportedBrands: ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense'],
    status: 'ACTIVE',
  },
  category: {
    id: TELEVISION_CATEGORY_ID,
    displayName: 'Televisions',
    aliases: ['consumer tv', 'smart television set'],
    parentCategoryId: 'VIDEO_ELECTRONICS',
    vertical: 'ELECTRONICS',
  },
  detection: {
    minimumMatchScore: 60,
    mediumConfidenceScore: 80,
    highConfidenceScore: 120,
    ambiguityMargin: 15,
    negativeBlockScore: 180,
    rules: [
      { id: 'television.detect.normalized-category', version: TELEVISION_PACK_VERSION, sources: ['normalizedCategory', 'shopifyTaxonomyCategory'], match: 'EXACT', terms: ['TELEVISION', 'TV', 'Televisions'], weight: 150, polarity: 'POSITIVE', decisive: true },
      { id: 'television.detect.product-type', version: TELEVISION_PACK_VERSION, sources: ['productType'], match: 'EXACT', terms: ['Television', 'Smart TV', 'OLED TV', 'QLED TV', 'LED TV', 'Mini LED TV', '4K Television', '8K Television'], weight: 130, polarity: 'POSITIVE', decisive: true },
      { id: 'television.detect.category-term', version: TELEVISION_PACK_VERSION, sources: ['category'], match: 'PHRASE', terms: ['consumer television', 'television', 'televisions', 'smart tv'], weight: 100, polarity: 'POSITIVE', decisive: true },
      { id: 'television.detect.title-identity', version: TELEVISION_PACK_VERSION, sources: ['title'], match: 'PHRASE', terms: ['smart tv', 'smart television', 'oled tv', 'qled tv', 'neo qled tv', 'mini led tv', 'qned tv', 'uhd tv', '4k tv', '8k tv', 'google tv', 'roku tv', 'fire tv', 'vidaa tv', 'lifestyle tv', 'gaming tv', 'television', 'tvs', 'tv'], weight: 70, polarity: 'POSITIVE', decisive: true },
      { id: 'television.detect.description-support', version: TELEVISION_PACK_VERSION, sources: ['description', 'tag', 'collection'], match: 'PHRASE', terms: ['consumer television', 'smart television', 'smart tv'], weight: 20, polarity: 'POSITIVE', decisive: false },
      { id: 'television.detect.brand-support', version: TELEVISION_PACK_VERSION, sources: ['brand'], match: 'EXACT', terms: ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense'], weight: 5, polarity: 'POSITIVE', decisive: false },
      { id: 'television.detect.accessory-block', version: TELEVISION_PACK_VERSION, sources: ['title', 'productType', 'category'], match: 'PHRASE', terms: ['tv stand', 'television stand', 'tv mount', 'wall mount', 'tv bracket', 'television bracket', 'tv remote', 'remote control', 'replacement remote', 'tv cabinet', 'tv console', 'media console', 'tv antenna', 'screen protector', 'replacement screen', 'replacement panel', 'power board', 'main board', 'motherboard', 'replacement part', 'soundbar', 'speaker system', 'streaming device', 'streaming box', 'tv box', 'android tv box', 'hdmi cable', 'coaxial cable', 'camera mount', 'tv cover', 'tv trolley', 'tv cart', 'tv accessory', 'universal mount'], weight: 240, polarity: 'NEGATIVE', decisive: false, negativeOutcome: 'BLOCK' },
      { id: 'television.detect.hybrid-ambiguity', version: TELEVISION_PACK_VERSION, sources: ['title', 'productType', 'category'], match: 'PHRASE', terms: ['smart display', 'tv monitor', 'monitor with tv tuner', 'commercial signage', 'interactive display', 'hotel display', 'digital signage'], weight: 90, polarity: 'NEGATIVE', decisive: false, negativeOutcome: 'AMBIGUATE' },
    ],
  },
  truthFields: televisionTruthFields,
  validationRules: [
    { ruleId: 'television.display.oled-backlight-conflict', version: TELEVISION_PACK_VERSION, description: 'OLED display claims conflict with conventional LCD backlight claims.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['display_technology', 'backlight_technology'], evaluationType: 'FIELDS_CONFLICT', parameters: { leftFieldId: 'display_technology', leftValues: ['OLED', 'OLED evo', 'QD-OLED', 'WOLED', 'MLA OLED'], rightFieldId: 'backlight_technology', rightValues: ['Direct LED', 'Edge LED', 'Full Array LED', 'Mini LED backlight'] }, message: 'OLED display technology conflicts with a conventional LCD backlight assertion.', recommendation: 'Verify the exact panel and backlight specification for this model and size.' },
    { ruleId: 'television.resolution.4k-pixel-conflict', version: TELEVISION_PACK_VERSION, description: '4K labels conflict with verified 8K pixel dimensions.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['resolution', 'pixel_dimensions'], evaluationType: 'FIELDS_CONFLICT', parameters: { leftFieldId: 'resolution', leftValues: ['4K UHD', '4K_UHD'], rightFieldId: 'pixel_dimensions', rightValues: ['7680 x 4320', '7680×4320'] }, message: 'The normalized resolution conflicts with verified pixel dimensions.', recommendation: 'Verify the native panel resolution; do not use upscaling capability as native resolution.' },
    { ruleId: 'television.resolution.8k-pixel-conflict', version: TELEVISION_PACK_VERSION, description: '8K labels conflict with verified 4K pixel dimensions.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['resolution', 'pixel_dimensions'], evaluationType: 'FIELDS_CONFLICT', parameters: { leftFieldId: 'resolution', leftValues: ['8K UHD', '8K_UHD'], rightFieldId: 'pixel_dimensions', rightValues: ['3840 x 2160', '3840×2160'] }, message: 'The normalized 8K resolution conflicts with verified 4K pixel dimensions.', recommendation: 'Verify the native panel resolution for the exact model.' },
    { ruleId: 'television.resolution.8k-identity-conflict', version: TELEVISION_PACK_VERSION, description: 'Verified 8K resolution conflicts with a listing identity that describes the product as 4K.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['resolution'], evaluationType: 'FIELD_TEXT_CONFLICT', parameters: { fieldId: 'resolution', fieldValues: ['8K UHD', '8K_UHD'], textTerms: ['4K TV', '4K Television'], ignoreTextTerms: ['4K input support', '4K signal support'] }, message: 'The listing identity describes a verified 8K television as 4K.', recommendation: 'Correct the listing identity after verifying native resolution for the exact model.' },
    { ruleId: 'television.resolution.upscaling-derivation', version: TELEVISION_PACK_VERSION, description: 'Upscaling capability must not become native panel resolution.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['resolution', 'upscaling_capability'], evaluationType: 'PROHIBITED_DERIVATION', parameters: { targetFieldId: 'resolution', sourceFieldIds: ['upscaling_capability'] }, message: 'Native resolution was derived from an upscaling capability.', recommendation: 'Use explicit native panel resolution or verified pixel dimensions.' },
    { ruleId: 'television.refresh.marketing-derivation', version: TELEVISION_PACK_VERSION, description: 'Marketing motion metrics must not become native refresh rate.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['refresh_rate', 'marketing_motion_metric'], evaluationType: 'PROHIBITED_DERIVATION', parameters: { targetFieldId: 'refresh_rate', sourceFieldIds: ['marketing_motion_metric'] }, message: 'Native refresh rate was derived from a marketing motion metric.', recommendation: 'Use explicit native or panel refresh-rate evidence.' },
    { ruleId: 'television.hdr.dolby-vision-conflict', version: TELEVISION_PACK_VERSION, description: 'Explicit Dolby Vision support and non-support claims conflict.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['dolby_vision_support'], evaluationType: 'FIELD_VALUE_CONFLICT', parameters: { fieldId: 'dolby_vision_support' }, message: 'Dolby Vision support has conflicting verified values.', recommendation: 'Review exact regional-model evidence without inferring support or absence.' },
    { ruleId: 'television.hdmi.count-mismatch', version: TELEVISION_PACK_VERSION, description: 'Structured HDMI count must match represented HDMI ports.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['hdmi_port_count', 'hdmi_ports'], evaluationType: 'COUNT_MISMATCH', parameters: { countFieldId: 'hdmi_port_count', listFieldId: 'hdmi_ports' }, message: 'The HDMI port count does not match the represented port data.', recommendation: 'Verify the total and per-port capabilities independently.' },
    { ruleId: 'television.hdmi.unsupported-gaming-derivation', version: TELEVISION_PACK_VERSION, description: 'HDMI version alone cannot establish gaming capabilities.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['hdmi_version', 'gaming_features'], evaluationType: 'PROHIBITED_DERIVATION', parameters: { targetFieldId: 'gaming_features', sourceFieldIds: ['hdmi_version'] }, message: 'Gaming capabilities were derived from HDMI version alone.', recommendation: 'Verify VRR, ALLM, eARC, bandwidth, and signal support independently.' },
    { ruleId: 'television.platform.conflict', version: TELEVISION_PACK_VERSION, description: 'Multiple smart platforms conflict for one exact regional model.', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['smart_platform'], evaluationType: 'FIELD_VALUE_CONFLICT', parameters: { fieldId: 'smart_platform' }, message: 'The exact regional model has conflicting smart-platform values.', recommendation: 'Check whether the evidence refers to different regional variants.' },
    { ruleId: 'television.model.conflict', version: TELEVISION_PACK_VERSION, description: 'Materially different model numbers must remain separate.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['model'], evaluationType: 'FIELD_VALUE_CONFLICT', parameters: { fieldId: 'model' }, message: 'The product has conflicting model identities.', recommendation: 'Retain full model punctuation and resolve the exact product identity manually.' },
    { ruleId: 'television.model-suffix.conflict', version: TELEVISION_PACK_VERSION, description: 'Regional model suffixes are identity-sensitive.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['model_suffix'], evaluationType: 'FIELD_VALUE_CONFLICT', parameters: { fieldId: 'model_suffix' }, message: 'The product has conflicting regional model suffixes.', recommendation: 'Keep regional variants separate until authoritative evidence resolves identity.' },
    { ruleId: 'television.screen-size.conflict', version: TELEVISION_PACK_VERSION, description: 'Different marketed screen sizes are distinct variants.', severity: 'CRITICAL', applicability: 'MATCHED_CATEGORY', requiredInputs: ['screen_size'], evaluationType: 'FIELD_VALUE_CONFLICT', parameters: { fieldId: 'screen_size' }, message: 'The product has conflicting marketed screen sizes.', recommendation: 'Verify screen size for the exact size variant without propagating sibling specifications.' },
  ],
  conflictGuidance: [
    ...criticalConflictFields.map((fieldId) => guidance(fieldId, 'CRITICAL')),
    ...highConflictFields.map((fieldId) => guidance(fieldId, 'HIGH')),
    ...mediumConflictFields.map((fieldId) => guidance(fieldId, 'MEDIUM')),
  ],
  featurePriorities: [
    { id: 'display', displayName: 'Display technology', priority: 1, importance: 'CRITICAL', fieldIds: ['display_technology', 'backlight_technology'], applicability: 'ALL' },
    { id: 'size-resolution', displayName: 'Screen size and resolution', priority: 2, importance: 'CRITICAL', fieldIds: ['screen_size', 'resolution'], applicability: 'ALL' },
    { id: 'processor', displayName: 'Picture processor', priority: 3, importance: 'CRITICAL', fieldIds: ['processor'], applicability: 'WHEN_VERIFIED' },
    { id: 'hdr', displayName: 'HDR capability', priority: 4, importance: 'CRITICAL', fieldIds: ['hdr_formats'], applicability: 'WHEN_VERIFIED' },
    { id: 'gaming', displayName: 'Refresh rate and gaming', priority: 5, importance: 'IMPORTANT', fieldIds: ['refresh_rate', 'vrr', 'allm', 'gaming_features'], applicability: 'WHEN_SUPPORTED' },
    { id: 'platform', displayName: 'Smart platform', priority: 6, importance: 'IMPORTANT', fieldIds: ['smart_platform'], applicability: 'ALL' },
    { id: 'audio', displayName: 'Audio', priority: 7, importance: 'IMPORTANT', fieldIds: ['audio_technologies', 'speaker_configuration', 'audio_power'], applicability: 'WHEN_VERIFIED' },
    { id: 'connectivity', displayName: 'Connectivity', priority: 8, importance: 'IMPORTANT', fieldIds: ['hdmi_port_count', 'hdmi_version', 'wireless_connectivity'], applicability: 'WHEN_VERIFIED' },
    { id: 'design', displayName: 'Design', priority: 9, importance: 'SUPPORTING', fieldIds: ['design_features', 'stand_type', 'vesa_mount'], applicability: 'WHEN_RELEVANT' },
    { id: 'lifestyle', displayName: 'Convenience and lifestyle', priority: 10, importance: 'OPTIONAL', fieldIds: ['voice_assistants', 'ambient_mode', 'art_mode', 'camera_support'], applicability: 'WHEN_SUPPORTED' },
  ],
  comparisonDimensions: [
    { id: 'display', displayName: 'Display', priority: 1, fieldIds: ['display_technology', 'backlight_technology', 'screen_size'], applicability: 'ALL' },
    { id: 'resolution', displayName: 'Resolution', priority: 2, fieldIds: ['resolution', 'pixel_dimensions'], applicability: 'ALL' },
    { id: 'brightness-contrast', displayName: 'Brightness and contrast', priority: 3, fieldIds: ['peak_brightness', 'local_dimming'], applicability: 'WHEN_VERIFIED' },
    { id: 'hdr', displayName: 'HDR', priority: 4, fieldIds: ['hdr_formats', 'dolby_vision_support'], applicability: 'WHEN_SUPPORTED' },
    { id: 'processor', displayName: 'Processor', priority: 5, fieldIds: ['processor'], applicability: 'WHEN_VERIFIED' },
    { id: 'refresh-rate', displayName: 'Refresh rate', priority: 6, fieldIds: ['refresh_rate', 'vrr_maximum'], applicability: 'WHEN_VERIFIED' },
    { id: 'gaming', displayName: 'Gaming', priority: 7, fieldIds: ['refresh_rate', 'vrr', 'allm', 'hdmi_version', 'gaming_features'], applicability: 'WHEN_SUPPORTED' },
    { id: 'smart-platform', displayName: 'Smart platform', priority: 8, fieldIds: ['smart_platform', 'voice_assistants'], applicability: 'ALL' },
    { id: 'audio', displayName: 'Audio', priority: 9, fieldIds: ['audio_technologies', 'speaker_configuration', 'audio_power'], applicability: 'WHEN_VERIFIED' },
    { id: 'connectivity', displayName: 'Connectivity', priority: 10, fieldIds: ['hdmi_port_count', 'hdmi_version', 'wireless_connectivity', 'wifi_standard', 'bluetooth_version'], applicability: 'WHEN_VERIFIED' },
    { id: 'design', displayName: 'Design', priority: 11, fieldIds: ['dimensions', 'weight', 'stand_type', 'vesa_mount'], applicability: 'WHEN_RELEVANT' },
    { id: 'energy', displayName: 'Energy', priority: 12, fieldIds: ['energy_rating'], applicability: 'WHEN_AVAILABLE' },
  ],
  seoPriorities: {
    identityFieldOrder: ['brand', 'screen_size', 'display_technology', 'product_type', 'model', 'resolution'],
    maximumDifferentiators: 1,
    guidance: ['Prioritize exact model intent.', 'Use only verified differentiators.', 'Do not turn category priorities into final metadata.', 'Preserve model suffix when required for exact identity.'],
    vendorIsBrand: false,
  },
  metafieldMappings: [
    { truthFieldId: 'screen_size', namespace: 'listingpilot_specs', key: 'screen_size', type: 'number_decimal', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'EXPLICIT_INCH_VALUE' },
    { truthFieldId: 'resolution', namespace: 'listingpilot_specs', key: 'resolution', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'CANONICAL_ENUM' },
    { truthFieldId: 'display_technology', namespace: 'listingpilot_specs', key: 'display_technology', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'CANONICAL_ENUM' },
    { truthFieldId: 'refresh_rate', namespace: 'listingpilot_specs', key: 'native_refresh_rate', type: 'number_decimal', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_NATIVE_HZ' },
    { truthFieldId: 'hdr_formats', namespace: 'listingpilot_specs', key: 'hdr_formats', type: 'list.single_line_text_field', cardinality: 'MANY', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_SET' },
    { truthFieldId: 'processor', namespace: 'listingpilot_specs', key: 'picture_processor', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'PRESERVE_MODEL_NAME' },
    { truthFieldId: 'gaming_features', namespace: 'listingpilot_specs', key: 'gaming_features', type: 'list.single_line_text_field', cardinality: 'MANY', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_SET' },
    { truthFieldId: 'smart_platform', namespace: 'listingpilot_specs', key: 'smart_platform', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'CANONICAL_ENUM' },
    { truthFieldId: 'hdmi_port_count', namespace: 'listingpilot_specs', key: 'hdmi_port_count', type: 'number_integer', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_INTEGER' },
    { truthFieldId: 'hdmi_version', namespace: 'listingpilot_specs', key: 'hdmi_version', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'PRESERVE_VERSION' },
    { truthFieldId: 'audio_technologies', namespace: 'listingpilot_specs', key: 'audio_technologies', type: 'list.single_line_text_field', cardinality: 'MANY', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_SET' },
    { truthFieldId: 'wireless_connectivity', namespace: 'listingpilot_specs', key: 'wireless_connectivity', type: 'list.single_line_text_field', cardinality: 'MANY', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_SET' },
    { truthFieldId: 'model', namespace: 'listingpilot_specs', key: 'model_number', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'PRESERVE_IDENTITY' },
    { truthFieldId: 'year_or_series', namespace: 'listingpilot_specs', key: 'year_or_series', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_VALUE' },
  ],
  safetyGuidance: {
    neverInventFields: ['brand', 'model', 'model_suffix', 'screen_size', 'resolution', 'display_technology', 'refresh_rate', 'processor', 'hdr_formats', 'hdmi_version', 'hdmi_port_count', 'peak_brightness', 'vrr', 'allm', 'year_or_series', 'regional_variant'],
    neverInferRules: [
      { id: 'television.safety.motion-is-not-native', description: 'Marketing motion metrics are not native refresh rate.', fieldIds: ['marketing_motion_metric', 'refresh_rate'] },
      { id: 'television.safety.no-cross-size-propagation', description: 'Specifications from one screen size do not establish specifications for another size.', fieldIds: ['screen_size', 'display_technology', 'refresh_rate', 'processor', 'hdmi_version', 'hdmi_port_count', 'peak_brightness'] },
      { id: 'television.safety.no-cross-region-propagation', description: 'Specifications from one regional model do not establish specifications for another region.', fieldIds: ['model', 'model_suffix', 'regional_variant', 'market', 'smart_platform', 'tuner_type'] },
      { id: 'television.safety.dolby-vision-needs-evidence', description: 'Dolby Vision support requires explicit exact-model evidence.', fieldIds: ['dolby_vision_support', 'hdr_formats'] },
      { id: 'television.safety.hdr10-plus-needs-evidence', description: 'HDR10+ support requires explicit exact-model evidence.', fieldIds: ['hdr_formats'] },
      { id: 'television.safety.hdmi-independent-capabilities', description: 'HDMI version does not establish gaming features.', fieldIds: ['hdmi_version', 'vrr', 'allm', 'earc', 'gaming_features'] },
      { id: 'television.safety.series-is-not-panel', description: 'A marketing series name does not establish panel technology.', fieldIds: ['year_or_series', 'display_technology'] },
      { id: 'television.safety.absence-is-not-negative', description: 'Missing evidence does not establish a negative support claim.', fieldIds: ['hdr_formats', 'dolby_vision_support', 'vrr', 'allm'] },
      { id: 'television.safety.disputed-is-not-verified', description: 'A disputed field must not be represented as verified.', fieldIds: ['model', 'screen_size', 'resolution', 'display_technology', 'refresh_rate', 'hdr_formats'] },
      { id: 'television.safety.upscaling-is-not-native', description: 'Upscaling capability is not native panel resolution.', fieldIds: ['resolution', 'pixel_dimensions'] },
      { id: 'television.safety.certification-is-not-brightness', description: 'Generic HDR certification does not establish peak brightness.', fieldIds: ['hdr_formats', 'peak_brightness'] },
      { id: 'television.safety.base-model-is-not-tuner', description: 'A base model name does not establish regional tuner compatibility.', fieldIds: ['model', 'model_suffix', 'tuner_type', 'regional_variant'] },
      { id: 'television.safety.vendor-is-not-brand', description: 'Vendor is not Brand without explicit merchant mapping.', fieldIds: ['vendor', 'brand'] },
      { id: 'television.safety.no-suffix-inference', description: 'Model suffixes must not be invented or inferred from a base model.', fieldIds: ['model', 'model_suffix', 'regional_variant'] },
    ],
    variantSafetyRules: [
      { id: 'television.safety.size-variant', description: 'Do not propagate size-dependent specifications across screen sizes.', fieldIds: ['screen_size', 'display_technology', 'refresh_rate', 'speaker_configuration', 'audio_power', 'hdmi_version', 'stand_type', 'local_dimming', 'peak_brightness', 'dimensions', 'weight', 'vesa_mount'] },
    ],
    regionalSafetyRules: [
      { id: 'television.safety.regional-identity', description: 'Model suffix and market are part of product identity where available.', fieldIds: ['model', 'model_suffix', 'regional_variant', 'market', 'tuner_type', 'smart_platform', 'remote_type', 'wifi_standard'] },
    ],
    evidenceRequirements: [
      { id: 'television.safety.high-risk-evidence', description: 'High-risk fields require exact-model evidence.', fieldIds: ['brand', 'model', 'model_suffix', 'screen_size', 'resolution', 'display_technology', 'refresh_rate', 'processor', 'hdmi_version', 'hdmi_port_count', 'hdr_formats', 'vrr', 'allm', 'peak_brightness', 'year_or_series', 'regional_variant'] },
    ],
    prohibitedTransformations: [
      { id: 'television.safety.no-missing-negative', description: 'Absence of evidence must not become a negative claim.', fieldIds: ['hdr_formats', 'dolby_vision_support', 'vrr', 'allm'] },
      { id: 'television.safety.no-suffix-stripping', description: 'Meaningful model suffixes must not be stripped or merged.', fieldIds: ['model', 'model_suffix', 'regional_variant'] },
    ],
    manualReviewFields: ['brand', 'model', 'model_suffix', 'screen_size', 'resolution', 'display_technology', 'refresh_rate', 'processor', 'regional_variant'],
  },
} satisfies ProductIntelligencePack) as ProductIntelligencePack;
