import type {
  DeterministicRuleConfiguration,
  MediaUrlNormalizationMode,
  TextComparisonMode,
} from './configuration.ts';

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

export function normalizeText(value: unknown, mode: TextComparisonMode): string {
  if (typeof value !== 'string') return '';
  switch (mode) {
    case 'EXACT':
      return value;
    case 'TRIMMED':
      return value.trim();
    case 'COLLAPSED_WHITESPACE':
      return collapseWhitespace(value).trim();
    case 'CASE_INSENSITIVE':
      return value.toLocaleLowerCase();
    case 'CASE_INSENSITIVE_COLLAPSED':
      return collapseWhitespace(value).trim().toLocaleLowerCase();
  }
}

export function normalizeConfiguredText(
  value: unknown,
  configuration: DeterministicRuleConfiguration,
): string {
  if (typeof value !== 'string') return '';
  let normalized = value;
  if (configuration.duplicateDetection.trimWhitespace) normalized = normalized.trim();
  if (configuration.duplicateDetection.collapseWhitespace) normalized = collapseWhitespace(normalized);
  if (!configuration.duplicateDetection.caseSensitive) normalized = normalized.toLocaleLowerCase();
  return normalized;
}

export function descriptionText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return collapseWhitespace(
    value
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/&nbsp;/giu, ' ')
      .replace(/&amp;/giu, '&')
      .replace(/&lt;/giu, '<')
      .replace(/&gt;/giu, '>'),
  ).trim();
}

export function normalizeDescription(value: unknown, mode: TextComparisonMode): string {
  return normalizeText(descriptionText(value), mode);
}

export function normalizeSpecificationIdentity(namespace: unknown, key: unknown): string {
  return `${normalizeText(namespace, 'CASE_INSENSITIVE_COLLAPSED')}\u0000${normalizeText(key, 'CASE_INSENSITIVE_COLLAPSED')}`;
}

export function normalizeMediaUrl(value: unknown, mode: MediaUrlNormalizationMode): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (mode === 'EXACT') return value;
  try {
    const url = new URL(value.trim());
    url.protocol = url.protocol.toLocaleLowerCase();
    url.hostname = url.hostname.toLocaleLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    url.hash = '';
    if (mode === 'REMOVE_QUERY_AND_FRAGMENT') url.search = '';
    return url.toString();
  } catch {
    return value.trim();
  }
}
