function normalizeNumericTypography(value: string): string {
  return value.replace(/[\u2080-\u2089]/gu, (digit) => String(digit.codePointAt(0)! - 0x2080));
}

function scaledDecimal(value: string, scale: number): string | null {
  if (!/^\d+(?:\.\d+)?$/u.test(value)) return null;
  const scaled = Number(value) * scale;
  return Number.isSafeInteger(scaled) ? String(scaled) : null;
}

function canonicalQuantity(value: string, scale: number, unit: string): string {
  const amount = scaledDecimal(value, scale);
  return amount === null ? `${value}-${unit}` : `${amount}-${unit}`;
}

// Exact conversions use integer canonical bases. No rounding or approximate
// conversion is permitted: a value that cannot be represented exactly stays
// in its original unit and therefore cannot match an incompatible quantity.
function canonicalizeCommonUnits(value: string): string {
  return normalizeNumericTypography(value)
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|\u2011|\u2013)?\s*(?:litres?|liters?|l)\b/giu, (_, amount: string) => canonicalQuantity(amount, 1_000, 'volume-ml'))
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/giu, (_, amount: string) => canonicalQuantity(amount, 1, 'volume-ml'))
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/giu, (_, amount: string) => canonicalQuantity(amount, 10, 'length-mm'))
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/giu, (_, amount: string) => canonicalQuantity(amount, 1, 'length-mm'))
    .replace(/(\d+(?:\.\d+)?)\s*tb\b/giu, (_, amount: string) => canonicalQuantity(amount, 1_000, 'storage-gb'))
    .replace(/(\d+(?:\.\d+)?)\s*gb\b/giu, (_, amount: string) => canonicalQuantity(amount, 1, 'storage-gb'))
    .replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/giu, (_, amount: string) => canonicalQuantity(amount, 60, 'duration-min'))
    .replace(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min)\b/giu, (_, amount: string) => canonicalQuantity(amount, 1, 'duration-min'))
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|\u2011|\u2013)?\s*(?:inches|inch|in)\b/giu, '$1-length-inch')
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|\u2011|\u2013)?\s*"/gu, '$1-length-inch')
    .replace(/(\d+(?:\.\d+)?)\s*hz\b/giu, '$1-frequency-hz')
    .replace(/(\d+(?:\.\d+)?)\s*w\b/giu, '$1-power-w')
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/giu, '$1-mass-kg')
    .replace(/(\d+(?:\.\d+)?)\s*(?:microns?|µm)\b/giu, '$1-length-micrometre')
    .replace(/(\d+(?:\.\d+)?)\s*m²/giu, '$1-area-m2')
    .replace(/(\d+(?:\.\d+)?)\s*ft²/giu, '$1-area-ft2')
    .replace(/(\d+(?:\.\d+)?)\s*(?:m2|sq\.?\s*m|square\s+met(?:res?|ers?))\b/giu, '$1-area-m2')
    .replace(/(\d+(?:\.\d+)?)\s*(?:ft2|sq\.?\s*ft|square\s+feet)\b/giu, '$1-area-ft2')
    .replace(/\bTV\b/gu, 'television');
}

export function factualTokens(value: string): readonly string[] {
  const canonical = canonicalizeCommonUnits(value);
  const numericOrIdentifier = canonical.match(/\b(?=[a-z0-9.-]*\d)[a-z0-9]+(?:[.-][a-z0-9]+)*\b/giu) ?? [];
  const technicalAcronyms = canonical.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/gu) ?? [];
  return [...new Set([...numericOrIdentifier, ...technicalAcronyms])];
}

function presentedFactualTokens(value: string): readonly string[] {
  const normalized = normalizeNumericTypography(value);
  const numeric = normalized.match(/\b\d+(?:\.\d+)?\s*(?:m²|ft²)|\b\d+(?:\.\d+)?\s*(?:-|\u2011|\u2013)?\s*(?:litres?|liters?|l|ml|cm|mm|tb|gb|hours?|hrs?|hr|minutes?|mins?|min|inches|inch|in|hz|w|kg|microns?|µm|m2|ft2|sq\.?\s*m|sq\.?\s*ft|square\s+met(?:res?|ers?)|square\s+feet)\b|\b\d+(?:\.\d+)?\s*(?:-|\u2011|\u2013)?\s*"|\b(?=[a-z0-9.-]*\d)[a-z0-9]+(?:[.-][a-z0-9]+)*\b/giu) ?? [];
  const acronyms = (normalized.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/gu) ?? [])
    .filter((acronym) => !numeric.some((token) => new RegExp(`\\b${acronym}\\b`, 'iu').test(token)));
  const tokens = [...numeric, ...acronyms];
  return [...new Set(tokens.map((token) => token.trim()))];
}

export function comparableFactTokens(value: string): readonly string[] {
  return canonicalizeCommonUnits(value).toLocaleLowerCase('en-US').match(/[a-z0-9]+/gu) ?? [];
}

