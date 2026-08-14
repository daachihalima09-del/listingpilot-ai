import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  normalizeTelevisionHdrFormats,
  normalizeTelevisionModel,
  normalizeTelevisionRefreshRate,
  normalizeTelevisionResolution,
  normalizeTelevisionScreenSize,
} from '../packs/television/television-normalization.ts';
import { televisionIntelligencePack } from '../packs/television/television-pack.ts';
import { defaultProductIntelligenceRegistry } from '../registry/default-registry.ts';
import { evaluateProductIntelligencePack } from '../validation/product-intelligence-validation.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const baseValues = {
  brand: 'Samsung', model: 'QN65QN90FAFXZA', product_type: 'Smart TV', screen_size: 65,
  resolution: '4K_UHD', display_technology: 'QLED', smart_platform: 'Tizen',
};
function validate(values: Readonly<Record<string, unknown>>, derivations?: Readonly<Record<string, string>>) {
  return evaluateProductIntelligencePack(televisionIntelligencePack, {
    productId: 'tv-1', identityText: 'Samsung QN90F Smart TV', values: { ...baseValues, ...values }, evidenceReferences: { resolution: ['e-resolution'], display_technology: ['e-display'] }, ...(derivations ? { derivations } : {}),
  });
}

test('Television Pack identity, version, requirements and field references are stable', () => {
  assert.equal(televisionIntelligencePack.identity.id, 'television');
  assert.equal(televisionIntelligencePack.identity.version, '1.0.0');
  assert.equal(televisionIntelligencePack.identity.categoryId, 'TELEVISION');
  assert.equal(televisionIntelligencePack.identity.status, 'ACTIVE');
  const fields = new Map(televisionIntelligencePack.truthFields.map((field) => [field.fieldId, field]));
  for (const id of ['brand', 'model', 'product_type', 'screen_size']) assert.equal(fields.get(id)?.requirementLevel, 'IDENTITY_REQUIRED');
  for (const id of ['resolution', 'display_technology', 'smart_platform']) assert.equal(fields.get(id)?.requirementLevel, 'CATEGORY_REQUIRED');
  for (const id of ['refresh_rate', 'hdr_formats', 'processor', 'hdmi_port_count']) assert.equal(fields.get(id)?.requirementLevel, 'RECOMMENDED');
  assert.equal(fields.get('model_suffix')?.regionalSensitivity, true);
  assert.equal(fields.get('refresh_rate')?.variantSensitivity, 'SIZE_DEPENDENT');
  assert.equal(new Set(fields.keys()).size, televisionIntelligencePack.truthFields.length);
  assert.equal(defaultProductIntelligenceRegistry.resolveFieldId('television', 'Panel Technology'), 'display_technology');
  assert.equal(defaultProductIntelligenceRegistry.resolveFieldId('television', 'native hz'), 'refresh_rate');
});

test('Television normalization preserves truth boundaries', () => {
  assert.equal(normalizeTelevisionScreenSize('65-inch').normalizedValue, 65);
  assert.equal(normalizeTelevisionScreenSize('65"').verifiedByFormat, true);
  assert.equal(normalizeTelevisionScreenSize('164 cm').normalizedValue, null);
  assert.equal(normalizeTelevisionResolution('3840 × 2160').normalizedValue, '4K_UHD');
  assert.equal(normalizeTelevisionResolution('7680 x 4320').normalizedValue, '8K_UHD');
  assert.equal(normalizeTelevisionResolution('8K AI upscaling').normalizedValue, null);
  assert.equal(normalizeTelevisionRefreshRate('Native 120Hz').normalizedValue, 120);
  assert.equal(normalizeTelevisionRefreshRate('Motion Rate 240').normalizedValue, null);
  assert.equal(normalizeTelevisionRefreshRate('Motion Xcelerator 144Hz').normalizedValue, null);
  assert.deepEqual(normalizeTelevisionHdrFormats('HDR10+, Dolby Vision and HLG').normalizedValue, ['DOLBY_VISION', 'HDR10_PLUS', 'HLG']);
  assert.equal(normalizeTelevisionModel(' QE65QN90FATXXU ').normalizedValue, 'QE65QN90FATXXU');
  assert.notEqual(normalizeTelevisionModel('QN65QN90FAFXZA').normalizedValue, normalizeTelevisionModel('QE65QN90FATXXU').normalizedValue);
});

