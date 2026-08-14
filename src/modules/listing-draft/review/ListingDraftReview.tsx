'use client';

import { Check, LibraryBig, RefreshCw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DraftRegenerationSection, DraftReviewSection, DraftReviewTab } from '../domain/contracts.ts';
import type { ListingDraftInput } from '../validation/draft-schema.ts';
import { FieldReviewControls } from './FieldReviewControls.tsx';
import {
  comparisonDiff,
  confidenceBreakdown,
  fieldReviewStatus,
  merchantFriendlyWarning,
  reviewWorkspaceForDraft,
} from './review-model.ts';
import { listingReviewProgress } from './review-workspace.ts';

interface ListingDraftReviewProps {
  readonly draft: ListingDraftInput;
  readonly onChange: (draft: ListingDraftInput) => void;
  readonly onSave: () => void;
  readonly onRegenerate: (section: DraftRegenerationSection) => void;
  readonly saving: boolean;
  readonly regenerating: DraftRegenerationSection | null;
  readonly autosaveStatus: string;
  readonly readOnly: boolean;
  readonly error: string | null;
  readonly onAddToGoldLibrary?: () => void;
  readonly addingToGoldLibrary?: boolean;
  readonly view: DraftReviewTab;
}
const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60';

type EditableTextField = ListingDraftInput['title'];

