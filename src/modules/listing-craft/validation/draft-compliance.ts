import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type {
  CraftComplianceFinding,
  CraftComplianceResult,
  CraftFindingSeverity,
  CraftInstructionProjection,
  CraftSection,
} from '../domain/contracts.ts';

interface CraftFact { readonly factId: string; readonly fieldId?: string; readonly value: string; readonly truthStatus?: string; readonly status?: string }
interface TextField { readonly value: string; readonly factIds: readonly string[] }
interface DraftLike {
  readonly title: TextField;
  readonly overview: TextField;
  readonly specifications: readonly (TextField & { readonly label: string })[];
  readonly features: readonly TextField[];
  readonly seo?: Readonly<{ readonly title: TextField; readonly description: TextField }>;
}

const normalize = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, ' ').trim();
const words = (value: string) => normalize(value).split(' ').filter(Boolean);

function semanticKey(value: string, aliases: Readonly<Record<string, readonly string[]>>): string {
  let normalized = ` ${normalize(value)} `;
  for (const [canonical, variants] of Object.entries(aliases)) {
    for (const variant of [canonical, ...variants].sort((left, right) => right.length - left.length)) {
      normalized = normalized.replace(new RegExp(`\\b${normalize(variant).replace(/ /gu, '\\s+')}\\b`, 'gu'), canonical);
    }
  }
  return normalize(normalized);
}

function outcome(findings: readonly CraftComplianceFinding[]): CraftComplianceResult['status'] {
  if (findings.some(({ severity }) => severity === 'ERROR')) return 'REJECTED';
  if (findings.some(({ severity }) => severity === 'REVIEW')) return 'REVIEW_REQUIRED';
  if (findings.some(({ severity }) => severity === 'WARNING')) return 'PASS_WITH_WARNINGS';
  return 'PASS';
}

