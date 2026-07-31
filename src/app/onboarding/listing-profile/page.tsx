import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { MerchantListingProfileForm } from '@/modules/onboarding/listing-profile/MerchantListingProfileForm';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { getMerchantListingProfile } from '@/modules/onboarding/listing-profile/listing-profile-service';
import { getTenantContextForUser, TenantAccessError } from '@/modules/tenancy/server/tenant-context';

export const metadata: Metadata = { title: 'Merchant Listing Profile | ListingPilot AI' };

export default async function MerchantListingProfilePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  const user = await requireAuthenticatedUser();
  const parameters = await searchParams;
  const workspaceId = typeof parameters.workspaceId === 'string' ? parameters.workspaceId : undefined;
  try {
    const tenant = await getTenantContextForUser(user.id, workspaceId ? { workspaceId } : {});
    if (!tenant.workspace) notFound();
    const access = await resolveMerchantListingProfileAccess(user.id, tenant.workspace.id);
    const profile = await getMerchantListingProfile(access.workspaceId);
    if (!profile) redirect(`/onboarding/listing-standard?${new URLSearchParams({ workspaceId: access.workspaceId })}`);
    return <div className="mx-auto max-w-5xl pb-16 pt-10 sm:pt-14"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Listing onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Merchant Listing Profile</h1><p className="mt-3 text-base leading-7 text-slate-400">Review the selected standard and configure how ListingPilot should structure your future listings.</p></div><div className="mt-8 rounded-[2rem] border border-white/10 bg-[#081423]/95 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-8"><MerchantListingProfileForm workspaceId={access.workspaceId} initial={profile} /></div></div>;
  } catch (error) {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  }
}
