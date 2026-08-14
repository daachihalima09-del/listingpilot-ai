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

export function merchantSeoProfilePath(workspaceId: string): string {
  return `/onboarding/seo-profile?${new URLSearchParams({ workspaceId })}`;
}

export function merchantPublishingProfilePath(workspaceId: string): string {
  return `/onboarding/publishing-profile?${new URLSearchParams({ workspaceId })}`;
}

export function merchantAiProfilePath(workspaceId: string): string {
  return `/onboarding/ai-profile?${new URLSearchParams({ workspaceId })}`;
}

export async function returnPathAfterShopifyConnection(
  workspaceId: string,
  completedProfileReturnPath: string,
): Promise<string> {
  const completion = await createServerMerchantPreferenceService()
    .getCompletion(workspaceId);
  if (!completion.catalogComplete) return merchantCatalogProfilePath(workspaceId);
  if (!completion.listingStandardSelected) return merchantListingStandardPath(workspaceId);
  if (!completion.listingComplete) return merchantListingProfilePath(workspaceId);
  if (!completion.seoComplete) return merchantSeoProfilePath(workspaceId);
  if (!completion.publishingComplete) return merchantPublishingProfilePath(workspaceId);
  return completion.aiComplete ? completedProfileReturnPath : merchantAiProfilePath(workspaceId);
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
  if (!connected || completion.catalogComplete && completion.listingComplete && completion.seoComplete && completion.publishingComplete && completion.aiComplete) {
    return null;
  }
  if (!completion.catalogComplete) return merchantCatalogProfilePath(workspaceId);
  if (!completion.listingStandardSelected) return merchantListingStandardPath(workspaceId);
  if (!completion.listingComplete) return merchantListingProfilePath(workspaceId);
  if (!completion.seoComplete) return merchantSeoProfilePath(workspaceId);
  if (!completion.publishingComplete) return merchantPublishingProfilePath(workspaceId);
  return merchantAiProfilePath(workspaceId);
}