test('Television validation detects explicit technical conflicts without false OLED findings', () => {
  assert.ok(validate({ display_technology: 'OLED', backlight_technology: 'Direct LED' }).some(({ ruleId }) => ruleId === 'television.display.oled-backlight-conflict'));
  assert.equal(validate({ display_technology: 'QD-OLED' }).some(({ ruleId }) => ruleId === 'television.display.oled-backlight-conflict'), false);
  assert.equal(validate({ display_technology: 'OLED evo' }).some(({ ruleId }) => ruleId === 'television.display.oled-backlight-conflict'), false);
  assert.ok(validate({ resolution: '4K_UHD', pixel_dimensions: '7680 × 4320' }).some(({ ruleId }) => ruleId === 'television.resolution.4k-pixel-conflict'));
  assert.ok(validate({ resolution: '8K_UHD', pixel_dimensions: '3840 × 2160' }).some(({ ruleId }) => ruleId === 'television.resolution.8k-pixel-conflict'));
  assert.ok(validate({ smart_platform: ['Tizen', 'Google TV'] }).some(({ ruleId }) => ruleId === 'television.platform.conflict'));
  assert.ok(validate({ hdmi_port_count: 4, hdmi_ports: ['1', '2', '3'] }).some(({ ruleId }) => ruleId === 'television.hdmi.count-mismatch'));
});

test('derivation rules prevent marketing metrics, upscaling and HDMI implication shortcuts', () => {
  assert.ok(validate({ refresh_rate: 240, marketing_motion_metric: 'Motion Rate 240' }, { refresh_rate: 'marketing_motion_metric' }).some(({ ruleId }) => ruleId === 'television.refresh.marketing-derivation'));
  assert.ok(validate({ resolution: '8K_UHD', upscaling_capability: '8K AI upscaling' }, { resolution: 'upscaling_capability' }).some(({ ruleId }) => ruleId === 'television.resolution.upscaling-derivation'));
  assert.ok(validate({ hdmi_version: '2.1', gaming_features: ['VRR'] }, { gaming_features: 'hdmi_version' }).some(({ ruleId }) => ruleId === 'television.hdmi.unsupported-gaming-derivation'));
  assert.equal(validate({ hdmi_version: '2.1' }).some(({ ruleId }) => ruleId === 'television.hdmi.unsupported-gaming-derivation'), false);
});

test('8K identity validation rejects a direct 4K identity without treating input support as native resolution', () => {
  const conflict = evaluateProductIntelligencePack(televisionIntelligencePack, {
    productId: 'tv-8k', identityText: 'Samsung 85 Inch 4K TV', values: { ...baseValues, resolution: '8K_UHD' }, evidenceReferences: {},
  });
  assert.ok(conflict.some(({ ruleId }) => ruleId === 'television.resolution.8k-identity-conflict'));
  const safe = evaluateProductIntelligencePack(televisionIntelligencePack, {
    productId: 'tv-8k', identityText: 'Samsung 85 Inch 8K TV with 4K input support', values: { ...baseValues, resolution: '8K_UHD' }, evidenceReferences: {},
  });
  assert.equal(safe.some(({ ruleId }) => ruleId === 'television.resolution.8k-identity-conflict'), false);
});

