import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type {
  AllowedFactInstruction,
  GenerationInstructions,
} from '../../generation-instructions/domain/contracts.ts';
import { comparableFactTokens, factValueIsRepresented, unsupportedFactualTokens } from '../../generation-instructions/domain/fact-fidelity.ts';
import type { ListingDraftProviderOutput } from '../domain/contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { listingDraftProviderOutputSchema } from './draft-schema.ts';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

function representedValueIndex(text: string, factValue: string): number {
  const candidate = normalized(text);
  const aliases = [factValue, factValue.replace(/\([^)]*\)/gu, ' ')];
  for (const match of factValue.matchAll(/\(([^)]+)\)/gu)) {
    if (match[1]) aliases.push(match[1]);
  }
  for (const alias of aliases.map(normalized).filter(Boolean)) {
    const index = candidate.indexOf(alias);
    if (index >= 0) return index;
  }
  if (!factValueIsRepresented(text, factValue)) return -1;
  const firstRepresentedToken = comparableFactTokens(factValue)
    .find((token) => new Set(comparableFactTokens(text)).has(token));
  return firstRepresentedToken ? candidate.indexOf(firstRepresentedToken) : -1;
}

function textValues(output: ListingDraftProviderOutput): readonly string[] {
  return [
    output.title.value,
    output.overview.value,
    ...output.specifications.flatMap(({ label, value }) => [label, value]),
    ...output.features.map(({ value }) => value),
    ...output.whatsIncluded.map(({ value }) => value),
    output.seo.title.value,
    output.seo.description.value,
    output.seo.handle.value,
    ...output.catalog.tags.map(({ value }) => value),
    ...output.catalog.collections.map(({ value }) => value),
    output.catalog.productType.value,
    output.catalog.vendor.value,
    ...output.metafields.map(({ value }) => value),
    ...output.media.map(({ altText }) => altText),
  ];
}

function referencedFactIds(output: ListingDraftProviderOutput): readonly string[] {
  return [
    ...output.title.factIds,
    ...output.overview.factIds,
    ...output.specifications.flatMap(({ factIds }) => factIds),
    ...output.features.flatMap(({ factIds }) => factIds),
    ...output.whatsIncluded.flatMap(({ factIds }) => factIds),
    ...output.seo.title.factIds,
    ...output.seo.description.factIds,
    ...output.seo.handle.factIds,
    ...output.catalog.tags.flatMap(({ factIds }) => factIds),
    ...output.catalog.collections.flatMap(({ factIds }) => factIds),
    ...output.catalog.productType.factIds,
    ...output.catalog.vendor.factIds,
    ...output.metafields.flatMap(({ factIds }) => factIds),
    ...output.media.flatMap(({ factIds }) => factIds),
  ];
}

