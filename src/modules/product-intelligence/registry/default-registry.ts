import { televisionIntelligencePack } from '../packs/television/television-pack.ts';
import { createProductIntelligenceRegistry } from './product-intelligence-registry.ts';

export const defaultProductIntelligenceRegistry = createProductIntelligenceRegistry([
  televisionIntelligencePack,
]).freeze();
