import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { MerchantAiProfileForm } from '@/modules/onboarding/ai-profile/MerchantAiProfileForm';
import { getMerchantAiProfile } from '@/modules/onboarding/ai-profile/ai-profile-service';
import { getTenantContextForUser, TenantAccessError } from '@/modules/tenancy/server/tenant-context';

export const metadata: Metadata = { title: 'Configure AI Profile | ListingPilot AI' };
export default async function AiProfilePage({ searchParams }: { searchParams: Promise<{ workspaceId?: string | string[] }> }) {
  const user = await requireAuthenticatedUser(); const params = await searchParams; const workspaceId = typeof params.workspaceId === 'string' ? params.workspaceId : undefined;
  try {
    const tenant = await getTenantContextForUser(user.id, workspaceId ? { workspaceId } : {}); if (!tenant.workspace) notFound();
    const access = await resolveMerchantListingProfileAccess(user.id, tenant.workspace.id); const profile = await getMerchantAiProfile(access.workspaceId);
    return <div className="mx-auto max-w-5xl pb-16 pt-10 sm:pt-14"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-300">AI onboarding</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">AI Profile</h1><p className="mt-3 text-base leading-7 text-slate-400">Choose how cautious, creative, explanatory, and autonomous ListingPilot should be.</p></div><div className="mt-7 rounded-2xl border border-violet-300/20 bg-violet-300/[0.07] p-4 text-sm leading-6 text-violet-50"><strong>Important:</strong> AI improves presentation, but verified product data remains the source of truth. ListingPilot will never invent missing facts under Safe AI settings.</div><div className="mt-7 rounded-[2rem] border border-white/10 bg-[#081423]/95 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-8"><MerchantAiProfileForm workspaceId={access.workspaceId} initial={profile} /></div></div>;
  } catch (error) { if (error instanceof TenantAccessError) notFound(); throw error; }
}
