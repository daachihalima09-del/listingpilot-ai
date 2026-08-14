import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { MerchantPublishingProfileForm } from '@/modules/onboarding/publishing-profile/MerchantPublishingProfileForm';
import { getMerchantPublishingProfile } from '@/modules/onboarding/publishing-profile/publishing-profile-service';
import { getTenantContextForUser, TenantAccessError } from '@/modules/tenancy/server/tenant-context';

export const metadata: Metadata = { title: 'Configure Publishing Profile | ListingPilot AI' };
export default async function PublishingProfilePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  const user = await requireAuthenticatedUser();
  const params = await searchParams;
  const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId : undefined;
  try {
    const tenant = await getTenantContextForUser(user.id, workspaceId ? { workspaceId } : {});
    if (!tenant.workspace) notFound();
    const access = await resolveMerchantListingProfileAccess(user.id, tenant.workspace.id);
    const profile = await getMerchantPublishingProfile(access.workspaceId);
    return <div className="mx-auto max-w-5xl pb-16 pt-10 sm:pt-14"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Publishing onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Publishing Profile</h1><p className="mt-3 text-base leading-7 text-slate-400">Choose how approved ListingPilot content should be prepared for publishing.</p></div><div className="mt-7 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-50"><strong>Safe by design:</strong> This profile stores publishing policies only. Nothing is published or changed in Shopify during setup.</div><div className="mt-7 rounded-[2rem] border border-white/10 bg-[#081423]/95 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-8"><MerchantPublishingProfileForm workspaceId={access.workspaceId} initial={profile} /></div></div>;
  } catch (error) { if (error instanceof TenantAccessError) notFound(); throw error; }
}
