import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { BulkShopifyReviewClient } from '@/modules/shopify/bulk-publishing/BulkShopifyReviewClient';
import { getBulkPublishingBatch } from '@/modules/shopify/bulk-publishing/bulk-publishing-service.server';

export const metadata = { title: 'Bulk Shopify Review | ListingPilot AI' };

export default async function BulkShopifyReviewPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ batchId?: string | string[] }> }) {
  const user = await requireAuthenticatedUser();
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const parsed = z.string().uuid().safeParse(query.batchId);
  if (!parsed.success) notFound();
  const batch = await getBulkPublishingBatch(user.id, projectId, parsed.data);
  return <main className="min-h-screen bg-[#07111f] px-4 py-8 text-slate-50 sm:px-6"><div className="mx-auto max-w-6xl"><BulkShopifyReviewClient initial={batch} /></div></main>;
}