function ruleNumber(
  instructions: Readonly<Record<string, unknown>>,
  field: string,
  fallback: number,
): number {
  const value = instructions[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ruleStrings(
  instructions: Readonly<Record<string, unknown>>,
  field: string,
): readonly string[] {
  const value = instructions[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export type ListingStyleComplianceStatus = 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'REJECTED';

export interface ListingStyleComplianceFinding {
  readonly code: string;
  readonly severity: 'WARNING' | 'REVIEW' | 'ERROR';
  readonly message: string;
}

export interface ListingStyleComplianceResult {
  readonly status: ListingStyleComplianceStatus;
  readonly findings: readonly ListingStyleComplianceFinding[];
}

const titleFieldAliases: Readonly<Record<string, readonly string[]>> = {
  BRAND: ['brand'],
  PRODUCT_TYPE: ['product_type', 'type'],
  MODEL: ['model', 'model_number'],
  SIZE_OR_CAPACITY: ['size', 'screen_size', 'capacity', 'size_or_capacity', 'water_tank_capacity', 'room_coverage', 'bin_capacity'],
  TECHNOLOGY: ['technology', 'display_technology', 'resolution'],
};

export function evaluateListingStyleCompliance(
  output: ListingDraftProviderOutput,
  instructions: GenerationInstructions,
): ListingStyleComplianceResult {
  const findings: ListingStyleComplianceFinding[] = [];
  const add = (code: string, severity: ListingStyleComplianceFinding['severity'], message: string) => {
    findings.push({ code, severity, message });
  };
  const featureRules = instructions.groups.FEATURES.instructions;
  const targetCount = ruleNumber(featureRules, 'targetCount', output.features.length);
  if (output.features.length !== targetCount) {
    const availableFeatureFacts = instructions.allowedFacts.filter(({ allowedUses }) => allowedUses.includes('FEATURES')).length;
    const evidenceLimited = output.features.length < targetCount && availableFeatureFacts < targetCount;
    add(
      'FEATURE_COUNT_MISMATCH',
      evidenceLimited ? 'REVIEW' : 'ERROR',
      evidenceLimited
        ? `The selected Listing Style targets ${targetCount} features, but only ${availableFeatureFacts} verified feature facts are available; no filler was added.`
        : `The selected Listing Style requires ${targetCount} features when enough verified facts are available.`,
    );
  }
  const maximumFeatureLength = ruleNumber(featureRules, 'maximumFeatureLength', 300);
  if (output.features.some(({ value: item }) => item.length > maximumFeatureLength)) {
    add('FEATURE_LENGTH_EXCEEDED', 'ERROR', 'A generated feature exceeds the selected Listing Style length limit.');
  }

  const titleRules = instructions.groups.TITLE.instructions;
  const isNeovix = instructions.sourcePlan.listingStandardId === 'NEOVIX';
  const brandFact = instructions.allowedFacts.find(({ fieldId, allowedUses }) => fieldId === 'brand' && allowedUses.includes('TITLE'));
  if (isNeovix && brandFact && !normalized(output.title.value).startsWith(normalized(brandFact.value))) {
    add('NEOVIX_BRAND_NOT_FIRST', 'ERROR', 'The NEOVIX product title must start with the verified Brand.');
  }
  const modelFact = instructions.allowedFacts.find(({ fieldId, allowedUses }) => ['model', 'model_number'].includes(fieldId) && allowedUses.includes('TITLE'));
  if (isNeovix && modelFact) {
    const primaryModel = modelFact.value.split(/\s*\(/u)[0]!.trim();
    const escapedPrimaryModel = normalized(primaryModel).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const primaryModelCount = normalized(output.title.value).match(
      new RegExp(`(?:^|\\s)${escapedPrimaryModel}(?=$|\\s)`, 'gu'),
    )?.length ?? 0;
    if (primaryModelCount > 1) add('NEOVIX_MODEL_REPEATED', 'ERROR', 'The NEOVIX product title must not repeat the primary model identity.');
    if (primaryModel !== modelFact.value.trim() && normalized(output.title.value).includes(normalized(modelFact.value))) {
      add('NEOVIX_REDUNDANT_MODEL_ALIAS', 'REVIEW', 'The title contains a long alternative model identity that belongs in Product Information.');
    }
  }
  const componentOrder = ruleStrings(titleRules, 'componentOrder');
  const componentPositions: number[] = [];
  let previousIndex = -1;
  for (const component of componentOrder) {
    const aliases = titleFieldAliases[component] ?? [];
    const fact = instructions.allowedFacts.find(({ fieldId, allowedUses }) => (
      aliases.includes(fieldId) && allowedUses.includes('TITLE')
    ));
    if (!fact) continue;
    const index = representedValueIndex(output.title.value, fact.value);
    if (index < 0) {
      if (fact.requiredPlacements.includes('TITLE')) {
        add('TITLE_COMPONENT_MISSING', 'ERROR', `The generated title omitted the required ${component.toLocaleLowerCase('en-US').replaceAll('_', ' ')} component.`);
      }
      continue;
    }
    if (index < previousIndex) {
      add('TITLE_COMPONENT_ORDER', 'ERROR', 'The generated title does not follow the selected component order.');
      break;
    }
    componentPositions.push(index);
    previousIndex = index;
  }
  const separator = typeof titleRules.separator === 'string' ? titleRules.separator : 'SPACE';
  const separatorCharacter = { DASH: '-', PIPE: '|', COLON: ':' }[separator];
  if (separatorCharacter && componentPositions.length > 1 && !output.title.value.includes(separatorCharacter)) {
    add('TITLE_SEPARATOR_MISMATCH', 'ERROR', `The selected Listing Style requires “${separatorCharacter}” between title components.`);
  }

  const descriptionRules = instructions.groups.DESCRIPTION.instructions;
  const paragraphTarget = ruleNumber(descriptionRules, 'overviewParagraphCount', 1);
  const paragraphCount = output.overview.value.split(/\n\s*\n/gu).filter((item) => item.trim()).length;
  if (paragraphCount !== paragraphTarget) {
    add('OVERVIEW_PARAGRAPH_COUNT', isNeovix ? 'ERROR' : 'REVIEW', `The selected Listing Style requests ${paragraphTarget} overview paragraph${paragraphTarget === 1 ? '' : 's'}.`);
  }
  if (isNeovix && output.features.some(({ value }) => !/^\u2714\s/u.test(value))) {
    add('NEOVIX_FEATURE_MARKER', 'ERROR', 'Every NEOVIX key feature must begin with a check mark.');
  }
  const requiredLabels = ruleStrings(descriptionRules, 'requiredLabels');
  const specificationLabels = output.specifications.map(({ label }) => normalized(label));
  if (isNeovix && new Set(specificationLabels).size !== specificationLabels.length) {
    add('NEOVIX_PRODUCT_INFORMATION_DUPLICATE_LABEL', 'ERROR', 'NEOVIX Product Information must contain at most one row for each configured label.');
  }
  const availableText = normalized([
    output.title.value,
    output.overview.value,
    ...output.specifications.map(({ label }) => label),
  ].join(' '));
  const missingRequired = requiredLabels.filter((label) => !availableText.includes(normalized(label)));
  if (missingRequired.length) {
    add('REQUIRED_INFORMATION_MISSING', 'REVIEW', 'Some merchant-required information needs review because it is not visibly labelled in the draft.');
  }

  const status: ListingStyleComplianceStatus = findings.some(({ severity }) => severity === 'ERROR')
    ? 'REJECTED'
    : findings.some(({ severity }) => severity === 'REVIEW')
      ? 'REVIEW_REQUIRED'
      : findings.some(({ severity }) => severity === 'WARNING')
        ? 'PASS_WITH_WARNINGS'
        : 'PASS';
  return immutableCopy({ status, findings }) as ListingStyleComplianceResult;
}

function factIsRepresented(value: string, fact: AllowedFactInstruction): boolean {
  return factValueIsRepresented(value, fact.value);
}

function assertGroundedTokens(
  value: string,
  factIds: readonly string[],
  facts: ReadonlyMap<string, AllowedFactInstruction>,
  outputField: string,
): void {
  const invented = unsupportedFactualTokens(value, factIds.map((id) => facts.get(id)?.value ?? ''));
  if (invented.length) {
    throw new ListingDraftError(
      'DRAFT_INVENTED_VALUE',
      'The generated draft contains a factual value unsupported by its cited facts.',
      422,
      {
        outputField,
        generatedText: value.slice(0, 500),
        citedFactIds: factIds,
        productTruthValues: factIds.map((id) => facts.get(id)?.value.slice(0, 500) ?? null),
        unsupportedTokens: invented.slice(0, 20),
        reason: 'UNSUPPORTED_FACTUAL_TOKEN',
      },
    );
  }
}

function assertCitationsAreRelevant(
  value: string,
  factIds: readonly string[],
  facts: ReadonlyMap<string, AllowedFactInstruction>,
  outputField: string,
): void {
  const irrelevant = factIds.find((id) => {
    const fact = facts.get(id);
    return fact ? !factIsRepresented(value, fact) : false;
  });
  if (irrelevant) {
    const fact = facts.get(irrelevant);
    throw new ListingDraftError(
      'DRAFT_INVENTED_VALUE',
      'A generated product detail did not match the verified product information.',
      422,
      {
        outputField,
        generatedText: value.slice(0, 500),
        factId: irrelevant,
        fieldId: fact?.fieldId ?? null,
        productTruthValue: fact?.value.slice(0, 500) ?? null,
        factRole: fact?.visibilityRole ?? null,
        reason: 'CITATION_NOT_REPRESENTED',
      },
    );
  }
}

function assertRequiredFactsAreVisible(
  output: ListingDraftProviderOutput,
  instructions: GenerationInstructions,
): void {
  for (const fact of instructions.allowedFacts) {
    if (fact.visibilityRole !== 'REQUIRED_VISIBLE') continue;
    for (const placement of fact.requiredPlacements) {
      const visible = placement === 'TITLE'
        ? output.title.factIds.includes(fact.factId) && factIsRepresented(output.title.value, fact)
        : output.specifications.some((item) => (
            item.factIds.includes(fact.factId) && factIsRepresented(item.value, fact)
          ));
      if (!visible) {
        throw new ListingDraftError(
          'DRAFT_POLICY_VIOLATION',
          'The generated listing is missing required verified product information.',
          422,
          { factId: fact.factId, fieldId: fact.fieldId, placement, reason: 'REQUIRED_FACT_NOT_VISIBLE' },
        );
      }
    }
  }
}

export function validateListingDraftOutput(
  value: unknown,
  instructions: GenerationInstructions,
  options: { readonly enforceListingStyle?: boolean } = {},
): ListingDraftProviderOutput {
  const parsed = listingDraftProviderOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ListingDraftError(
      'DRAFT_INVALID_PROVIDER_OUTPUT',
      'The generated draft is incomplete or malformed.',
      502,
    );
  }
  const output = parsed.data;
  const facts = new Map(instructions.allowedFacts.map((fact) => [fact.factId, fact]));
  const forbiddenReference = referencedFactIds(output).find((id) => !facts.has(id));
  if (forbiddenReference) {
    throw new ListingDraftError(
      'DRAFT_FORBIDDEN_FACT',
      'The generated draft references a fact outside the approved instruction package.',
      422,
    );
  }

  const titleMaximum = ruleNumber(instructions.groups.TITLE.instructions, 'hardMaximum', 200);
  if (!output.title.value.trim() || output.title.value.length > titleMaximum) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The generated title violates its length policy.', 422);
  }
  const seoTitleRules = instructions.groups.SEO.instructions.title;
  const seoDescriptionRules = instructions.groups.SEO.instructions.metaDescription;
  const seoTitleMaximum = seoTitleRules && typeof seoTitleRules === 'object'
    ? ruleNumber(seoTitleRules as Readonly<Record<string, unknown>>, 'hardMaximum', 70)
    : 70;
  const seoDescriptionRange = seoDescriptionRules && typeof seoDescriptionRules === 'object'
    ? (seoDescriptionRules as Readonly<Record<string, unknown>>).targetRange
    : null;
  const seoDescriptionMaximum = seoDescriptionRange && typeof seoDescriptionRange === 'object'
    && 'maximum' in seoDescriptionRange && typeof seoDescriptionRange.maximum === 'number'
    ? seoDescriptionRange.maximum
    : 320;
  if (output.seo.title.value.length > seoTitleMaximum
    || output.seo.description.value.length > seoDescriptionMaximum) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Generated SEO metadata exceeds its approved limits.', 422);
  }
  const lockedTitle = instructions.groups.TITLE.instructions.lockedValue;
  if (typeof lockedTitle === 'string' && lockedTitle && output.title.value !== lockedTitle) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The generated title changed merchant-locked content.', 422);
  }
  const handleRules = instructions.groups.SEO.instructions.handle;
  const lockedHandle = handleRules && typeof handleRules === 'object'
    ? (handleRules as Readonly<Record<string, unknown>>).lockedExistingHandle
    : null;
  if (typeof lockedHandle === 'string' && lockedHandle && output.seo.handle.value !== lockedHandle) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The generated URL handle changed merchant-locked content.', 422);
  }

  const duplicateFeatures = output.features.map(({ value: item }) => normalized(item));
  if (new Set(duplicateFeatures).size !== duplicateFeatures.length) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Generated features must be unique.', 422);
  }
  const prohibitedTerms = [
    ...ruleStrings(instructions.groups.TITLE.instructions, 'prohibitedTerms'),
    ...ruleStrings(instructions.groups.DESCRIPTION.instructions, 'prohibitedTerms'),
  ].map(normalized).filter(Boolean);
  const prohibited = textValues(output).find((text) => {
    const candidate = normalized(text);
    return prohibitedTerms.some((term) => candidate.includes(term));
  });
  if (prohibited) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'The generated draft contains prohibited wording.', 422);
  }

  const primaryItems = [
    ['title', output.title],
    ['description', output.overview],
    ...output.features.map((item, index) => [`features.${index}`, item] as const),
    ...output.whatsIncluded.map((item, index) => [`whatsIncluded.${index}`, item] as const),
  ] as const;
  for (const [field, item] of primaryItems) {
    if (item.value.trim() && item.factIds.length === 0) {
      throw new ListingDraftError(
        'DRAFT_INVENTED_VALUE',
        'Generated factual content requires fact references.',
        422,
        {
          outputField: field,
          generatedText: item.value.slice(0, 500),
          citedFactIds: [],
          reason: 'MISSING_FACT_REFERENCES',
        },
      );
    }
    assertGroundedTokens(item.value, item.factIds, facts, field);
    assertCitationsAreRelevant(item.value, item.factIds, facts, field);
  }
  for (const [field, item] of [['seo.title', output.seo.title], ['seo.description', output.seo.description]] as const) {
    if (item.value.trim() && item.factIds.length === 0) {
      throw new ListingDraftError('DRAFT_INVENTED_VALUE', 'Generated SEO content requires fact references.', 422);
    }
    assertGroundedTokens(item.value, item.factIds, facts, field);
    assertCitationsAreRelevant(item.value, item.factIds, facts, field);
  }
  assertGroundedTokens(output.seo.handle.value, output.seo.handle.factIds, facts, 'seo.handle');
  assertCitationsAreRelevant(output.seo.handle.value, output.seo.handle.factIds, facts, 'seo.handle');
  for (const [index, media] of output.media.entries()) {
    assertGroundedTokens(media.altText, media.factIds, facts, `media.${index}.altText`);
    assertCitationsAreRelevant(media.altText, media.factIds, facts, `media.${index}.altText`);
  }
  for (const [index, specification] of output.specifications.entries()) {
    const citedValues = specification.factIds.map((id) => facts.get(id)?.value ?? '').filter(Boolean);
    const specificationValue = normalized(specification.value);
    if (!citedValues.length || citedValues.some((value) => !specificationValue.includes(normalized(value)))) {
      throw new ListingDraftError('DRAFT_INVENTED_VALUE', 'Specification values must match selected facts exactly.', 422);
    }
    assertGroundedTokens(specification.value, specification.factIds, facts, `specifications.${index}`);
  }

  const catalog = instructions.groups.CATALOG.instructions;
  const approvedValues = catalog.approvedValues && typeof catalog.approvedValues === 'object'
    ? catalog.approvedValues as { vendors?: unknown; productTypes?: unknown; collections?: unknown }
    : {};
  const approved = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map(normalized)
    : [];
  const approvedVendors = approved(approvedValues.vendors);
  const approvedTypes = approved(approvedValues.productTypes);
  const approvedCollections = approved(approvedValues.collections);
  if (output.catalog.vendor.value && !approvedVendors.includes(normalized(output.catalog.vendor.value))) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Suggested Vendor is not merchant-approved.', 422);
  }
  if (output.catalog.productType.value && !approvedTypes.includes(normalized(output.catalog.productType.value))) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Suggested Product Type is not merchant-approved.', 422);
  }
  if (output.catalog.collections.some(({ value: item }) => !approvedCollections.includes(normalized(item)))) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Suggested Collections must be merchant-approved.', 422);
  }

  const mappings = new Map(
    (Array.isArray(instructions.groups.METAFIELDS.instructions.entries)
      ? instructions.groups.METAFIELDS.instructions.entries
      : []).filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => [`${entry.namespace}.${entry.key}`, entry]),
  );
  for (const metafield of output.metafields) {
    const mapping = mappings.get(`${metafield.namespace}.${metafield.key}`);
    if (!mapping || mapping.type !== metafield.type || mapping.selectedFactId === null
      || !metafield.factIds.includes(String(mapping.selectedFactId))) {
      throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Generated metafields must use approved verified mappings.', 422);
    }
  }

  const imageReferences = new Set(
    Array.isArray(instructions.groups.MEDIA.instructions.selectedImageReferences)
      ? instructions.groups.MEDIA.instructions.selectedImageReferences.filter((item): item is string => typeof item === 'string')
      : [],
  );
  if (output.media.some(({ imageReference }) => !imageReferences.has(imageReference))) {
    throw new ListingDraftError('DRAFT_POLICY_VIOLATION', 'Image alt text references an unknown image.', 422);
  }
  assertRequiredFactsAreVisible(output, instructions);
  const styleCompliance = evaluateListingStyleCompliance(output, instructions);
  if (styleCompliance.status === 'REJECTED' && options.enforceListingStyle !== false) {
    throw new ListingDraftError(
      'DRAFT_POLICY_VIOLATION',
      styleCompliance.findings.find(({ severity }) => severity === 'ERROR')?.message
        ?? 'The generated draft does not follow the selected Listing Style.',
      422,
    );
  }
  return immutableCopy(output) as ListingDraftProviderOutput;
}
