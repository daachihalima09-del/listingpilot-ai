import { randomUUID } from 'node:crypto';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type {
  CalibrationFinding, CalibrationSection, CalibrationSectionScore, CalibrationSeverity,
  ListingCalibrationInput, ListingCalibrationReport, MerchantEditClassification,
} from '../domain/contracts.ts';
import { CALIBRATION_REPORT_SCHEMA_VERSION, CALIBRATION_REPORT_VERSION } from '../domain/contracts.ts';

const normalize = (value: string) => value.toLocaleLowerCase('en-US').normalize('NFKC').replace(/\btelevision\b/gu, 'tv').replace(/\bultra hd\b|\buhd 4k\b/gu, '4k uhd').replace(/[^a-z0-9]+/gu, ' ').trim();
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];
const comparable = (left: string, right: string) => normalize(left) === normalize(right) || normalize(left).includes(normalize(right)) || normalize(right).includes(normalize(left));

function finding(input: Omit<CalibrationFinding, 'findingId'>): CalibrationFinding {
  return { findingId: `calibration_finding_${new DeterministicHasher().hash(input)}`, ...input };
}
function penalty(severity: CalibrationSeverity): number { return { INFO: 0, LOW: 3, MEDIUM: 8, HIGH: 16, CRITICAL: 35 }[severity]; }
function add(findings: CalibrationFinding[], input: Omit<CalibrationFinding, 'findingId' | 'scorePenalty'> & { scorePenalty?: number }) {
  findings.push(finding({ ...input, scorePenalty: input.scorePenalty ?? penalty(input.severity) }));
}
function exceptionFor(input: ListingCalibrationInput, field: string) {
  return input.goldFixture.productSpecificExceptions.find((exception) => exception.merchantApproved && exception.affectedFields.some((affected) => field === affected || field.startsWith(`${affected}.`)));
}
function exceptionWasApplied(input: ListingCalibrationInput, exception: ListingCalibrationInput['goldFixture']['productSpecificExceptions'][number]): boolean {
  return exception.affectedFields.some((field) => {
    if (field === 'overview.paragraphs') return input.draft.overview.value.split(/\n\s*\n/gu).filter(Boolean).length !== input.goldFixture.expectedOverview.value.split(/\n\s*\n/gu).filter(Boolean).length;
    if (field === 'features.count') return input.draft.features.length !== input.goldFixture.expectedFeatures.length;
    if (field === 'title.length') return input.draft.title.value.length > input.craftPackReference.rules.titleCraftRules.preferredCharacterRange.maximum;
    if (field.startsWith('specifications.')) {
      const label = normalize(field.slice('specifications.'.length));
      return !input.draft.specifications.some((item) => normalize(item.label) === label);
    }
    return false;
  });
}
function sectionScore(section: CalibrationSection, weight: number, findings: readonly CalibrationFinding[]): CalibrationSectionScore {
  const relevant = findings.filter((item) => item.section === section);
  return { score: Math.max(0, 100 - relevant.reduce((sum, item) => sum + item.scorePenalty, 0)), weight, factors: relevant.length ? relevant.map(({ message }) => message) : ['No material differences found.'] };
}