test('identity, size, suffix and HDR conflicts require deterministic review findings', () => {
  const first = validate({ model: ['QN65QN90FAFXZA', 'QE65QN90FATXXU'], model_suffix: ['AFXZA', 'TXXU'], screen_size: [65, 75], dolby_vision_support: [true, false] });
  const repeated = validate({ model: ['QN65QN90FAFXZA', 'QE65QN90FATXXU'], model_suffix: ['AFXZA', 'TXXU'], screen_size: [65, 75], dolby_vision_support: [true, false] });
  for (const ruleId of ['television.model.conflict', 'television.model-suffix.conflict', 'television.screen-size.conflict', 'television.hdr.dolby-vision-conflict']) assert.ok(first.some((finding) => finding.ruleId === ruleId));
  assert.deepEqual(first, repeated);
  assert.deepEqual(first.find(({ ruleId }) => ruleId === 'television.model.conflict')?.evidenceReferences, []);
});

test('missing required fields create findings while optional fields never throw', () => {
  const findings = evaluateProductIntelligencePack(televisionIntelligencePack, { productId: 'tv-2', values: { product_type: 'Television' }, evidenceReferences: {} });
  for (const fieldId of ['brand', 'model', 'screen_size', 'resolution', 'display_technology', 'smart_platform']) assert.ok(findings.some(({ ruleId }) => ruleId === `category.required.${fieldId}`));
  assert.equal(findings.some(({ ruleId }) => ruleId === 'category.required.remote_type'), false);
});

test('conflict, feature, comparison, SEO, metafield and safety guidance remain structured', () => {
  const guidance = new Map(televisionIntelligencePack.conflictGuidance.map((item) => [item.fieldId, item]));
  assert.equal(guidance.get('model')?.priority, 'CRITICAL');
  assert.equal(guidance.get('model')?.autoResolutionAllowed, false);
  assert.equal(guidance.get('hdr_formats')?.priority, 'HIGH');
  assert.equal(guidance.get('remote_type')?.priority, 'MEDIUM');
  assert.deepEqual(televisionIntelligencePack.featurePriorities.map(({ priority }) => priority), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(televisionIntelligencePack.comparisonDimensions.find(({ id }) => id === 'gaming')?.fieldIds.includes('vrr'), true);
  assert.deepEqual(televisionIntelligencePack.seoPriorities.identityFieldOrder, ['brand', 'screen_size', 'display_technology', 'product_type', 'model', 'resolution']);
  assert.equal(televisionIntelligencePack.seoPriorities.vendorIsBrand, false);
  assert.equal(televisionIntelligencePack.metafieldMappings.find(({ truthFieldId }) => truthFieldId === 'model')?.key, 'model_number');
  assert.equal(new Set(televisionIntelligencePack.metafieldMappings.map(({ namespace, key }) => `${namespace}.${key}`)).size, televisionIntelligencePack.metafieldMappings.length);
  assert.ok(televisionIntelligencePack.safetyGuidance.variantSafetyRules[0]?.fieldIds.includes('refresh_rate'));
  assert.ok(televisionIntelligencePack.safetyGuidance.regionalSafetyRules[0]?.fieldIds.includes('model_suffix'));
  assert.equal(televisionIntelligencePack.safetyGuidance.neverInferRules.length >= 14, true);
});

test('Television pack is deeply immutable and contains no generation or Shopify mutation behavior', () => {
  assert.equal(Object.isFrozen(televisionIntelligencePack), true);
  assert.equal(Object.isFrozen(televisionIntelligencePack.detection.rules), true);
  assert.equal(Object.isFrozen(televisionIntelligencePack.safetyGuidance.neverInferRules), true);
  assert.throws(() => { (televisionIntelligencePack.identity.aliases as unknown as string[]).push('mutate'); }, TypeError);
  const source = readFileSync(`${root}/src/modules/product-intelligence/packs/television/television-pack.ts`, 'utf8');
  assert.doesNotMatch(source, /productCreate|metafieldsSet|publishablePublish|generateSeo|generateListing|openai/i);
});
