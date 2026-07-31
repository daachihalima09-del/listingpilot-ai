import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { IntelligenceReportContributor } from '../engine/report-contributor.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import { createCatalogHealthCapabilityPack } from './capability.ts';
import {
  createCatalogHealthConfiguration,
  type CatalogHealthConfiguration,
  type CatalogHealthConfigurationInput,
} from './configuration.ts';
import { CatalogHealthReportContributor } from './integration.ts';
import { CatalogHealthReportBuilder } from './report.ts';

export interface CatalogHealthBundle {
  readonly configuration: CatalogHealthConfiguration;
  readonly capabilityPack: CapabilityPack;
  readonly reportBuilder: CatalogHealthReportBuilder;
  readonly reportContributor: IntelligenceReportContributor;
}

export function createCatalogHealthBundle(input: {
  readonly hasher: IntelligenceHasher;
  readonly configuration?: CatalogHealthConfigurationInput;
}): CatalogHealthBundle {
  const configuration = createCatalogHealthConfiguration(input.configuration);
  const reportBuilder = new CatalogHealthReportBuilder({
    configuration,
    hasher: input.hasher,
  });
  return Object.freeze({
    configuration,
    capabilityPack: createCatalogHealthCapabilityPack(),
    reportBuilder,
    reportContributor: new CatalogHealthReportContributor(reportBuilder),
  });
}
