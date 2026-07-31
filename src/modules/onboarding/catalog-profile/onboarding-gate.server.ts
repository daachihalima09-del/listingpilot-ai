import 'server-only';

import { prisma } from '@/lib/prisma';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';

export function merchantCatalogProfilePath(workspaceId: string): string {
  return `/onboarding/catalog-profile?${new URLSearchParams({ workspaceId })}`;
}

export function merchantListingStandardPath(workspaceId: string): string {
  return `/onboarding/listing-standard?${new URLSearchParams({ workspaceId })}`;
}

export function merchantListingProfilePath(workspaceId: string): string {
  return `/onboarding/listing-profile?${new URLSearchParams({ workspaceId })}`;
}

export async function returnPathAfterShopifyConnection(
  workspaceId: string,
  completedProfileReturnPath: string,
): Promise<string> {
  const completion = await createServerMerchantPreferenceService()
    .getCompletion(workspaceId);
  if (!completion.catalogComplete) return merchantCatalogProfilePath(workspaceId);
  if (!completion.listingStandardSelected) return merchantListingStandardPath(workspaceId);
  return completion.listingComplete
    ? completedProfileReturnPath
    : merchantListingProfilePath(workspaceId);
}

export async function catalogProfileOnboardingPathIfRequired(
  workspaceId: string,
): Promise<string | null> {
  const [completion, store] = await Promise.all([
    createServerMerchantPreferenceService().getCompletion(workspaceId),
    prisma.shopifyStore.findUnique({
      where: { workspaceId },
      select: {
        status: true,
        accessTokenEncrypted: true,
      },
    }),
  ]);
  const connected = Boolean(
    store
    && ['CONNECTED', 'ACTIVE'].includes(store.status)
    && store.accessTokenEncrypted,
  );
  return connected && !completion.catalogComplete
    ? merchantCatalogProfilePath(workspaceId)
    : null;
}

export async function merchantBusinessProfileOnboardingPathIfRequired(
  workspaceId: string,
): Promise<string | null> {
  const [completion, store] = await Promise.all([
    createServerMerchantPreferenceService().getCompletion(workspaceId),
    prisma.shopifyStore.findUnique({
      where: { workspaceId },
      select: { status: true, accessTokenEncrypted: true },
    }),
  ]);
  const connected = Boolean(
    store
    && ['CONNECTED', 'ACTIVE'].includes(store.status)
    && store.accessTokenEncrypted,
  );
  if (!connected || completion.catalogComplete && completion.listingComplete) {
    return null;
  }
  if (!completion.catalogComplete) return merchantCatalogProfilePath(workspaceId);
  return completion.listingStandardSelected
    ? merchantListingProfilePath(workspaceId)
    : merchantListingStandardPath(workspaceId);
}
