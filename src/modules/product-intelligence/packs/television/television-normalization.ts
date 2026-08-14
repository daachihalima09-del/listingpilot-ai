import { immutableCopy } from '../../../intelligence/domain/immutability.ts';

export interface TelevisionNormalizationResult {
  readonly fieldId: string;
  readonly rawValue: string;
  readonly normalizedValue: string | number | readonly string[] | null;
  readonly verifiedByFormat: boolean;
  readonly warnings: readonly string[];
}

function result(fieldId: string, rawValue: string, normalizedValue: TelevisionNormalizationResult['normalizedValue'], verifiedByFormat: boolean, warnings: readonly string[] = []): TelevisionNormalizationResult {
  return immutableCopy({ fieldId, rawValue, normalizedValue, verifiedByFormat, warnings }) as TelevisionNormalizationResult;
}

export function normalizeTelevisionScreenSize(rawValue: string): TelevisionNormalizationResult {
  const raw = rawValue.trim();
  const inch = raw.match(/^([1-9]\d?(?:\.\d+)?)\s*-?\s*(?:"|in(?:ch(?:es)?)?)$/i);
  if (inch) return result('screen_size', rawValue, Number(inch[1]), true);
  if (/\bcm\b/i.test(raw)) return result('screen_size', rawValue, null, false, ['Approximate metric dimensions are not verified marketed inch sizes.']);
  return result('screen_size', rawValue, null, false, ['Screen size requires an explicit inch value.']);
}

export function normalizeTelevisionResolution(rawValue: string): TelevisionNormalizationResult {
  const raw = rawValue.trim();
  if (/upscal|input support|supports?\s+(?:4k|8k)/i.test(raw)) return result('resolution', rawValue, null, false, ['Upscaling or input support is not native panel resolution.']);
  const compact = raw.toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
  if (/7680\s*[×X]\s*4320/u.test(compact) || /\b8K(?:\s+UHD)?\b/u.test(compact)) return result('resolution', rawValue, '8K_UHD', true);
  if (/3840\s*[×X]\s*2160/u.test(compact) || /\b(?:4K|UHD)(?:\s+UHD)?\b/u.test(compact)) return result('resolution', rawValue, '4K_UHD', true);
  if (/1920\s*[×X]\s*1080/u.test(compact) || /\bFULL\s*HD\b/u.test(compact)) return result('resolution', rawValue, 'FULL_HD', true);
  if (/1280\s*[×X]\s*720/u.test(compact) || compact === 'HD') return result('resolution', rawValue, 'HD', true);
  return result('resolution', rawValue, null, false, ['Resolution value is preserved without an unsupported canonical mapping.']);
}

export function normalizeTelevisionRefreshRate(rawValue: string): TelevisionNormalizationResult {
  const raw = rawValue.trim();
  if (/motion rate|motion clarity|game accelerator|motion xcelerator|trumotion|effective (?:motion|refresh)/i.test(raw)) {
    return result('refresh_rate', rawValue, null, false, ['Marketing motion metrics are not native refresh rate.']);
  }
  const explicit = raw.match(/^(?:(?:native|panel)\s+)?(?:refresh\s+rate\s+)?(\d{2,3}(?:\.\d+)?)\s*hz$/i);
  return explicit
    ? result('refresh_rate', rawValue, Number(explicit[1]), true)
    : result('refresh_rate', rawValue, null, false, ['Native or panel refresh-rate evidence is required.']);
}

export function normalizeTelevisionHdrFormats(rawValue: string): TelevisionNormalizationResult {
  const formats: Array<[RegExp, string]> = [
    [/dolby\s+vision\s+iq/i, 'DOLBY_VISION_IQ'],
    [/dolby\s+vision/i, 'DOLBY_VISION'],
    [/hdr10\+/i, 'HDR10_PLUS'],
    [/(?<!hdr10\+)\bhdr10\b(?!\+)/i, 'HDR10'],
    [/\bhlg\b/i, 'HLG'],
    [/technicolor/i, 'TECHNICOLOR'],
  ];
  const normalized = [...new Set(formats.filter(([pattern]) => pattern.test(rawValue)).map(([, value]) => value))].sort();
  return normalized.length
    ? result('hdr_formats', rawValue, normalized, true)
    : result('hdr_formats', rawValue, null, false, ['Unknown HDR labels remain unverified.']);
}

export function normalizeTelevisionModel(rawValue: string): TelevisionNormalizationResult {
  const normalized = rawValue.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return result('model', rawValue, normalized || null, Boolean(normalized), normalized ? [] : ['Model identity is empty.']);
}

export function normalizeTelevisionField(fieldId: string, rawValue: string): TelevisionNormalizationResult {
  if (fieldId === 'screen_size') return normalizeTelevisionScreenSize(rawValue);
  if (fieldId === 'resolution') return normalizeTelevisionResolution(rawValue);
  if (fieldId === 'refresh_rate') return normalizeTelevisionRefreshRate(rawValue);
  if (fieldId === 'hdr_formats') return normalizeTelevisionHdrFormats(rawValue);
  if (fieldId === 'model' || fieldId === 'model_suffix' || fieldId === 'regional_variant') return normalizeTelevisionModel(rawValue);
  const normalized = rawValue.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return result(fieldId, rawValue, normalized || null, false, normalized ? ['No category-specific canonical transformation was applied.'] : []);
}
