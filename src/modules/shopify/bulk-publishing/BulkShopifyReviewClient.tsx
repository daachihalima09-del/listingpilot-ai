'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { projectApiRequest } from '@/modules/projects/client/project-api';

interface BulkItem {
  id: string;
  product: { id: string; name: string };
  status: string;
  mode: 'UPDATE_EXISTING' | 'CREATE_NEW' | 'BLOCKED';
  changeCount: number;
  blockers: readonly string[];
  warnings: readonly string[];
  changes: Array<{ fieldId: string; displayName: string; operation: string; risk: string; blockedReason: string | null }>;
  linkedProductGid: string | null;
  reviewed: boolean;
  safeMessage: string | null;
  result: unknown;
}

interface BulkBatch {
  id: string;
  project: { id: string; name: string };
  workspaceId: string;
  status: string;
  persistedStatus: string;
  completedAt: string | null;
  items: BulkItem[];
  summary: { total: number; succeeded: number; failed: number; pending: number };
}

function badge(status: string) {
  if (status === 'COMPLETED' || status === 'READY') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (['FAILED', 'PARTIAL', 'STALE', 'BLOCKED'].includes(status)) return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
}

export function BulkShopifyReviewClient({ initial }: { initial: BulkBatch }) {
  const [batch, setBatch] = useState(initial);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const executionRef = useRef(false);
  const readyReviewed = batch.items.filter(({ status, reviewed }) => status === 'READY' && reviewed);
  const createCount = readyReviewed.filter(({ mode }) => mode === 'CREATE_NEW').length;
  const updateCount = readyReviewed.filter(({ mode }) => mode === 'UPDATE_EXISTING').length;

  async function updateItem(item: BulkItem, action: 'PREPARE_CREATE_NEW' | 'REPREPARE' | 'APPROVE') {
    if (busyProductId) return;
    setBusyProductId(item.product.id);
    setError(null);
    try {
      setBatch(await projectApiRequest<BulkBatch>(`/api/projects/${batch.project.id}/bulk-shopify/${batch.id}/items`, {
        method: 'PATCH', body: { workspaceId: batch.workspaceId, productId: item.product.id, action }, timeoutMs: 120_000,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This Product could not be updated.');
    } finally { setBusyProductId(null); }
  }

  async function executeBatch() {
    if (executionRef.current) return;
    executionRef.current = true;
    setConfirming(false);
    setExecuting(true);
    setError(null);
    try {
      let current = batch;
      for (let attempt = 0; attempt <= batch.items.length; attempt += 1) {
        current = await projectApiRequest<BulkBatch>(`/api/projects/${batch.project.id}/bulk-shopify/${batch.id}/execute`, {
          method: 'POST', body: { workspaceId: batch.workspaceId, confirmed: true }, timeoutMs: 120_000,
          timeoutMessage: 'This Product is still processing. Reload the bulk review to see its durable result.',
        });
        setBatch(current);
        if (current.completedAt || !current.items.some(({ status, reviewed }) => status === 'READY' && reviewed)) break;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bulk publishing could not be completed safely.');
    } finally {
      executionRef.current = false;
      setExecuting(false);
    }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Bulk Shopify Review</p>
        <h1 className="mt-2 text-3xl font-semibold">{batch.project.name}</h1>
        <p className="mt-2 text-slate-400">{batch.items.length} selected Products. Each Product keeps its own publishing plan and result.</p>
      </div>
      <Link href={`/workspace/${batch.project.id}`} className="rounded-xl border border-slate-700 px-4 py-2 hover:border-amber-300">Back to Products</Link>
    </div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-100">{error}</p>}
    <div className="space-y-4">
      {batch.items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{item.product.name}</h2><p className="mt-1 text-sm text-slate-400">{item.mode === 'CREATE_NEW' ? 'Create New · Shopify Draft only' : item.mode === 'UPDATE_EXISTING' ? 'Update verified existing Product' : 'Destination or readiness required'} · {item.changeCount} proposed changes</p></div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge(item.status)}`}>{item.status.replaceAll('_', ' ')}</span>
        </div>
        {item.blockers.length > 0 && <ul className="mt-4 space-y-2 text-sm text-rose-200">{item.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul>}
        {item.safeMessage && <p className="mt-4 text-sm text-slate-300">{item.safeMessage}</p>}
        {item.changes.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-amber-200">Review proposed changes</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{item.changes.map((change) => <li key={change.fieldId} className="rounded-lg border border-slate-700 p-3 text-sm"><span className="font-medium">{change.displayName}</span><span className="ml-2 text-xs text-slate-500">{change.operation} · {change.risk}</span>{change.blockedReason && <p className="mt-1 text-rose-200">{change.blockedReason}</p>}</li>)}</ul></details>}
        <div className="mt-5 flex flex-wrap gap-2">
          {item.status === 'BLOCKED' && !item.linkedProductGid && <button type="button" onClick={() => updateItem(item, 'PREPARE_CREATE_NEW')} disabled={Boolean(busyProductId)} className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Create New as Draft</button>}
          {['STALE', 'FAILED'].includes(item.status) && <button type="button" onClick={() => updateItem(item, 'REPREPARE')} disabled={Boolean(busyProductId)} className="rounded-xl border border-amber-300 px-4 py-2 font-semibold text-amber-100 disabled:opacity-50">Refresh this Product</button>}
          {item.status === 'READY' && !item.reviewed && <button type="button" onClick={() => updateItem(item, 'APPROVE')} disabled={Boolean(busyProductId)} className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Approve proposed changes</button>}
          {item.status === 'READY' && item.reviewed && <span className="rounded-xl border border-emerald-400/30 px-4 py-2 text-sm text-emerald-200">Approved for final confirmation</span>}
        </div>
      </article>)}
    </div>
    <section className="mt-7 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-5">
      <h2 className="text-xl font-semibold">Final confirmation</h2>
      <p className="mt-2 text-sm text-slate-300">{readyReviewed.length} approved Products: {createCount} will be created as Draft and {updateCount} verified existing Products will be updated.</p>
      <p className="mt-2 text-xs text-slate-500">Blocked, stale, failed, or unapproved Products will not execute.</p>
      <button type="button" onClick={() => setConfirming(true)} disabled={!readyReviewed.length || executing || ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(batch.persistedStatus)} className="mt-4 rounded-xl bg-emerald-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40">{executing ? 'Publishing…' : `Publish ${readyReviewed.length} Products`}</button>
    </section>
    {batch.summary.succeeded > 0 || ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(batch.persistedStatus) ? <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5"><h2 className="text-xl font-semibold">Bulk publishing results</h2><p className="mt-2 text-slate-300">{batch.summary.succeeded} succeeded · {batch.summary.failed} need attention · {batch.summary.pending} not executed</p></section> : null}
    {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title"><div className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-950 p-6"><h2 id="bulk-confirm-title" className="text-2xl font-semibold">Confirm bulk publishing</h2><p className="mt-3 text-slate-300">Publish {readyReviewed.length} independently reviewed Products?</p><ul className="mt-4 space-y-2 text-sm text-slate-300">{readyReviewed.map((item) => <li key={item.id}>• {item.product.name} — {item.mode === 'CREATE_NEW' ? 'Create as Draft' : 'Update existing'}</li>)}</ul><div className="mt-6 flex gap-3"><button type="button" onClick={executeBatch} className="rounded-xl bg-emerald-300 px-5 py-3 font-semibold text-slate-950">Confirm Bulk Publishing</button><button type="button" onClick={() => setConfirming(false)} className="rounded-xl border border-slate-600 px-5 py-3">Cancel</button></div></div></div>}
  </>;
}