export function validateDraftCraftCompliance(input: Readonly<{
  draft: DraftLike;
  facts: readonly CraftFact[];
  craft: CraftInstructionProjection;
  productIntelligencePriorityFieldIds?: readonly string[];
  structuredFactBlock?: Readonly<{
    required: boolean;
    fields: readonly Readonly<{ label: string; factIds: readonly string[]; required: boolean }>[];
  }>;
  featureTargetCount?: number;
}>): CraftComplianceResult {
  const findings: CraftComplianceFinding[] = [];
  const add = (code: string, severity: CraftFindingSeverity, section: CraftSection, field: string, message: string, factIds: readonly string[], ruleId: string, suggestedResolution: string) => findings.push({
    code, severity, section, field, message, relatedFactIds: [...new Set(factIds)], craftRuleId: ruleId,
    craftPackId: input.craft.packId, craftPackVersion: input.craft.packVersion,
    reviewRequired: severity === 'REVIEW' || severity === 'ERROR', suggestedResolution,
  });
  const title = normalize(input.draft.title.value);
  const fieldAliases: Readonly<Record<string, readonly string[]>> = {
    BRAND: ['brand'], PRODUCT_TYPE: ['product_type', 'type'], SIZE_OR_CAPACITY: ['size', 'screen_size', 'capacity'],
    PRIMARY_TECHNOLOGY: ['technology', 'resolution', 'display_technology'], MODEL: ['model', 'model_number'],
  };
  let previousIndex = -1;
  for (const component of input.craft.titleCraftRules.componentOrder) {
    const fact = input.facts.find(({ fieldId }) => fieldId ? fieldAliases[component]?.includes(fieldId) : false);
    if (!fact || !title.includes(normalize(fact.value))) continue;
    const index = title.indexOf(normalize(fact.value));
    if (index < previousIndex) add('TITLE_COMPONENT_ORDER', 'REVIEW', 'TITLE', 'title', 'Verified title components do not follow the selected Craft Pack order.', [fact.factId], 'neovix.title.identity-order', 'Move verified identity components into the configured order.');
    previousIndex = Math.max(previousIndex, index);
  }
  for (const fieldId of input.craft.identityRules.protectedFields) {
    const fact = input.facts.find((candidate) => candidate.fieldId === fieldId && ['VERIFIED', 'CONFIRMED'].includes(candidate.truthStatus ?? candidate.status ?? ''));
    if (fact && ['brand', 'model'].includes(fieldId) && !title.includes(normalize(fact.value))) {
      add('MISSING_REQUIRED_TITLE_COMPONENT', 'REVIEW', 'TITLE', 'title', `${fieldId === 'brand' ? 'Brand' : 'Model'} is verified but missing from the title.`, [fact.factId], 'neovix.title.identity-order', `Restore the verified ${fieldId}.`);
    }
  }
  if (!input.craft.titleCraftRules.allowCommas && input.draft.title.value.includes(',')) add('TITLE_COMPONENT_ORDER', 'WARNING', 'TITLE', 'title', 'The selected Craft Pack avoids commas unless the merchant profile permits them.', input.draft.title.factIds, 'neovix.title.identity-order', 'Use the merchant-approved separator.');
  const titleTokens = words(input.draft.title.value);
  if (new Set(titleTokens).size < titleTokens.length - 1) add('TITLE_DUPLICATE_COMPONENT', 'WARNING', 'TITLE', 'title', 'The title may repeat a semantic component.', input.draft.title.factIds, 'neovix.title.no-duplicates', 'Remove the lower-priority duplicate component.');
  if (input.draft.title.value.length > input.craft.titleCraftRules.preferredCharacterRange.maximum) add('NEOVIX_TITLE_STUFFING', 'WARNING', 'TITLE', 'title', 'The title is longer than the NEOVIX preferred maximum and may contain low-value components.', input.draft.title.factIds, 'neovix.title.no-duplicates', 'Keep verified identity and only the highest-value differentiators.');

  const prohibited = [...input.craft.wordingRules.prohibitedAbsoluteTerms, ...input.craft.wordingRules.prohibitedEmptyAdjectives];
  const allText = [input.draft.title.value, input.draft.overview.value, ...input.draft.features.map(({ value }) => value)];
  const prohibitedTerm = prohibited.find((term) => allText.some((value) => new RegExp(`\\b${normalize(term).replace(/ /gu, '\\s+')}\\b`, 'u').test(normalize(value))));
  if (prohibitedTerm) add('PROHIBITED_MARKETING_LANGUAGE', 'REVIEW', 'CROSS_SECTION', 'draft', `Promotional wording (“${prohibitedTerm}”) conflicts with the selected Craft Pack.`, [], 'neovix.wording.restrained', 'Remove the promotional term or replace it with a verified factual statement.');

  for (const [index, specification] of input.draft.specifications.entries()) {
    if (specification.value.length > input.craft.specificationCraftRules.maximumValueLength) {
      add('SPECIFICATION_PROSE_TOO_LONG', 'WARNING', 'SPECIFICATIONS', `specifications.${index}`, 'A specification value is too long for a scan-friendly specification row.', specification.factIds, 'neovix.specifications.exact-facts', 'Shorten the row to its exact factual value.');
      add('NEOVIX_FACT_VALUE_TOO_LONG', 'WARNING', 'SPECIFICATIONS', `specifications.${index}`, 'A structured fact value is too long for the NEOVIX scan-first format.', specification.factIds, 'neovix.specifications.exact-facts', 'Use concise exact values rather than prose.');
    }
    const cited = specification.factIds.map((id) => input.facts.find(({ factId }) => factId === id)).filter((fact): fact is CraftFact => Boolean(fact));
    if (!cited.length || cited.some((fact) => !normalize(specification.value).includes(normalize(fact.value)))) add('NEOVIX_UNSUPPORTED_CLAIM', 'ERROR', 'SPECIFICATIONS', `specifications.${index}`, 'A structured fact row is not fully supported by its cited Product Truth facts.', specification.factIds, 'neovix.specifications.exact-facts', 'Use only exact selected fact values in the row.');
  }
  if ((input.structuredFactBlock?.required ?? true) && input.draft.specifications.length === 0) add('NEOVIX_FACT_BLOCK_MISSING', 'REVIEW', 'SPECIFICATIONS', 'specifications', 'The NEOVIX structured fact block is missing.', [], 'neovix.specifications.exact-facts', 'Add the available verified facts before the overview.');
  const expectedFields = input.structuredFactBlock?.fields ?? input.craft.specificationCraftRules.fieldGroups.flatMap((group) => {
    const factIds = input.facts.filter(({ fieldId }) => fieldId && group.fieldIds.includes(fieldId)).map(({ factId }) => factId);
    return factIds.length ? [{ label: group.label, factIds, required: false }] : [];
  });
  const expectedOrder = new Map(expectedFields.map(({ label }, index) => [normalize(label), index]));
  const omittedRequired = expectedFields.filter(({ label, factIds, required }) => required && factIds.length > 0 && !input.draft.specifications.some((item) => normalize(item.label) === normalize(label)));
  if (omittedRequired.length) add('NEOVIX_FACT_BLOCK_MISSING', 'REVIEW', 'SPECIFICATIONS', 'specifications', `Required structured fact groups were omitted: ${omittedRequired.map(({ label }) => label).join(', ')}.`, omittedRequired.flatMap(({ factIds }) => factIds), 'neovix.specifications.exact-facts', 'Add the required verified groups in the prescribed order.');
  const actualOrder = input.draft.specifications.map(({ label }) => expectedOrder.get(normalize(label))).filter((value): value is number => value !== undefined);
  if (actualOrder.some((value, index) => index > 0 && value < actualOrder[index - 1]!)) add('NEOVIX_FACT_LABEL_ORDER', 'REVIEW', 'SPECIFICATIONS', 'specifications', 'Structured fact labels do not follow the NEOVIX order.', input.draft.specifications.flatMap(({ factIds }) => factIds), 'neovix.specifications.exact-facts', 'Order available rows according to the structured fact-block contract.');
  const missingRequired = expectedFields.filter(({ label, required, factIds }) => required && factIds.length === 0 && !input.draft.specifications.some((item) => normalize(item.label) === normalize(label)));
  if (missingRequired.length) add('NEOVIX_REQUIRED_FACT_REVIEW', 'REVIEW', 'SPECIFICATIONS', 'specifications', `Required structured facts need review: ${missingRequired.map(({ label }) => label).join(', ')}.`, [], 'neovix.specifications.exact-facts', 'Add verified values or confirm that the fields are not applicable.');
  const specificationKeys = input.draft.specifications.map(({ value }) => semanticKey(value, input.craft.duplicationRules.semanticAliases));
  if (new Set(specificationKeys).size !== specificationKeys.length) add('SPECIFICATION_DUPLICATE_VALUE', 'WARNING', 'SPECIFICATIONS', 'specifications', 'The same specification value appears more than once.', [], 'neovix.specifications.exact-facts', 'Keep the value under its most specific label.');

  const paragraphs = input.draft.overview.value.split(/\n\s*\n/gu).filter((paragraph) => paragraph.trim());
  if (paragraphs.length !== input.craft.overviewCraftRules.preferredParagraphCount) add('OVERVIEW_PARAGRAPH_COUNT', 'WARNING', 'OVERVIEW', 'overview', `The selected Craft Pack prefers ${input.craft.overviewCraftRules.preferredParagraphCount} concise paragraphs.`, input.draft.overview.factIds, 'neovix.overview.concise', 'Separate identity and main technology from secondary functions and design.');
  if (normalize(input.draft.overview.value).startsWith(title) && title.length > 0) add('OVERVIEW_REPEATS_TITLE', 'WARNING', 'OVERVIEW', 'overview', 'The overview repeats the complete title.', input.draft.overview.factIds, 'neovix.duplication.semantic', 'Open with a concise product identity rather than the full title.');
  if (input.draft.overview.value.length > input.craft.overviewCraftRules.maximumCharacters) add('NEOVIX_OVERVIEW_TOO_LONG', 'WARNING', 'OVERVIEW', 'overview', 'The overview exceeds the NEOVIX concise commercial format.', input.draft.overview.factIds, 'neovix.overview.concise', 'Use one or two short factual paragraphs.');
  const opening = input.craft.overviewCraftRules.prohibitedOpenings.find((value) => normalize(input.draft.overview.value).startsWith(normalize(value)));
  if (opening) add('NEOVIX_GENERIC_AI_OPENING', 'REVIEW', 'OVERVIEW', 'overview', `The overview starts with generic promotional wording (${opening}).`, input.draft.overview.factIds, 'neovix.wording.restrained', 'Open directly with verified product identity and function.');

  const featureKeys = input.draft.features.map(({ value }) => semanticKey(value, input.craft.duplicationRules.semanticAliases));
  const duplicateFeature = featureKeys.find((key, index) => featureKeys.indexOf(key) !== index);
  if (duplicateFeature) add('FEATURE_SEMANTIC_DUPLICATE', 'WARNING', 'FEATURES', 'features', 'Two features communicate the same idea.', [], 'neovix.duplication.semantic', 'Keep the clearer, higher-priority feature.');
  if (duplicateFeature) add('NEOVIX_FEATURE_DUPLICATE', 'WARNING', 'FEATURES', 'features', 'NEOVIX features contain duplicate meaning.', [], 'neovix.duplication.semantic', 'Keep one concise feature per supported concept.');
  if (input.draft.features.length < input.craft.featureCraftRules.minimumCount || input.draft.features.length > input.craft.featureCraftRules.maximumCount) add('FEATURE_COUNT_OUTSIDE_TARGET', 'WARNING', 'FEATURES', 'features', `The selected Craft Pack targets ${input.craft.featureCraftRules.minimumCount}–${input.craft.featureCraftRules.maximumCount} meaningful features when enough verified facts exist.`, [], 'neovix.features.priority', 'Use the available high-priority facts; never add filler to reach the target.');
  if (input.featureTargetCount !== undefined && input.draft.features.length !== input.featureTargetCount) add('NEOVIX_FEATURE_COUNT', 'WARNING', 'FEATURES', 'features', `The merchant Listing Style requests ${input.featureTargetCount} features.`, input.draft.features.flatMap(({ factIds }) => factIds), 'neovix.features.priority', 'Use the requested count only when enough verified facts exist; otherwise leave a review finding rather than adding filler.');
  const priorities = input.productIntelligencePriorityFieldIds ?? [];
  if (priorities.length && input.draft.features.length) {
    const firstPriorityIndex = priorities.findIndex((fieldId) => input.draft.features[0]!.factIds.some((id) => input.facts.find((fact) => fact.factId === id)?.fieldId === fieldId));
    if (firstPriorityIndex < 0) add('CATEGORY_PRIORITY_IGNORED', 'WARNING', 'FEATURES', 'features.0', 'The first feature does not use an available Product Intelligence priority.', input.draft.features[0]!.factIds, 'neovix.features.priority', 'Lead with the highest-priority verified category fact.');
    const priorityRank = new Map(priorities.map((fieldId, index) => [fieldId, index]));
    const featureRanks = input.draft.features.map(({ factIds }) => Math.min(...factIds.map((id) => priorityRank.get(input.facts.find((fact) => fact.factId === id)?.fieldId ?? '') ?? Number.MAX_SAFE_INTEGER)));
    if (featureRanks.some((rank, index) => index > 0 && rank < featureRanks[index - 1]!)) add('NEOVIX_FEATURE_PRIORITY', 'WARNING', 'FEATURES', 'features', 'Feature order does not follow the available Product Intelligence priority.', input.draft.features.flatMap(({ factIds }) => factIds), 'neovix.features.priority', 'Place higher-priority supported feature concepts first.');
  }

  const status = outcome(findings);
  return immutableCopy({
    status, packId: input.craft.packId, packVersion: input.craft.packVersion, findings,
    summary: {
      errors: findings.filter(({ severity }) => severity === 'ERROR').length,
      reviews: findings.filter(({ severity }) => severity === 'REVIEW').length,
      warnings: findings.filter(({ severity }) => severity === 'WARNING').length,
      information: findings.filter(({ severity }) => severity === 'INFO').length,
    },
  }) as CraftComplianceResult;
}
