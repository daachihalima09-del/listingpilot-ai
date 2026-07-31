import Link from 'next/link';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import {
  ShopifyChangeReviewClient,
  ShopifyReviewGenerateButton,
} from '@/modules/shopify/components/ShopifyChangeReviewClient';
import { findAuthorizedReview, resolveReviewProject } from '@/modules/shopify/review/review-repository.server';
import type {
  ShopifyChangeReviewPayload,
  ShopifyReviewDecision,
} from '@/modules/shopify/review/review-types';

export default async function ShopifyReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ reviewId?: string | string[] }>;
}) {
  const user = await requireAuthenticatedUser();
  const { projectId } = await params;
  const query = await searchParams;
  const context = await resolveReviewProject(user.id, projectId);
  const reviewId = typeof query.reviewId === 'string' ? query.reviewId : '';
  const review = reviewId
    ? await findAuthorizedReview(user.id, projectId, reviewId)
    : null;
  const stale = review
    ? (
        review.status !== 'OPEN'
        || review.expiresAt <= new Date()
        || review.projectVersion !== context.projectVersion
      )
    : false;
  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-8 text-slate-50 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href={`/workspace/${projectId}`} className="text-sm text-amber-200 hover:underline">← Project workspace</Link>
        <header className="mt-5 flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6">
          <div><p className="text-xs uppercase tracking-[0.25em] text-amber-300">Shopify Change Review</p><h1 className="mt-2 text-3xl font-semibold">{context.baseline.product.title}</h1><p className="mt-2 text-sm text-slate-400">{context.store.shopName ?? context.store.shopDomain} · Imported {context.importedAt.toLocaleDateString('en-US', { timeZone: 'UTC' })}</p></div>
          <ShopifyReviewGenerateButton projectId={projectId} />
        </header>
        <div className="mt-7">
          {review ? <ShopifyChangeReviewClient projectId={projectId} reviewId={review.id} initialVersion={review.version} review={review.comparisonJson as unknown as ShopifyChangeReviewPayload} initialDecisions={review.decisionsJson as Record<string, ShopifyReviewDecision>} stale={stale} /> : <div className="rounded-2xl border border-white/10 p-8 text-center"><h2 className="text-xl font-semibold">Generate a fresh comparison</h2><p className="mt-2 text-slate-400">ListingPilot will read the linked Shopify product and compare it with the import baseline and current project. Shopify will not be modified.</p></div>}
        </div>
      </div>
    </main>
  );
}