const semanticTokenAliases: Readonly<Record<string, string>> = {
  purification: 'purify', purifier: 'purify', purifiers: 'purify', purify: 'purify',
  humidification: 'humidify', humidifier: 'humidify', humidifiers: 'humidify', humidify: 'humidify',
  cooled: 'cool', cooling: 'cool',
  filtration: 'filter', filters: 'filter', filtered: 'filter', filtering: 'filter',
  compatibility: 'compatible',
  controls: 'control', controlled: 'control',
  scheduling: 'schedule', scheduled: 'schedule',
  monitors: 'monitor', monitoring: 'monitor', monitored: 'monitor',
  captures: 'capture', captured: 'capture', capturing: 'capture',
  eliminates: 'eliminate', elimination: 'eliminate', eliminating: 'eliminate',
  technologies: 'technology',
  particles: 'particle',
  functions: 'function',
  modes: 'mode',
  litres: 'litre', liters: 'litre', liter: 'litre', l: 'litre',
};

function canonicalConceptToken(token: string): string {
  const direct = semanticTokenAliases[token];
  if (direct) return direct;
  const ify = token.match(/^(.+?)if(?:ier|iers|ies|ication|ications)$/u);
  if (ify?.[1] && ify[1].length >= 3) return `${ify[1]}ify`;
  const connectivity = token.match(/^(.+?)ivit(?:y|ies)$/u);
  if (connectivity?.[1] && connectivity[1].length >= 4) return connectivity[1];
  const inflected = token.match(/^(.+?)(?:ing|ed|s)$/u);
  if (inflected?.[1] && inflected[1].length >= 4) return inflected[1];
  return token;
}

function semanticFactTokens(value: string): readonly string[] {
  return comparableFactTokens(value).map(canonicalConceptToken);
}

function factAliases(value: string): readonly string[] {
  const aliases = [value];
  const primary = value.replace(/\([^)]*\)/gu, ' ').trim();
  if (primary) aliases.push(primary);
  // A leading model-family identifier is an exact, usable part of a longer
  // verified model name (for example, "V16" in "V16 Piston Animal
  // Submarine"). Keep this deliberately narrow: it only accepts an initial
  // letter-and-number identifier, so a different model such as TP10 cannot
  // satisfy a TP12 fact.
  const modelFamily = primary.match(/^[a-z]{1,8}\d{1,8}(?:-[a-z0-9]+)?\b/iu)?.[0];
  if (modelFamily) aliases.push(modelFamily);
  for (const match of value.matchAll(/\(([^)]+)\)/gu)) {
    if (match[1]?.trim()) aliases.push(match[1].trim());
  }
  return [...new Set(aliases)];
}

export function factValueIsRepresented(value: string, factValue: string): boolean {
  const candidateTokens = new Set(comparableFactTokens(value));
  if (factAliases(factValue).some((alias) => {
    const aliasTokens = comparableFactTokens(alias);
    return aliasTokens.length > 0 && aliasTokens.every((token) => candidateTokens.has(token));
  })) return true;

  const connectiveTokens = new Set(['a', 'an', 'and', 'for', 'of', 'the', 'to', 'with']);
  const semanticCandidateTokens = new Set(semanticFactTokens(value));
  const factTokens = [...new Set(semanticFactTokens(factValue).filter((token) => !connectiveTokens.has(token)))];
  const overlap = factTokens.filter((token) => semanticCandidateTokens.has(token)).length;
  const minimumOverlap = Math.min(2, factTokens.length);
  // Product Truth rows may contain several independently usable subclaims. A
  // citation is relevant when the generated claim represents a meaningful
  // portion of the row; source-side details the listing omitted are not
  // mandatory. Unsupported generated numbers and identifiers are checked in
  // the opposite direction by unsupportedFactualTokens.
  return factTokens.length > 0 && overlap >= minimumOverlap;
}

export function unsupportedFactualTokens(
  value: string,
  evidenceValues: readonly string[],
): readonly string[] {
  const evidenceFactualTokens = evidenceValues.flatMap(factualTokens);
  const evidenceTokens = new Set(evidenceFactualTokens.map((token) => comparableFactTokens(token).join(':')));
  const evidenceParts = new Set(evidenceValues.flatMap(comparableFactTokens));
  const quantityMarkers = new Set(['area', 'duration', 'frequency', 'length', 'mass', 'power', 'storage', 'volume']);
  return presentedFactualTokens(value).filter((token) => {
    const canonicalToken = factualTokens(token)[0] ?? token;
    const parts = comparableFactTokens(canonicalToken);
    const comparable = parts.join(':');
    if (!comparable.length || evidenceTokens.has(comparable)) return false;
    // Handles are often deterministic compounds of independently cited Brand
    // and Model facts. Quantity tokens remain atomic so values/units cannot be
    // recombined from unrelated evidence rows.
    return parts.some((part) => quantityMarkers.has(part))
      || parts.some((part) => !evidenceParts.has(part));
  });
}
