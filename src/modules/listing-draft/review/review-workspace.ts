import type { GenerationInstructions } from '../../generation-instructions/domain/contracts.ts';
import type { CraftComplianceResult } from '../../listing-craft/index.ts';
import type {
  DraftFieldTrace,
  DraftReviewSection,
  DraftTextField,
  ListingDraftProviderOutput,
  ListingDraftReviewWorkspace,
} from '../domain/contracts.ts';

function label(value: string): string {
  return value.split(/[._]/u).filter(Boolean).map((part) => (
    `${part.charAt(0).toUpperCase()}${part.slice(1).toLocaleLowerCase('en-US')}`
  )).join(' ');
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function numberRule(value: unknown, key: string, fallback: number): number {
  const candidate = objectRecord(value)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function trace(
  fieldKey: string,
  fieldLabel: string,
  value: DraftTextField | { readonly factIds: readonly string[] },
  facts: ListingDraftReviewWorkspace['facts'],
  rule: string,
  merchantProfile: string,
  productIntelligence: string,
): DraftFieldTrace {
  const used = facts.filter(({ factId }) => value.factIds.includes(factId));
  const confidence = used.length
    ? Math.round(used.reduce((total, fact) => total + fact.confidence, 0) / used.length)
    : 0;
  return {
    fieldKey,
    label: fieldLabel,
    factIds: [...value.factIds],
    source: used.length ? 'Verified Product Truth evidence' : 'Merchant configuration',
    confidence,
    rule,
    merchantProfile,
    productIntelligence,
  };
}

export function createListingDraftReviewWorkspace(
  output: ListingDraftProviderOutput,
  instructions: GenerationInstructions,
  compliance?: CraftComplianceResult,
): ListingDraftReviewWorkspace {
  const facts = instructions.allowedFacts.map((fact) => ({
    factId: fact.factId,
    fieldId: fact.fieldId,
    label: label(fact.fieldId),
    value: fact.value,
    source: fact.sourceAuthority?.displayLabel ?? 'Unknown Source',
    confidence: Math.round(fact.confidence * 100),
    status: fact.truthStatus,
    truthStatus: fact.truthStatus,
    allowedUses: [...fact.allowedUses],
    ...(fact.sourceAuthority ? { sourceAuthority: {
      category: fact.sourceAuthority.category,
      displayLabel: fact.sourceAuthority.displayLabel,
      authorityLevel: fact.sourceAuthority.authorityLevel,
      verificationStatus: fact.sourceAuthority.verificationStatus,
      limitations: [...fact.sourceAuthority.limitations],
    } } : {}),
  }));
  const titleRules = instructions.groups.TITLE.instructions;
  const descriptionRules = instructions.groups.DESCRIPTION.instructions;
  const seoRules = instructions.groups.SEO.instructions;
  const seoTitle = objectRecord(seoRules.title);
  const seoDescription = objectRecord(seoRules.metaDescription);
  const seoDescriptionRange = objectRecord(seoDescription.targetRange);
  const handleRules = objectRecord(seoRules.handle);
  const profileSummary = 'Merchant catalog and listing profile rules applied.';
  const metafieldEntries = Array.isArray(instructions.groups.METAFIELDS.instructions.entries)
    ? instructions.groups.METAFIELDS.instructions.entries
    : [];
  const firstMapping = metafieldEntries.find((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'));
  const packName = typeof firstMapping?.mappingId === 'string'
    ? firstMapping.mappingId.split(':')[0]
    : null;
  const intelligenceSummary = packName
    ? `${label(packName)} Product Intelligence Pack guidance applied.`
    : 'Generic Product Intelligence guidance applied.';
  const traceability: DraftFieldTrace[] = [
    trace('title', 'Product Title', output.title, facts, `Title structure and ${numberRule(titleRules, 'hardMaximum', 200)} character limit.`, profileSummary, intelligenceSummary),
    trace('overview', 'Overview', output.overview, facts, `Merchant description structure: ${String(descriptionRules.structure ?? 'approved structure')}.`, profileSummary, intelligenceSummary),
    trace('specifications', 'Specifications', { factIds: unique(output.specifications.flatMap(({ factIds }) => factIds)) }, facts, 'Specification values must exactly match selected Product Truth.', profileSummary, intelligenceSummary),
    ...output.specifications.map((item, index) => trace(`specifications.${index}`, item.label, item, facts, 'Specification values must exactly match selected Product Truth.', profileSummary, intelligenceSummary)),
    ...output.features.map((item, index) => trace(`features.${index}`, `Feature ${index + 1}`, item, facts, 'Feature must be unique and supported by selected facts.', profileSummary, intelligenceSummary)),
    trace('seo.title', 'SEO Title', output.seo.title, facts, `SEO title limit: ${numberRule(seoTitle, 'hardMaximum', 120)} characters.`, 'Merchant SEO profile applied.', intelligenceSummary),
    trace('seo.description', 'SEO Description', output.seo.description, facts, `SEO description limit: ${numberRule(seoDescriptionRange, 'maximum', 320)} characters.`, 'Merchant SEO profile applied.', intelligenceSummary),
    trace('seo.handle', 'URL Handle', output.seo.handle, facts, handleRules.lockedExistingHandle ? 'Existing merchant handle preserved.' : 'Approved handle policy applied.', 'Merchant SEO profile applied.', intelligenceSummary),
    trace('catalog.tags', 'Tags', { factIds: unique(output.catalog.tags.flatMap(({ factIds }) => factIds)) }, facts, 'Only merchant-approved tags are suggested.', profileSummary, intelligenceSummary),
    trace('catalog.collections', 'Collections', { factIds: unique(output.catalog.collections.flatMap(({ factIds }) => factIds)) }, facts, 'Only merchant-approved collections are suggested.', profileSummary, intelligenceSummary),
    ...output.catalog.tags.map((item, index) => trace(`catalog.tags.${index}`, `Tag ${index + 1}`, item, facts, 'Only merchant-approved catalog values are suggested.', profileSummary, intelligenceSummary)),
    ...output.catalog.collections.map((item, index) => trace(`catalog.collections.${index}`, `Collection ${index + 1}`, item, facts, 'Only merchant-approved collections are suggested.', profileSummary, intelligenceSummary)),
    trace('catalog.productType', 'Product Type', output.catalog.productType, facts, 'Must match the Merchant Catalog Profile.', profileSummary, intelligenceSummary),
    trace('catalog.vendor', 'Vendor', output.catalog.vendor, facts, 'Vendor remains distinct from Brand.', profileSummary, intelligenceSummary),
    ...output.metafields.map((item, index) => trace(`metafields.${index}`, `${item.namespace}.${item.key}`, item, facts, 'Only approved verified metafield mappings are used.', profileSummary, intelligenceSummary)),
    ...output.media.map((item, index) => trace(`media.${index}`, `Image Alt Text ${index + 1}`, item, facts, 'Alt text describes only selected visible product facts.', 'Merchant SEO profile applied.', intelligenceSummary)),
  ];
  const safety = instructions.groups.SAFETY;
  const localization = objectRecord(instructions.groups.LOCALIZATION.instructions);
  return {
    lockedFields: [],
    reviewedSections: [],
    editedFields: [],
    traceability,
    facts,
    comparison: null,
    advanced: {
      localization: [
        `Language: ${String(localization.language ?? localization.locale ?? 'Merchant default')}`,
        'No automatic translation or regional fact substitution.',
      ],
      publishingConstraints: unique([
        'Nothing is published during review.',
        safety.publishingConstraints.approval.explicitMerchantActionRequired ? 'Merchant approval is required before publishing.' : '',
        safety.publishingConstraints.shopifyMutationAllowed === false ? 'Shopify changes are disabled in this workflow.' : '',
        ...safety.reviewRequirements.filter(({ blocking }) => blocking).map(({ reason }) => reason),
      ]),
      aiPolicySummary: [
        `Factual strictness: ${safety.factualStrictness}.`,
        `Uncertainty handling: ${safety.uncertaintyBehavior}.`,
        `Quality tier: ${safety.aiPolicy.qualityTier}.`,
        safety.aiPolicy.merchantApprovalRequired ? 'Merchant review is required.' : 'Merchant review is recommended.',
      ],
    },
    policy: {
      titleMaximum: numberRule(titleRules, 'hardMaximum', 200),
      seoTitleMaximum: numberRule(seoTitle, 'hardMaximum', 120),
      seoDescriptionMaximum: numberRule(seoDescriptionRange, 'maximum', 320),
      prohibitedTerms: unique([
        ...stringList(titleRules.prohibitedTerms),
        ...stringList(descriptionRules.prohibitedTerms),
      ]),
      lockedHandle: typeof handleRules.lockedExistingHandle === 'string'
        ? handleRules.lockedExistingHandle
        : null,
    },
    ...(instructions.craft && compliance ? { craft: {
      packId: instructions.craft.packId,
      packVersion: instructions.craft.packVersion,
      displayName: instructions.craft.displayName,
      status: compliance.status,
      findings: compliance.findings,
      featureTargetCount: numberRule(instructions.groups.FEATURES.instructions, 'targetCount', output.features.length),
      explanations: unique([
        `${instructions.craft.displayName} applied`,
        'Specifications-first structure applied',
        instructions.craft.categoryCraftGuidance.useProductIntelligenceFeaturePriorities
          ? 'Feature order follows Product Intelligence priorities'
          : '',
        ...compliance.findings.slice(0, 5).map(({ code }) => code === 'FEATURE_SEMANTIC_DUPLICATE'
          ? 'Repeated feature meaning was detected'
          : code === 'PROHIBITED_MARKETING_LANGUAGE'
            ? 'Promotional wording needs review to keep the listing factual'
            : code === 'MISSING_REQUIRED_TITLE_COMPONENT'
              ? 'Verified product identity needs review'
              : ''),
      ]),
      rules: instructions.craft,
    } } : {}),
  };
}

export function confidenceLabel(value: number, blocked = false): 'Excellent' | 'High' | 'Medium' | 'Low' | 'Blocked' {
  if (blocked) return 'Blocked';
  if (value >= 95) return 'Excellent';
  if (value >= 80) return 'High';
  if (value >= 60) return 'Medium';
  return 'Low';
}

export function listingReviewProgress(reviewed: readonly DraftReviewSection[]): number {
  return Math.round((new Set(reviewed).size / 8) * 100);
}
