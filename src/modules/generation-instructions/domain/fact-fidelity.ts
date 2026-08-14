function normalizeNumericTypography(value: string): string {
  return value.replace(/[\u2080-\u2089]/gu, (digit) => String(digit.codePointAt(0)! - 0x2080));
}

// This is intentionally a presentation-only canonicalization. It does not
// convert quantities: the original numeric token remains part of comparison.
function canonicalizeCommonUnits(value: string): string {
  return normalizeNumericTypography(value)
    .replace(/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|l)\b/giu, '$1 L')
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|\u2011|\u2013)?\s*(?:inches|inch|in)\b/giu, '$1 inch')
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|\u2011|\u2013)?\s*"/gu, '$1 inch')
    .replace(/(\d+(?:\.\d+)?)\s*hz\b/giu, '$1 Hz')
    .replace(/(\d+(?:\.\d+)?)\s*w\b/giu, '$1 W')
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/giu, '$1 kg')
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/giu, '$1 ml')
    .replace(/(\d+(?:\.\d+)?)\s*(?:microns?|µm)\b/giu, '$1 micron');
}

export function factualTokens(value: string): readonly string[] {
  return [...new Set(canonicalizeCommonUnits(value).match(/\b(?=[a-z0-9.-]*\d)[a-z0-9]+(?:[.-][a-z0-9]+)*\b/giu) ?? [])];
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
  const evidenceTokens = new Set(evidenceValues.flatMap(comparableFactTokens));
  return factualTokens(value).filter((token) => {
    const tokenParts = comparableFactTokens(token);
    return tokenParts.length > 0 && tokenParts.some((part) => !evidenceTokens.has(part));
  });
}
