import 'server-only';

import { createMerchantPreferenceRegistry } from './default-registry';
import { prismaMerchantBusinessProfileRepository } from './prisma-repository.server';
import { createMerchantPreferenceService } from './service';

export function createServerMerchantPreferenceService() {
  return createMerchantPreferenceService(
    prismaMerchantBusinessProfileRepository,
    createMerchantPreferenceRegistry(),
  );
}