function compareTitle(input: ListingCalibrationInput, findings: CalibrationFinding[]) {
  const expected = input.goldFixture.expectedTitle;
  const actual = input.draft.title;
  const identityFields = ['brand', 'product_type', 'size', 'screen_size', 'capacity', 'model', 'model_suffix', 'region'];
  const facts = input.goldFixture.productTruthFacts
    .filter(({ fieldId, value }) => identityFields.includes(fieldId) && normalize(expected.value).includes(normalize(value)))
    .sort((left, right) => normalize(expected.value).indexOf(normalize(left.value)) - normalize(expected.value).indexOf(normalize(right.value)));
  let previous = -1;
  for (const fact of facts) {
    const actualIndex = normalize(actual.value).indexOf(normalize(fact.value));
    if (actualIndex < 0) {
      const critical = ['model', 'model_suffix', 'region', 'screen_size', 'size', 'capacity'].includes(fact.fieldId);
      add(findings, { section: critical ? 'IDENTITY' : 'TITLE', field: 'title', differenceType: critical ? 'IDENTITY_CONFLICT' : 'MISSING_EXPECTED_CONTENT', severity: critical ? 'CRITICAL' : 'HIGH', message: `The generated title does not preserve expected ${fact.fieldId.replaceAll('_', ' ')} identity.`, expected: fact.value, actual: actual.value, relatedFactIds: [fact.factId], craftRuleId: 'neovix.identity.preserved', reusableSignal: !critical, productSpecific: false });
    }
    if (actualIndex >= 0 && actualIndex < previous) add(findings, { section: 'TITLE', field: 'title', differenceType: 'STRUCTURAL_DIFFERENCE', severity: 'HIGH', message: 'Title identity components do not follow the approved NEOVIX order.', expected: expected.value, actual: actual.value, relatedFactIds: actual.factIds, craftRuleId: 'neovix.title.identity-order', reusableSignal: true, productSpecific: false });
    previous = Math.max(previous, actualIndex);
  }
  const titleMaximum = input.craftPackReference.rules.titleCraftRules.preferredCharacterRange.maximum;
  if (actual.value.length > titleMaximum && !exceptionFor(input, 'title.length')) add(findings, { section: 'TITLE', field: 'title', differenceType: 'STRUCTURAL_DIFFERENCE', severity: 'MEDIUM', message: 'The generated title exceeds the preferred NEOVIX range.', expected: `${titleMaximum} characters or fewer`, actual: `${actual.value.length} characters`, relatedFactIds: actual.factIds, craftRuleId: 'neovix.title.identity-order', reusableSignal: true, productSpecific: false });
  if (!comparable(expected.value, actual.value)) add(findings, { section: 'TITLE', field: 'title', differenceType: 'ACCEPTABLE_VARIATION', severity: 'LOW', message: 'Title wording differs while preserving supported identity.', expected: expected.value, actual: actual.value, relatedFactIds: actual.factIds, craftRuleId: null, reusableSignal: false, productSpecific: false });
}

function compareSpecifications(input: ListingCalibrationInput, findings: CalibrationFinding[]) {
  const expected = new Map(input.goldFixture.expectedSpecifications.map((item) => [normalize(item.label), item]));
  const actual = new Map(input.draft.specifications.map((item) => [normalize(item.label), item]));
  for (const [label, target] of expected) {
    const candidate = actual.get(label);
    if (!candidate) {
      if (exceptionFor(input, `specifications.${label}`)) add(findings, { section: 'SPECIFICATIONS', field: `specifications.${label}`, differenceType: 'PRODUCT_SPECIFIC_EXCEPTION', severity: 'INFO', message: `Approved fixture exception allows the ${target.label} specification to be omitted.`, expected: target.value, actual: null, relatedFactIds: target.factIds, craftRuleId: null, reusableSignal: false, productSpecific: true });
      else add(findings, { section: 'SPECIFICATIONS', field: `specifications.${label}`, differenceType: 'MISSING_EXPECTED_CONTENT', severity: 'HIGH', message: `Required specification “${target.label}” is missing.`, expected: target.value, actual: null, relatedFactIds: target.factIds, craftRuleId: 'neovix.specifications.exact-facts', reusableSignal: true, productSpecific: false });
    } else if (!comparable(candidate.value, target.value)) add(findings, { section: ['model', 'size', 'capacity'].includes(label) ? 'IDENTITY' : 'SPECIFICATIONS', field: `specifications.${label}`, differenceType: ['model', 'size', 'capacity'].includes(label) ? 'IDENTITY_CONFLICT' : 'FACTUAL_CONFLICT', severity: 'CRITICAL', message: `Specification “${target.label}” conflicts with the approved reference.`, expected: target.value, actual: candidate.value, relatedFactIds: unique([...target.factIds, ...candidate.factIds]), craftRuleId: 'neovix.specifications.exact-facts', reusableSignal: false, productSpecific: false });
  }
  const values = input.draft.specifications.map(({ value }) => normalize(value));
  if (new Set(values).size !== values.length) add(findings, { section: 'SPECIFICATIONS', field: 'specifications', differenceType: 'DUPLICATION', severity: 'HIGH', message: 'A specification value is duplicated across multiple rows.', expected: null, actual: null, relatedFactIds: [], craftRuleId: 'neovix.specifications.exact-facts', reusableSignal: true, productSpecific: false });
  if (input.draft.specifications.some(({ value }) => /^(n\/?a|unknown|tbd|-)$/iu.test(value.trim()))) add(findings, { section: 'SPECIFICATIONS', field: 'specifications', differenceType: 'UNEXPECTED_CONTENT', severity: 'HIGH', message: 'Specifications contain an unresolved placeholder.', expected: 'Verified value or omission', actual: 'Placeholder', relatedFactIds: [], craftRuleId: 'neovix.specifications.exact-facts', reusableSignal: true, productSpecific: false });
}

