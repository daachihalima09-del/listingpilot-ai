import Link from 'next/link';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { SafeShopifyPublishingClient } from '@/modules/shopify/components/SafeShopifyPublishingClient';
import { getSafePublishingPlan } from '@/modules/shopify/safe-publishing/safe-publishing-service.server';

export const metadata = { title: 'Prepare for Shopify | ListingPilot AI' };

export default async function SafeShopifyPublishingPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ planId?: string | string[] }> }) {
  const user = await requireAuthenticatedUser();
  const { projectId } = await params;
  const query = await searchParams;
  const planId = typeof query.planId === 'string' ? query.planId : undefined;
  const initial = await getSafePublishingPlan(user.id, projectId, planId);
  return <main className="min-h-screen bg-[#07111f] px-4 py-8 text-slate-50 sm:px-6"><div className="mx-auto max-w-6xl"><Link href={`/workspace/${projectId}`} className="text-sm text-amber-200 hover:underline">← Project workspace</Link><header className="mt-5 border-b border-white/10 pb-6"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Safe Shopify Publishing</p><h1 className="mt-2 text-3xl font-semibold">Prepare for Shopify</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review exactly what ListingPilot proposes before anything changes in your store.</p></header><div className="mt-7"><SafeShopifyPublishingClient projectId={projectId} initial={initial} /></div></div></main>;
}
