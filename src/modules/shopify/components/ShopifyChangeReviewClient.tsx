'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ShopifyChangeReviewPayload,
  ShopifyReviewDecision,
} from '../review/review-types';

export function ShopifyReviewGenerateButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function generate() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/shopify-review`, { method: 'POST' });
      const body = await response.json() as { id?: unknown; error?: { message?: unknown } };
      if (!response.ok || typeof body.id !== 'string') {
        setError(typeof body.error?.message === 'string' ? body.error.message : 'Comparison could not be generated.');
        return;
      }
      router.push(`/workspace/${projectId}/shopify-review?reviewId=${encodeURIComponent(body.id)}`);
      router.refresh();
    } catch {
      setError('Comparison could not be generated.');
    } finally {
      setBusy(false);
    }
  }
  return <div><button onClick={() => void generate()} disabled={busy} className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? 'Comparing…' : 'Refresh Comparison'}</button>{error ? <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p> : null}</div>;
}

function display(value: unknown): string {
  if (value === undefined) return 'Not present';
  if (value === null) return 'None';
  if (typeof value === 'string') return value || 'Empty';
  return JSON.stringify(value, null, 2);
}

export function ShopifyChangeReviewClient({
  projectId,
  reviewId,
  initialVersion,
  review,
  initialDecisions,
  stale,
}: {
  projectId: string;
  reviewId: string;
  initialVersion: number;
  review: ShopifyChangeReviewPayload;
  initialDecisions: Record<string, ShopifyReviewDecision>;
  stale: boolean;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const unresolved = review.fields.filter((field) => (
    field.classification === 'CONFLICT' && !decisions[field.fieldPath]
  )).length;
  const selected = useMemo(() => Object.values(decisions).filter((value) => value === 'USE_LISTINGPILOT').length, [decisions]);
  const selectedHighImpact = useMemo(() => review.fields.filter((field) => (
    decisions[field.fieldPath] === 'USE_LISTINGPILOT'
    && field.warningCodes.some((code) => [
      'STOREFRONT_VISIBILITY',
      'VARIANT_PRICE',
      'VARIANT_SKU',
      'MEDIA_UPLOAD',
    ].includes(code))
  )).length, [decisions, review.fields]);

  async function saveAndPublish() {
    if (busy || stale || unresolved) return;
    if (
      selectedHighImpact > 0
      && !window.confirm(`Publish ${selectedHighImpact} high-impact Shopify change${selectedHighImpact === 1 ? '' : 's'}?`)
    ) {
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const base = `/api/projects/${projectId}/shopify-review/${reviewId}`;
      const saved = await fetch(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, decisions }),
      });
      const savedBody = await saved.json() as { version?: number; error?: { message?: string } };
      if (!saved.ok || typeof savedBody.version !== 'number') {
        setFeedback(savedBody.error?.message ?? 'Decisions could not be saved.');
        return;
      }
      setVersion(savedBody.version);
      const published = await fetch(`${base}/publish`, { method: 'POST' });
      const result = await published.json() as { updatedFields?: string[]; error?: { message?: string } };
      if (!published.ok) {
        setFeedback(result.error?.message ?? 'Approved changes could not be published.');
        return;
      }
      setFeedback(`${result.updatedFields?.length ?? 0} approved changes were published to the linked Shopify product.`);
    } catch {
      setFeedback('Approved changes could not be published.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-5">
        {[
          ['Changes', review.summary.totalChanges],
          ['Local', review.summary.localChanges],
          ['Remote', review.summary.remoteChanges],
          ['Conflicts', review.summary.conflicts],
          ['Blocked', review.summary.blocked],
        ].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-white/10 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{count}</div></div>)}
      </div>
      {stale ? <div role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-amber-100">This review is stale. Refresh the comparison before publishing.</div> : null}
      <div className="space-y-3">
        {review.fields.map((field) => (
          <section key={field.fieldPath} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{field.label}</h3><p className="text-xs text-slate-400">{field.classification.replaceAll('_', ' ')}</p></div><label className="text-sm"><span className="sr-only">Decision for {field.label}</span><select aria-label={`Decision for ${field.label}`} value={decisions[field.fieldPath] ?? field.defaultDecision ?? ''} onChange={(event) => setDecisions((current) => ({ ...current, [field.fieldPath]: event.target.value as ShopifyReviewDecision }))} disabled={!field.publishable || stale} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2"><option value="">Choose…</option>{field.availableDecisions.map((decision) => <option key={decision} value={decision}>{decision.replaceAll('_', ' ')}</option>)}</select></label></div>
            <details className="mt-3"><summary className="cursor-pointer text-sm text-amber-200">Compare three values</summary><div className="mt-3 grid gap-3 md:grid-cols-3">{[['Original Shopify', field.baselineValue], ['Current Shopify', field.remoteValue], ['ListingPilot', field.localValue]].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-lg bg-slate-950/70 p-3"><div className="text-xs text-slate-500">{String(label)}</div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{display(value)}</pre></div>)}</div></details>
          </section>
        ))}
      </div>
      {feedback ? <p role="status" className="rounded-xl border border-white/10 p-4">{feedback}</p> : null}
      <button type="button" onClick={() => void saveAndPublish()} disabled={busy || stale || unresolved > 0 || selected === 0} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Publishing…' : `Publish ${selected} Approved Changes`}</button>
      <p className="text-sm text-slate-400">{unresolved} unresolved conflicts. High-impact status, price, SKU, and media changes require explicit selection.</p>
    </div>
  );
}