function compareOverview(input: ListingCalibrationInput, findings: CalibrationFinding[]) {
  const actualParagraphs = input.draft.overview.value.split(/\n\s*\n/gu).filter(Boolean);
  const expectedParagraphs = input.goldFixture.expectedOverview.value.split(/\n\s*\n/gu).filter(Boolean);
  if (actualParagraphs.length !== expectedParagraphs.length && !exceptionFor(input, 'overview.paragraphs')) add(findings, { section: 'OVERVIEW', field: 'overview', differenceType: 'STRUCTURAL_DIFFERENCE', severity: 'MEDIUM', message: `The overview uses ${actualParagraphs.length} paragraph(s); the approved fixture uses ${expectedParagraphs.length}.`, expected: String(expectedParagraphs.length), actual: String(actualParagraphs.length), relatedFactIds: input.draft.overview.factIds, craftRuleId: 'neovix.overview.concise', reusableSignal: true, productSpecific: false });
  if (normalize(input.draft.overview.value).startsWith(normalize(input.draft.title.value))) add(findings, { section: 'DUPLICATION', field: 'overview', differenceType: 'DUPLICATION', severity: 'MEDIUM', message: 'The overview repeats the full generated title.', expected: null, actual: input.draft.overview.value, relatedFactIds: input.draft.overview.factIds, craftRuleId: 'neovix.duplication.semantic', reusableSignal: true, productSpecific: false });
  if (input.draft.overview.value.length > Math.max(1_200, input.goldFixture.expectedOverview.value.length * 2)) add(findings, { section: 'OVERVIEW', field: 'overview', differenceType: 'STRUCTURAL_DIFFERENCE', severity: 'MEDIUM', message: 'The overview is substantially longer than the approved reference.', expected: 'Concise overview', actual: `${input.draft.overview.value.length} characters`, relatedFactIds: input.draft.overview.factIds, craftRuleId: 'neovix.overview.concise', reusableSignal: true, productSpecific: false });
}

function compareFeatures(input: ListingCalibrationInput, findings: CalibrationFinding[]) {
  const expectedKeys = input.goldFixture.expectedFeatures.map(({ value }) => normalize(value));
  const actualKeys = input.draft.features.map(({ value }) => normalize(value));
  const exception = exceptionFor(input, 'features.count');
  if (actualKeys.length !== expectedKeys.length && !exception) add(findings, { section: 'FEATURES', field: 'features', differenceType: 'STRUCTURAL_DIFFERENCE', severity: 'MEDIUM', message: 'Feature count differs from the approved Gold Fixture.', expected: String(expectedKeys.length), actual: String(actualKeys.length), relatedFactIds: input.draft.features.flatMap(({ factIds }) => factIds), craftRuleId: 'neovix.features.priority', reusableSignal: true, productSpecific: false });
  if (actualKeys.length !== new Set(actualKeys).size) add(findings, { section: 'FEATURES', field: 'features', differenceType: 'DUPLICATION', severity: 'HIGH', message: 'Generated features contain duplicate meaning.', expected: 'Unique feature concepts', actual: null, relatedFactIds: [], craftRuleId: 'neovix.duplication.semantic', reusableSignal: true, productSpecific: false });
  const missing = input.goldFixture.expectedFeatures.filter((expected) => !input.draft.features.some((actual) => comparable(actual.value, expected.value)));
  if (missing.length && !exception) add(findings, { section: 'FEATURES', field: 'features', differenceType: 'MISSING_EXPECTED_CONTENT', severity: missing.length > 2 ? 'HIGH' : 'MEDIUM', message: `${missing.length} approved feature concept(s) are missing.`, expected: missing.map(({ value }) => value).join('; '), actual: null, relatedFactIds: missing.flatMap(({ factIds }) => factIds), craftRuleId: 'neovix.features.priority', reusableSignal: true, productSpecific: false });
  const priorityFactId = input.productIntelligenceReference ? input.goldFixture.expectedFeatures[0]?.factIds[0] : undefined;
  const priorityFact = priorityFactId ? input.goldFixture.productTruthFacts.find(({ factId }) => factId === priorityFactId) : undefined;
  if (priorityFact && input.draft.features.length && !input.draft.features[0]!.factIds.includes(priorityFact.factId)) add(findings, { section: 'FEATURES', field: 'features.0', differenceType: 'PRIORITY_MISMATCH', severity: 'MEDIUM', message: 'The feature order does not lead with the available category priority.', expected: priorityFact.value, actual: input.draft.features[0]!.value, relatedFactIds: input.draft.features[0]!.factIds, craftRuleId: 'neovix.features.priority', reusableSignal: true, productSpecific: false });
}