function field(value: string, existing?: EditableTextField): EditableTextField {
  return { value, factIds: existing?.factIds ?? [] };
}

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-amber-100">{title}</h3>
        {action}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ReviewToggle({ reviewed, onClick }: { reviewed: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={reviewed} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${reviewed ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-slate-300 hover:bg-white/10'}`}>
      <Check className="h-3 w-3" aria-hidden="true" /> {reviewed ? 'Reviewed' : 'Mark reviewed'}
    </button>
  );
}

function RegenerateButton({ section, busy, disabled, onClick }: { section: DraftRegenerationSection; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
      <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      {busy ? 'Regenerating…' : `Regenerate ${section === 'DESCRIPTION' ? 'Description' : section.charAt(0) + section.slice(1).toLocaleLowerCase('en-US')}`}
    </button>
  );
}

export function ListingDraftReview({
  draft,
  onChange,
  onSave,
  onRegenerate,
  saving,
  regenerating,
  autosaveStatus,
  readOnly,
  error,
  onAddToGoldLibrary,
  addingToGoldLibrary = false,
  view,
}: ListingDraftReviewProps) {
  const [traceField, setTraceField] = useState<string | null>(null);
  const closeTraceRef = useRef<HTMLButtonElement>(null);
  const workspace = useMemo(() => reviewWorkspaceForDraft(draft), [draft]);
  const progress = listingReviewProgress(workspace.reviewedSections);
  const confidence = confidenceBreakdown(draft);

  useEffect(() => {
    if (traceField) closeTraceRef.current?.focus();
  }, [traceField]);

  const change = (patch: Partial<ListingDraftInput>, editedFields: readonly string[] = []) => onChange({
    ...draft,
    ...patch,
    status: 'EDITED',
    updatedAt: new Date().toISOString(),
    metadata: { ...draft.metadata, merchantEdited: true },
    reviewWorkspace: {
      ...workspace,
      editedFields: [...new Set([...workspace.editedFields, ...editedFields])],
    },
  });
  const updateWorkspace = (patch: Partial<typeof workspace>) => onChange({
    ...draft,
    status: draft.status === 'SAVED' ? 'EDITED' : draft.status,
    updatedAt: new Date().toISOString(),
    reviewWorkspace: { ...workspace, ...patch },
  });
  const toggleLock = (fieldKey: string) => updateWorkspace({
    lockedFields: workspace.lockedFields.includes(fieldKey)
      ? workspace.lockedFields.filter((key) => key !== fieldKey)
      : [...workspace.lockedFields, fieldKey],
  });
  const toggleReviewed = (section: DraftReviewSection) => updateWorkspace({
    reviewedSections: workspace.reviewedSections.includes(section)
      ? workspace.reviewedSections.filter((item) => item !== section)
      : [...workspace.reviewedSections, section],
  });
  const controls = (fieldKey: string) => (
    <FieldReviewControls
      fieldKey={fieldKey}
      status={fieldReviewStatus(workspace, fieldKey)}
      locked={workspace.lockedFields.includes(fieldKey)}
      readOnly={readOnly}
      onTrace={setTraceField}
      onToggleLock={toggleLock}
    />
  );
  const disabled = (fieldKey: string) => readOnly || workspace.lockedFields.includes(fieldKey);
  const trace = workspace.traceability.find(({ fieldKey }) => fieldKey === traceField);
  const usedFacts = trace ? workspace.facts.filter(({ factId }) => trace.factIds.includes(factId)) : [];
  const diff = workspace.comparison ? comparisonDiff(workspace.comparison.previous, workspace.comparison.current) : null;
  const craftCodes = new Set(workspace.craft?.findings.map(({ code }) => code) ?? []);
  const craftSummary = workspace.craft ? [
    ['Structure', [...craftCodes].some((code) => code.startsWith('NEOVIX_FACT_')) ? 'REVIEW' : 'PASS'],
    ['Facts', craftCodes.has('NEOVIX_UNSUPPORTED_CLAIM') || craftCodes.has('NEOVIX_REQUIRED_FACT_REVIEW') ? 'NEEDS REVIEW' : 'VERIFIED'],
    ['Features', `${draft.features.length} / expected ${workspace.craft.featureTargetCount ?? draft.features.length}`],
    ['Duplication', craftCodes.has('NEOVIX_FEATURE_DUPLICATE') ? 'REVIEW' : 'PASS'],
    ['Tone', craftCodes.has('NEOVIX_GENERIC_AI_OPENING') || craftCodes.has('PROHIBITED_MARKETING_LANGUAGE') ? 'REVIEW' : 'PASS'],
  ] as const : [];
  const importantCraftFindings = workspace.craft?.findings
    .filter(({ severity }) => severity !== 'INFO')
    .slice(0, 5) ?? [];

  return (
    <section aria-label="Merchant Review Workspace" className="rounded-[1.75rem] border border-amber-400/20 bg-[#081423] p-4 sm:p-5">
      {view === 'LISTING' ? <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Generated Listing</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Review and refine your listing</h2>
          <p className="mt-1 text-sm text-slate-400">Edit the listing here. Evidence and quality details remain available under Review and Advanced.</p>
        </div>
        <div className="min-w-48 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center justify-between text-xs text-slate-300"><span>Listing Review</span><span>{progress}% Complete</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-[11px] text-slate-500">{autosaveStatus}</p>
        </div>
      </div> : <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{view === 'REVIEW' ? 'Listing Evidence & Craft' : 'Listing Technical Controls'}</p><h2 className="mt-1 text-xl font-semibold text-white">{view === 'REVIEW' ? 'Review the generated listing evidence' : 'Advanced listing fields'}</h2></div>}

      {error ? <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

      {view === 'LISTING' ? (
        <div className="mt-4 grid gap-4">
          <Card title="Product Title" action={<span className="flex flex-wrap gap-2"><ReviewToggle reviewed={workspace.reviewedSections.includes('TITLE')} onClick={() => toggleReviewed('TITLE')} /><RegenerateButton section="TITLE" busy={regenerating === 'TITLE'} disabled={readOnly || Boolean(regenerating) || saving} onClick={() => onRegenerate('TITLE')} /></span>}>
            {controls('title')}
            <input aria-label="Product title" className={inputClass} value={draft.title.value} disabled={disabled('title')} onChange={(event) => change({ title: field(event.target.value, draft.title) }, ['title'])} />
          </Card>
          <Card title={workspace.craft?.packId === 'neovix' ? 'Product Information' : 'Specifications'} action={<ReviewToggle reviewed={workspace.reviewedSections.includes('SPECIFICATIONS')} onClick={() => toggleReviewed('SPECIFICATIONS')} />}>
            {controls('specifications')}
            <div className="space-y-3">{draft.specifications.length ? draft.specifications.map((item, index) => (
              <div key={`specification-${index}`} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[11rem_1fr]">
                <input aria-label={`Structured detail ${index + 1} label`} className={inputClass} value={item.label} disabled={disabled('specifications')} onChange={(event) => change({ specifications: draft.specifications.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) }, ['specifications'])} />
                <input aria-label={`${item.label || 'Structured detail'} value`} className={inputClass} value={item.value} disabled={disabled('specifications')} onChange={(event) => change({ specifications: draft.specifications.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) }, ['specifications'])} />
              </div>
            )) : <p className="text-sm text-amber-200">No verified structured details were generated. Review Product Truth before continuing.</p>}</div>
          </Card>
          <Card title="Description" action={<span className="flex flex-wrap gap-2"><ReviewToggle reviewed={workspace.reviewedSections.includes('OVERVIEW')} onClick={() => toggleReviewed('OVERVIEW')} /><RegenerateButton section="DESCRIPTION" busy={regenerating === 'DESCRIPTION'} disabled={readOnly || Boolean(regenerating) || saving} onClick={() => onRegenerate('DESCRIPTION')} /></span>}>
            {controls('overview')}
            <textarea aria-label="Product overview" className={inputClass} rows={5} value={draft.overview.value} disabled={disabled('overview')} onChange={(event) => change({ overview: field(event.target.value, draft.overview) }, ['overview'])} />
          </Card>
          <Card title="Key Features" action={<span className="flex flex-wrap gap-2"><ReviewToggle reviewed={workspace.reviewedSections.includes('FEATURES')} onClick={() => toggleReviewed('FEATURES')} /><RegenerateButton section="FEATURES" busy={regenerating === 'FEATURES'} disabled={readOnly || Boolean(regenerating) || saving} onClick={() => onRegenerate('FEATURES')} /></span>}>
            {draft.features.map((item, index) => (
              <div key={`feature-${index}`} className="rounded-xl border border-white/10 p-3">
                {controls(`features.${index}`)}
                <textarea aria-label={`Feature ${index + 1}`} className={inputClass} rows={2} value={item.value} disabled={disabled(`features.${index}`)} onChange={(event) => change({ features: draft.features.map((entry, itemIndex) => itemIndex === index ? field(event.target.value, entry) : entry) }, [`features.${index}`])} />
              </div>
            ))}
          </Card>
          <Card title="SEO Summary">
            <p className="text-sm font-medium text-white">{draft.seo.title.value}</p>
            <p className="text-sm text-slate-300">{draft.seo.description.value}</p>
            <p className="text-xs text-slate-500">/{draft.seo.handle.value}</p>
          </Card>
        </div>
      ) : null}

      {view === 'REVIEW' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Product Truth">
            {workspace.facts.length ? workspace.facts.map((fact) => (
              <div key={fact.factId} className="rounded-xl border border-white/10 bg-[#07111f] p-3">
                <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-medium text-white"><Check className="h-4 w-4 text-emerald-300" aria-hidden="true" />{fact.label}</span><span className="text-xs text-emerald-200">{fact.confidence}%</span></div>
                <p className="mt-1 text-sm text-slate-200">{fact.value}</p><p className="mt-1 text-xs text-slate-500">{fact.source}</p>
                {fact.sourceAuthority?.limitations.map((item) => <p key={item} className="mt-1 text-xs text-amber-200/80">{item}</p>)}
              </div>
            )) : <p className="text-sm text-slate-400">Traceability will be available after the next full generation.</p>}
          </Card>
          <Card title="AI Detective">
            {draft.aiDetectiveSummary.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-[#07111f] p-3 text-sm text-slate-300">{merchantFriendlyWarning(item)}</div>)}
          </Card>
          <Card title="Confidence">
            <div className="flex items-end gap-3"><span className="text-4xl font-semibold text-white">{draft.confidence.overall}%</span><span className="pb-1 text-sm font-semibold text-amber-200">{confidence.label} Confidence</span></div>
            <p className="text-sm text-slate-400">{draft.confidence.summary}</p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-200"><strong className="block text-lg">{confidence.verified}</strong>Verified</div><div className="rounded-xl bg-amber-400/10 p-3 text-amber-200"><strong className="block text-lg">{confidence.unresolved}</strong>Unresolved</div><div className="rounded-xl bg-rose-400/10 p-3 text-rose-200"><strong className="block text-lg">{confidence.blocked}</strong>Blocked</div></div>
          </Card>
          <Card title="Review Notes">
            {[{ label: 'High Priority', items: draft.warnings }, { label: 'Medium', items: draft.reviewNotes }, { label: 'Low', items: draft.confidence.fieldNotes }].map(({ label, items }) => (
              <div key={label}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>{items.length ? <ul className="mt-2 space-y-2 text-sm text-slate-300">{items.map((item) => <li key={item} className="rounded-xl border border-white/10 p-3">{merchantFriendlyWarning(item)}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">No actionable items.</p>}</div>
            ))}
          </Card>
          {workspace.craft ? <Card title="Listing Craft">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-white">{workspace.craft.displayName}</p><span className="text-xs text-slate-400">v{workspace.craft.packVersion}</span></div>
            <div className="grid gap-2 sm:grid-cols-2">{craftSummary.map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm"><span className="text-slate-400">{label}</span><span className="font-semibold text-white">{value}</span></div>)}</div>
            {workspace.craft.explanations.map((item) => <p key={item} className="rounded-xl border border-white/10 bg-[#07111f] p-3 text-sm text-slate-300">{item}</p>)}
            {importantCraftFindings.length ? <div className="space-y-2">{importantCraftFindings.map((finding) => <div key={`${finding.code}:${finding.field}`} className="rounded-xl border border-amber-300/10 bg-amber-300/5 p-3"><p className="text-sm font-medium text-amber-100">{finding.message}</p><p className="mt-1 text-xs text-slate-400">{finding.suggestedResolution}</p></div>)}</div> : <p className="text-sm text-emerald-200">No Craft findings require attention.</p>}
          </Card> : null}
          {workspace.comparison && diff ? (
            <Card title={`Draft Comparison · ${workspace.comparison.section}`}>
              <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-semibold text-rose-200">Removed</p>{diff.removed.map((line) => <p key={line} className="mt-1 rounded bg-rose-400/10 px-2 py-1 text-xs text-rose-100">− {line}</p>)}</div><div><p className="text-xs font-semibold text-emerald-200">Added</p>{diff.added.map((line) => <p key={line} className="mt-1 rounded bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100">+ {line}</p>)}</div></div>
              {workspace.comparison.merchantEditedFields.length ? <p className="text-xs text-sky-200">Merchant edits preserved: {workspace.comparison.merchantEditedFields.join(', ')}</p> : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {view === 'ADVANCED' ? (
        <div className="mt-4 grid gap-4">
          <Card title="SEO" action={<span className="flex flex-wrap gap-2"><ReviewToggle reviewed={workspace.reviewedSections.includes('SEO')} onClick={() => toggleReviewed('SEO')} /><RegenerateButton section="SEO" busy={regenerating === 'SEO'} disabled={readOnly || Boolean(regenerating) || saving} onClick={() => onRegenerate('SEO')} /></span>}>
            {[['seo.title', 'SEO Title', draft.seo.title], ['seo.description', 'SEO Description', draft.seo.description], ['seo.handle', 'URL Handle', draft.seo.handle]].map(([key, fieldLabel, value]) => {
              const text = value as EditableTextField;
              return <label key={key as string} className="block text-xs font-medium text-slate-400">{fieldLabel as string}{controls(key as string)}<textarea className={inputClass} rows={key === 'seo.description' ? 3 : 1} value={text.value} disabled={disabled(key as string)} onChange={(event) => change({ seo: { ...draft.seo, [String(key).split('.')[1]!]: field(event.target.value, text) } }, [key as string])} /></label>;
            })}
          </Card>
          <Card title="Catalog" action={<ReviewToggle reviewed={workspace.reviewedSections.includes('CATALOG')} onClick={() => toggleReviewed('CATALOG')} />}>
            {[['catalog.tags', 'Tags', draft.catalog.tags], ['catalog.collections', 'Collections', draft.catalog.collections]].map(([key, fieldLabel, values]) => <label key={key as string} className="block text-xs font-medium text-slate-400">{fieldLabel as string}{controls(key as string)}<textarea className={inputClass} rows={3} value={(values as EditableTextField[]).map(({ value }) => value).join('\n')} disabled={disabled(key as string)} onChange={(event) => change({ catalog: { ...draft.catalog, [String(key).split('.')[1]!]: lines(event.target.value).map((value, index) => field(value, (values as EditableTextField[])[index])) } }, [key as string])} /></label>)}
            <div className="grid gap-3 sm:grid-cols-2">{[['catalog.productType', 'Product Type', draft.catalog.productType], ['catalog.vendor', 'Vendor', draft.catalog.vendor]].map(([key, fieldLabel, value]) => <label key={key as string} className="block text-xs font-medium text-slate-400">{fieldLabel as string}{controls(key as string)}<input className={inputClass} value={(value as EditableTextField).value} disabled={disabled(key as string)} onChange={(event) => change({ catalog: { ...draft.catalog, [String(key).split('.')[1]!]: field(event.target.value, value as EditableTextField) } }, [key as string])} /></label>)}</div>
          </Card>
          <Card title="Metafields" action={<ReviewToggle reviewed={workspace.reviewedSections.includes('METAFIELDS')} onClick={() => toggleReviewed('METAFIELDS')} />}>{draft.metafields.length ? draft.metafields.map((item, index) => <label key={`${item.namespace}.${item.key}`} className="block text-xs text-slate-400">{item.namespace}.{item.key}{controls(`metafields.${index}`)}<input className={inputClass} value={item.value} disabled={disabled(`metafields.${index}`)} onChange={(event) => change({ metafields: draft.metafields.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) }, [`metafields.${index}`])} /></label>) : <p className="text-sm text-slate-500">No approved metafield suggestions.</p>}</Card>
          <Card title="Alt Text" action={<ReviewToggle reviewed={workspace.reviewedSections.includes('MEDIA')} onClick={() => toggleReviewed('MEDIA')} />}>{draft.media.length ? draft.media.map((item, index) => <label key={item.imageReference} className="block text-xs text-slate-400">{item.imageReference}{controls(`media.${index}`)}<input className={inputClass} value={item.altText} disabled={disabled(`media.${index}`)} onChange={(event) => change({ media: draft.media.map((entry, itemIndex) => itemIndex === index ? { ...entry, altText: event.target.value } : entry) }, [`media.${index}`])} /></label>) : <p className="text-sm text-slate-500">No source images selected.</p>}</Card>
          <div className="grid gap-4 lg:grid-cols-3"><Card title="Localization">{workspace.advanced.localization.map((item) => <p key={item} className="text-sm text-slate-300">{item}</p>)}</Card><Card title="Publishing Constraints">{workspace.advanced.publishingConstraints.map((item) => <p key={item} className="text-sm text-slate-300">{item}</p>)}</Card><Card title="AI Policy Summary">{workspace.advanced.aiPolicySummary.map((item) => <p key={item} className="text-sm text-slate-300">{item}</p>)}</Card></div>
        </div>
      ) : null}

      {!readOnly && view === 'LISTING' ? <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'Saving draft…' : 'Save Draft'}</button>{onAddToGoldLibrary ? <button type="button" onClick={onAddToGoldLibrary} disabled={draft.status !== 'SAVED' || saving || addingToGoldLibrary} title={draft.status !== 'SAVED' ? 'Save the reviewed draft first.' : undefined} className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 px-5 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-45"><LibraryBig className="h-4 w-4" aria-hidden="true" />{addingToGoldLibrary ? 'Adding…' : 'Add to NEOVIX Gold Library'}</button> : null}</div> : null}

      {traceField ? (
        <div role="dialog" aria-modal="true" aria-labelledby="trace-title" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center" onKeyDown={(event) => { if (event.key === 'Escape') setTraceField(null); }}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#081423] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-amber-300">Why?</p><h3 id="trace-title" className="mt-1 text-lg font-semibold text-white">{trace?.label ?? 'Field explanation'}</h3></div><button ref={closeTraceRef} type="button" onClick={() => setTraceField(null)} className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10" aria-label="Close field explanation"><X className="h-4 w-4" /></button></div>
            {trace ? <div className="mt-4 space-y-4 text-sm"><div><h4 className="font-semibold text-slate-200">Used Facts</h4>{usedFacts.length ? usedFacts.map((fact) => <div key={fact.factId} className="mt-2 rounded-xl border border-white/10 p-3"><p className="font-medium text-white">{fact.label}: {fact.value}</p><p className="mt-1 text-xs text-slate-400">{fact.source} · {fact.confidence}% confidence</p></div>) : <p className="mt-1 text-slate-400">No Product Truth fact was required for this merchant-controlled value.</p>}</div><div><h4 className="font-semibold text-slate-200">Source</h4><p className="text-slate-400">{trace.source}</p></div><div><h4 className="font-semibold text-slate-200">Confidence</h4><p className="text-slate-400">{trace.confidence}% based on the facts used by this field.</p></div><div><h4 className="font-semibold text-slate-200">Rule</h4><p className="text-slate-400">{trace.rule}</p></div><div><h4 className="font-semibold text-slate-200">Merchant Profile</h4><p className="text-slate-400">{trace.merchantProfile}</p></div><div><h4 className="font-semibold text-slate-200">Product Intelligence Pack</h4><p className="text-slate-400">{trace.productIntelligence}</p></div></div> : <p className="mt-4 text-sm text-slate-400">Detailed traceability will be available after the next full generation.</p>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
