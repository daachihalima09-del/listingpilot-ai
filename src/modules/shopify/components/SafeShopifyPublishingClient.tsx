'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShopifyPublishingPlanPayload, PublishingChangeGroup } from '../safe-publishing/publishing-plan';
import { ShopifyListingPreview } from './ShopifyListingPreview';

type PlanView = {
  id: string;
  version: number;
  status: string;
  stale: boolean;
  plan: ShopifyPublishingPlanPayload;
  selection?: unknown;
  store: { name: string | null; domain: string } | null;
};

const groupLabels: Record<PublishingChangeGroup, string> = {
  PRODUCT_CONTENT: 'Product Content', SEO: 'SEO', CATALOG: 'Catalog', VARIANTS: 'Variants', PRICING: 'Pricing', IMAGES: 'Images', METAFIELDS: 'Metafields', TAGS: 'Tags', COLLECTIONS: 'Collections', STATUS: 'Status',
};

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function SafeShopifyPublishingClient({ projectId, initial }: { projectId: string; initial: PlanView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'prepare' | 'refresh' | 'save' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ outcome: string; completedOperations: string[]; productGid: string | null } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const saved = initial?.selection && typeof initial.selection === 'object' ? initial.selection as { selectedFieldIds?: unknown; duplicateCandidateReviewed?: unknown } : null;
  const defaults = initial?.plan.changes.filter(({ selected }) => selected).map(({ fieldId }) => fieldId) ?? [];
  const [selected, setSelected] = useState<string[]>(Array.isArray(saved?.selectedFieldIds) ? saved!.selectedFieldIds.filter((id): id is string => typeof id === 'string') : defaults);
  const [duplicateReviewed, setDuplicateReviewed] = useState(saved?.duplicateCandidateReviewed === true);
  const plan = initial?.plan;
  const selectedChanges = useMemo(() => plan?.changes.filter(({ fieldId }) => selected.includes(fieldId)) ?? [], [plan, selected]);
  const highImpact = selectedChanges.filter(({ risk }) => risk === 'HIGH');

  async function request(path: string, method: 'POST' | 'PATCH', body: unknown) {
    const response = await fetch(`/api/projects/${projectId}/shopify-publish${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json() as { id?: string; error?: { message?: string }; outcome?: string; completedOperations?: string[]; productGid?: string | null };
    if (!response.ok) throw new Error(value.error?.message ?? 'Shopify publishing needs attention.');
    return value;
  }

  async function prepare(intent: 'REVIEW' | 'CREATE_NEW') {
    if (busy) return;
    setBusy('prepare'); setError('');
    try {
      const response = await request('/prepare', 'POST', { intent });
      router.push(`/workspace/${projectId}/shopify-publish?planId=${encodeURIComponent(response.id!)}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The plan could not be prepared.'); }
    finally { setBusy(null); }
  }

  function payload(confirm = false) {
    return {
      planId: initial!.id, planVersion: initial!.version, planFingerprint: plan!.planFingerprint, selectedFieldIds: selected,
      duplicateCandidateReviewed: duplicateReviewed,
      confirmations: confirm ? [...highImpact.map(({ fieldId }) => fieldId), ...(plan!.mode === 'CREATE_NEW' ? ['CREATE_NEW_PRODUCT'] : [])] : [],
    };
  }

  async function save() {
    if (!initial || busy) return;
    setBusy('save'); setError('');
    try { await request('', 'PATCH', payload()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Your review could not be saved.'); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!initial || busy) return;
    setBusy('publish'); setError('');
    try {
      const response = await request('/execute', 'POST', payload(true));
      setResult({ outcome: response.outcome!, completedOperations: response.completedOperations ?? [], productGid: response.productGid ?? null });
      setShowConfirmation(false);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Shopify could not apply the approved changes.'); setShowConfirmation(false); }
    finally { setBusy(null); }
  }

  if (!initial) return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
      <h2 className="text-xl font-semibold">Prepare a safe Shopify review</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">ListingPilot will check the saved draft, publishing policies, product identity, and fresh Shopify state. Nothing is changed yet.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void prepare('REVIEW')} disabled={Boolean(busy)} className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Preparing…' : 'Prepare for Shopify'}</button>
        <button type="button" onClick={() => void prepare('CREATE_NEW')} disabled={Boolean(busy)} className="rounded-xl border border-white/15 px-5 py-3 font-semibold disabled:opacity-50">Create New Product…</button>
        <Link href="/catalog/shopify" className="rounded-xl border border-white/15 px-5 py-3 font-semibold">Link Existing Product</Link>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </section>
  );

  const groups = groupLabels ? Object.entries(groupLabels).map(([key, label]) => ({ key: key as PublishingChangeGroup, label, changes: plan!.changes.filter(({ group }) => group === key) })).filter(({ changes }) => changes.length) : [];
  return (
    <div className="space-y-6">
      {plan!.listingPreview ? <ShopifyListingPreview listing={plan!.listingPreview} notice="This is the saved draft used by the comparison and publishing plan below." /> : null}
      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">Store</p><p className="mt-1 truncate font-semibold">{initial.store?.name ?? initial.store?.domain ?? 'Shopify'}</p></div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">Mode</p><p className="mt-1 font-semibold">{plan!.mode.replaceAll('_', ' ')}</p></div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">Changes</p><p className="mt-1 text-2xl font-semibold">{plan!.changes.length}</p></div>
        <div className="rounded-xl border border-white/10 p-4"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold">{plan!.blockers.length ? 'Needs attention' : initial.stale ? 'Refresh required' : 'Ready for review'}</p></div>
      </section>

      {plan!.blockers.length ? <section role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-5"><h2 className="font-semibold text-rose-100">Before you can publish</h2><ul className="mt-3 space-y-2 text-sm text-rose-100">{plan!.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul></section> : null}
      {plan!.mode === 'BLOCKED' && !plan!.shopifyLinkage.verified ? <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5"><h2 className="font-semibold text-amber-100">Choose a Shopify destination</h2><p className="mt-2 text-sm leading-6 text-slate-300">After the saved draft and required review are complete, choose exactly one destination. This prepares a review only; it does not change Shopify.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void prepare('CREATE_NEW')} disabled={Boolean(busy)} className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Create New Product</button><Link href="/catalog/shopify" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold">Link Existing Product</Link></div></section> : null}
      {plan!.warnings.length ? <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5"><h2 className="font-semibold text-amber-100">Review carefully</h2>{plan!.warnings.map((warning) => <p key={warning} className="mt-2 text-sm text-amber-100">{warning}</p>)}</section> : null}

      {plan!.duplicateAssessment.candidates.length ? <section className="rounded-2xl border border-amber-300/20 p-5"><h2 className="font-semibold">Possible existing products</h2><p className="mt-2 text-sm text-slate-400">Duplicate detection is a safety aid, not a guarantee. Review these products before creating anything.</p><div className="mt-4 space-y-2">{plan!.duplicateAssessment.candidates.map((candidate) => <div key={candidate.productGid} className="rounded-xl bg-black/20 p-3"><p className="font-medium">{candidate.title}</p><p className="text-xs text-slate-400">{candidate.vendor} · {candidate.productType} · {candidate.reason}</p></div>)}</div>{plan!.duplicateAssessment.result === 'POSSIBLE_MATCH' ? <label className="mt-4 flex gap-3 text-sm"><input type="checkbox" checked={duplicateReviewed} onChange={(event) => setDuplicateReviewed(event.target.checked)} /> I reviewed these possible matches and this is a genuinely new product.</label> : null}</section> : null}

      <section className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-5"><h2 className="font-semibold">Shopify Safety</h2><div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2"><p>✓ Inventory is managed separately and will not be changed.</p><p>✓ Existing variants and images are preserved.</p><p>✓ Existing tags are preserved.</p><p>✓ No collections will be created.</p><p>✓ Merchant Vendor rules are applied.</p><p>✓ Publishing Profile is applied.</p>{plan!.mode === 'CREATE_NEW' ? <p>✓ New product will be created as Draft.</p> : <p>✓ Existing product identity is bound to this plan.</p>}</div></section>

      {groups.map(({ key, label, changes }) => <details key={key} open className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"><summary className="cursor-pointer font-semibold">{label} <span className="ml-2 text-xs font-normal text-slate-500">{changes.length}</span></summary><div className="mt-4 space-y-3">{changes.map((change) => <article key={change.fieldId} className="rounded-xl border border-white/10 p-4"><div className="flex items-start gap-3"><input aria-label={`Select ${change.displayName}`} type="checkbox" checked={selected.includes(change.fieldId)} disabled={Boolean(change.blockedReason) || initial.stale || plan!.blockers.length > 0 || result !== null} onChange={(event) => setSelected((current) => event.target.checked ? [...current, change.fieldId] : current.filter((id) => id !== change.fieldId))} className="mt-1 h-4 w-4" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{change.displayName}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${change.risk === 'HIGH' ? 'bg-rose-300/10 text-rose-200' : 'bg-white/5 text-slate-400'}`}>{change.risk} RISK</span></div>{change.blockedReason ? <p className="mt-1 text-sm text-amber-200">{change.blockedReason}</p> : null}<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr]"><div className="rounded-lg bg-black/20 p-3"><p className="text-xs text-slate-500">Current Shopify</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{display(change.currentValue)}</p></div><span aria-hidden="true" className="self-center text-slate-600">→</span><div className="rounded-lg bg-amber-300/[0.05] p-3"><p className="text-xs text-amber-200">ListingPilot proposal</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{display(change.proposedValue)}</p></div></div></div></div></article>)}</div></details>)}

      {result ? <section role="status" className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-5"><h2 className="font-semibold text-emerald-100">Verified Shopify result</h2><p className="mt-2 text-sm text-emerald-100">{result.completedOperations.length} approved operations completed and were verified.</p></section> : null}
      {error ? <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm text-rose-100">{error}</p> : null}
      <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
        <button type="button" onClick={() => void prepare(plan!.mode === 'CREATE_NEW' ? 'CREATE_NEW' : 'REVIEW')} disabled={Boolean(busy)} className="rounded-xl border border-white/15 px-4 py-2.5 font-semibold">{busy === 'prepare' ? 'Refreshing…' : 'Refresh Comparison'}</button>
        <button type="button" onClick={() => void save()} disabled={Boolean(busy) || initial.stale || plan!.blockers.length > 0} className="rounded-xl border border-white/15 px-4 py-2.5 font-semibold">{busy === 'save' ? 'Saving…' : 'Save Review'}</button>
        <button type="button" onClick={() => setShowConfirmation(true)} disabled={Boolean(busy) || selected.length === 0 || initial.stale || plan!.blockers.length > 0 || (plan!.duplicateAssessment.result === 'POSSIBLE_MATCH' && !duplicateReviewed) || result !== null} className="rounded-xl bg-emerald-300 px-5 py-2.5 font-semibold text-slate-950 disabled:opacity-40">{plan!.mode === 'CREATE_NEW' ? 'Create as Draft' : 'Publish Selected Changes'}</button>
        <Link href={`/workspace/${projectId}`} className="rounded-xl px-4 py-2.5 text-slate-400">Cancel</Link>
      </div>

      {showConfirmation ? <div role="dialog" aria-modal="true" aria-labelledby="publish-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#091522] p-6 shadow-2xl"><h2 id="publish-confirm-title" className="text-xl font-semibold">Confirm Shopify changes</h2><p className="mt-2 text-sm text-slate-400">Only the {selected.length} selected changes will be sent. Inventory and collection structure remain untouched.</p>{highImpact.length || plan!.mode === 'CREATE_NEW' ? <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-4"><p className="font-medium text-rose-100">High-impact confirmation</p><ul className="mt-2 space-y-1 text-sm text-rose-100">{plan!.mode === 'CREATE_NEW' ? <li>• Create one new Shopify product as Draft</li> : null}{highImpact.map((change) => <li key={change.fieldId}>• {change.displayName}: {display(change.currentValue)} → {display(change.proposedValue)}</li>)}</ul></div> : null}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowConfirmation(false)} className="rounded-xl border border-white/15 px-4 py-2.5">Go back</button><button type="button" onClick={() => void publish()} disabled={busy === 'publish'} className="rounded-xl bg-emerald-300 px-5 py-2.5 font-semibold text-slate-950">{busy === 'publish' ? 'Publishing…' : plan!.mode === 'CREATE_NEW' ? 'Confirm Create as Draft' : 'Confirm Publish'}</button></div></div></div> : null}
    </div>
  );
}