function compareWording(input: ListingCalibrationInput, findings: CalibrationFinding[]) {
  const text = [input.draft.title.value, input.draft.overview.value, ...input.draft.features.map(({ value }) => value)].join(' ');
  const prohibited = [...input.craftPackReference.rules.wordingRules.prohibitedAbsoluteTerms, ...input.craftPackReference.rules.wordingRules.prohibitedEmptyAdjectives].find((term) => new RegExp(`\\b${normalize(term)}\\b`, 'u').test(normalize(text)));
  if (prohibited) add(findings, { section: 'WORDING', field: 'draft', differenceType: 'PROHIBITED_LANGUAGE', severity: 'HIGH', message: `Promotional wording “${prohibited}” conflicts with the NEOVIX standard.`, expected: 'Restrained factual wording', actual: prohibited, relatedFactIds: [], craftRuleId: 'neovix.wording.restrained', reusableSignal: true, productSpecific: false });
}

export function classifyMerchantEdits(input: ListingCalibrationInput): readonly MerchantEditClassification[] {
  const facts = new Set(input.goldFixture.productTruthFacts.map(({ factId }) => factId));
  return input.merchantEdits.map((field) => {
    const exception = exceptionFor(input, field);
    if (exception) return { field, type: 'PRODUCT_SPECIFIC_EXCEPTION' as const, explanation: exception.reason, reusableSignal: false, relatedFactIds: [] };
    if (input.lockedFields.includes(field)) return { field, type: 'LOCKED_CONTENT_PREFERENCE' as const, explanation: 'The merchant explicitly protected this field.', reusableSignal: false, relatedFactIds: [] };
    if (field.startsWith('seo.')) return { field, type: 'SEO_ONLY_CHANGE' as const, explanation: 'The edit changes SEO output only.', reusableSignal: false, relatedFactIds: [] };
    if (field.startsWith('catalog.')) return { field, type: 'CATALOG_ONLY_CHANGE' as const, explanation: 'The edit changes catalog classification only.', reusableSignal: false, relatedFactIds: [] };
    const trace = input.reviewWorkspaceState?.traceability.find((item) => item.fieldKey === field);
    if (trace?.factIds.some((id) => !facts.has(id))) return { field, type: 'UNSUPPORTED_FACT_ADDITION' as const, explanation: 'The edit references content outside the fixture Product Truth boundary.', reusableSignal: false, relatedFactIds: trace.factIds };
    const structural = ['title', 'overview', 'specifications', 'features'].some((prefix) => field === prefix);
    return { field, type: structural ? 'STRUCTURAL_IMPROVEMENT' as const : 'STYLE_PREFERENCE' as const, explanation: structural ? 'The edit changes listing structure and may be reusable after repeated evidence.' : 'The edit is a presentation preference.', reusableSignal: structural, relatedFactIds: trace?.factIds ?? [] };
  });
}

export function calibrationReportFingerprint(report: ListingCalibrationReport): string {
  const semantic = { ...report } as Record<string, unknown>;
  for (const key of ['reportId', 'version', 'createdAt', 'fingerprint']) delete semantic[key];
  return new DeterministicHasher().hash(JSON.parse(JSON.stringify(semantic)) as unknown);
}

