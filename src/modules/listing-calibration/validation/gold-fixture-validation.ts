import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import { factValueIsRepresented, unsupportedFactualTokens } from '../../generation-instructions/domain/fact-fidelity.ts';
import type { GoldTextField, NeovixGoldFixture } from '../domain/contracts.ts';
import { GOLD_FIXTURE_SCHEMA_VERSION, GOLD_FIXTURE_VERSION } from '../domain/contracts.ts';
import { ListingCalibrationError } from '../domain/errors.ts';
import { goldFixtureSchema } from './gold-fixture-schema.ts';

export function semanticGoldFixtureValue(fixture: NeovixGoldFixture): unknown {
  const semantic = { ...fixture } as Record<string, unknown>;
  for (const key of ['fixtureId', 'version', 'approvalStatus', 'approvedBy', 'approvedAt', 'createdBy', 'createdAt', 'updatedAt', 'fingerprint', 'metadata']) delete semantic[key];
  return semantic;
}

export function goldFixtureFingerprint(fixture: NeovixGoldFixture): string {
  return new DeterministicHasher().hash(semanticGoldFixtureValue(fixture));
}

function factualFields(fixture: NeovixGoldFixture): readonly GoldTextField[] {
  return [fixture.expectedTitle, fixture.expectedOverview, ...fixture.expectedSpecifications, ...fixture.expectedFeatures, fixture.expectedSeo.title, fixture.expectedSeo.description, fixture.expectedSeo.handle];
}

export function unsupportedFixtureClaims(fixture: NeovixGoldFixture): readonly string[] {
  const facts = new Map(fixture.productTruthFacts.map((fact) => [fact.factId, fact.value]));
  const overrides = fixture.merchantOverrides.map(({ value }) => value);
  const unsupported = new Set<string>();
  for (const field of factualFields(fixture)) {
    const evidence = [...field.factIds.map((id) => facts.get(id) ?? ''), ...overrides];
    if (field.factIds.some((id) => !facts.has(id))) unsupported.add('UNKNOWN_FACT_REFERENCE');
    for (const token of unsupportedFactualTokens(field.value, evidence)) unsupported.add(token);
  }
  for (const specification of fixture.expectedSpecifications) {
    const supported = (specification.factIds.length > 0 && specification.factIds.every((id) => {
      const value = facts.get(id);
      return value ? factValueIsRepresented(specification.value, value) : false;
    })) || overrides.some((value) => factValueIsRepresented(specification.value, value));
    if (!supported) unsupported.add(`SPECIFICATION:${specification.label}`);
  }
  return [...unsupported].sort();
}

export function validateGoldFixture(value: unknown, options: { requireApprovable?: boolean } = {}): NeovixGoldFixture {
  const parsed = goldFixtureSchema.safeParse(value);
  if (!parsed.success) {
    const error = new ListingCalibrationError('INVALID_GOLD_FIXTURE', 'The Gold Fixture is incomplete or malformed.');
    Object.defineProperty(error, 'cause', { value: parsed.error, enumerable: false });
    throw error;
  }
  const fixture = parsed.data as NeovixGoldFixture;
  if (fixture.schemaVersion !== GOLD_FIXTURE_SCHEMA_VERSION || fixture.fixtureVersion !== GOLD_FIXTURE_VERSION) throw new ListingCalibrationError('UNSUPPORTED_FIXTURE_VERSION', 'The Gold Fixture version is unsupported.', 409);
  if (goldFixtureFingerprint(fixture) !== fixture.fingerprint) throw new ListingCalibrationError('FIXTURE_FINGERPRINT_MISMATCH', 'The Gold Fixture fingerprint is invalid.', 409);
  const unsupported = unsupportedFixtureClaims(fixture);
  if ((options.requireApprovable || fixture.approvalStatus === 'APPROVED') && unsupported.length) throw new ListingCalibrationError('FACT_NOT_SUPPORTED_BY_TRUTH', 'Resolve unsupported factual content before approving this Gold Fixture.', 409);
  return immutableCopy(fixture) as NeovixGoldFixture;
}