export function calibrateListingDraft(input: ListingCalibrationInput, options: { now?: () => string; reportId?: string } = {}): ListingCalibrationReport {
  const findings: CalibrationFinding[] = [];
  const validIdentity = input.workspaceId === input.goldFixture.workspaceId && input.projectId === input.goldFixture.sourceProjectId && input.draft.projectId === input.projectId;
  if (!validIdentity) add(findings, { section: 'IDENTITY', field: 'comparison', differenceType: 'IDENTITY_CONFLICT', severity: 'CRITICAL', message: 'Calibration identities do not belong to the same workspace and project.', expected: input.goldFixture.sourceProjectId, actual: input.projectId, relatedFactIds: [], craftRuleId: null, reusableSignal: false, productSpecific: false });
  compareTitle(input, findings); compareSpecifications(input, findings); compareOverview(input, findings); compareFeatures(input, findings); compareWording(input, findings);
  if (input.goldFixture.craftPackVersion !== input.craftPackReference.version) add(findings, { section: 'WORDING', field: 'craftPackVersion', differenceType: 'MERCHANT_PREFERENCE_DIFFERENCE', severity: 'LOW', message: 'The Gold Fixture uses a different Craft Pack version.', expected: input.goldFixture.craftPackVersion, actual: input.craftPackReference.version, relatedFactIds: [], craftRuleId: null, reusableSignal: false, productSpecific: false });
  const classifications = classifyMerchantEdits(input);
  const score = {
    titleScore: sectionScore('TITLE', 0.2, findings), specificationScore: sectionScore('SPECIFICATIONS', 0.2, findings), overviewScore: sectionScore('OVERVIEW', 0.15, findings), featureScore: sectionScore('FEATURES', 0.2, findings), identityScore: sectionScore('IDENTITY', 0.1, findings), duplicationScore: sectionScore('DUPLICATION', 0.1, findings), wordingScore: sectionScore('WORDING', 0.05, findings),
  };
  const overall = Math.round(Object.values(score).reduce((sum, item) => sum + item.score * item.weight, 0));
  const blocked = findings.some(({ severity, differenceType }) => severity === 'CRITICAL' && ['FACTUAL_CONFLICT', 'IDENTITY_CONFLICT'].includes(differenceType));
  const status = !validIdentity ? 'INVALID_COMPARISON' : blocked ? 'BLOCKED' : overall >= 95 ? 'EXCELLENT_MATCH' : overall >= 80 ? 'GOOD_MATCH' : overall >= 60 ? 'NEEDS_CALIBRATION' : 'POOR_MATCH';
  const createdAt = (options.now ?? (() => new Date().toISOString()))();
  const base = {
    reportId: options.reportId ?? randomUUID(),
    schemaVersion: CALIBRATION_REPORT_SCHEMA_VERSION, reportVersion: CALIBRATION_REPORT_VERSION, version: 1, workspaceId: input.workspaceId, fixtureId: input.goldFixture.fixtureId, projectId: input.projectId, draftId: input.draft.draftId,
    craftPackId: input.craftPackReference.id, craftPackVersion: input.craftPackReference.version, overallScore: overall, sectionScores: { overall, ...score }, status, findings,
    matchedBehaviors: input.goldFixture.requiredBehaviors.filter((behavior) => !findings.some(({ message }) => normalize(message).includes(normalize(behavior)))), missedBehaviors: input.goldFixture.requiredBehaviors.filter((behavior) => findings.some(({ message }) => normalize(message).includes(normalize(behavior)))),
    prohibitedBehaviorMatches: input.goldFixture.prohibitedBehaviors.filter((behavior) => normalize([input.draft.title.value, input.draft.overview.value, ...input.draft.features.map(({ value }) => value)].join(' ')).includes(normalize(behavior))),
    productSpecificExceptionsApplied: input.goldFixture.productSpecificExceptions.filter((exception) => exception.merchantApproved && exceptionWasApplied(input, exception)).map(({ exceptionId }) => exceptionId), merchantEditClassifications: classifications, ruleAdjustmentProposals: [],
    reviewRequirements: findings.filter(({ severity }) => ['HIGH', 'CRITICAL'].includes(severity)).map(({ message }) => message), createdAt,
    metadata: { fixtureFingerprint: input.goldFixture.fingerprint, productTruthFingerprint: input.productTruthReference.fingerprint, craftVersionMismatch: input.goldFixture.craftPackVersion !== input.craftPackReference.version },
  };
  const report = { ...base, fingerprint: '' } as ListingCalibrationReport;
  return immutableCopy({ ...report, fingerprint: calibrationReportFingerprint(report) }) as ListingCalibrationReport;
}
