'use client';

import { LoaderCircle, Save, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  listingProfileDataSchema,
  titleFieldIds,
  type ListingPreferenceData,
  type ListingRules,
} from '@/modules/merchant-preferences/listing-standard';
import {
  businessProfileSettingsPath,
  merchantProfileSaveDestination,
  type MerchantProfileSurface,
} from '@/modules/settings/business-profile/routes';

function listValue(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function emptyCustomRules(): ListingRules {
  return {
    title: {
      fieldOrder: [],
      characterLimit: 0,
      separator: 'SPACE',
      capitalization: 'TITLE_CASE',
      prohibitPromotionalWords: false,
    },
    description: {
      structure: 'OVERVIEW_FIRST',
      paragraphCount: 0,
      tone: 'PROFESSIONAL',
      technicalLevel: 'BALANCED',
      includeUseCases: false,
      includeBuyingAdvice: false,
    },
    features: {
      count: 0,
      maximumLength: 0,
      technicalFirst: false,
      customerBenefits: false,
      displayOrder: 'BALANCED',
    },
    requiredInformation: [],
    prohibitedContent: [],
  };
}

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-300 focus:ring-amber-300" />{label}</label>;
}

export function MerchantListingProfileForm({
  workspaceId,
  initial,
  surface = 'onboarding',
  canManage = true,
}: {
  workspaceId: string;
  initial: { version: number; data: ListingPreferenceData };
  surface?: MerchantProfileSurface;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial.data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useMemo(() => listingProfileDataSchema.safeParse({ ...data, configurationStatus: 'CONFIGURED' }), [data]);

  if (data.learningMode === 'LEARN_FROM_STORE') {
    const destination = surface === 'settings'
      ? businessProfileSettingsPath('listing-standard', workspaceId)
      : merchantProfileSaveDestination({ section: 'listing', surface, workspaceId });
    return <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-6"><Sparkles className="h-5 w-5 text-amber-200" /><h2 className="mt-3 text-lg font-semibold text-white">Store learning is pending</h2><p className="mt-2 text-sm leading-6 text-slate-300">ListingPilot will learn from your Shopify catalog in a future analysis sprint. No rules or Shopify data are changed today.</p>{canManage ? <button type="button" onClick={() => router.push(destination)} className="mt-5 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950">{surface === 'settings' ? 'Change Listing Standard' : 'Continue'}</button> : <p className="mt-4 text-sm text-amber-100">Only the workspace owner can change this profile.</p>}</div>;
  }
  const rules: ListingRules = data.rules ?? emptyCustomRules();
  const configuredRules: ListingRules = rules;
  function update(next: Partial<ListingRules>) {
    const nextRules: ListingRules = {
      title: next.title ?? configuredRules.title,
      description: next.description ?? configuredRules.description,
      features: next.features ?? configuredRules.features,
      requiredInformation: next.requiredInformation ?? configuredRules.requiredInformation,
      prohibitedContent: next.prohibitedContent ?? configuredRules.prohibitedContent,
    };
    setData({ ...data, rules: nextRules });
  }
  function setTitleOrder(field: typeof titleFieldIds[number], position: string) {
    const next = configuredRules.title.fieldOrder.filter((value) => value !== field);
    if (position !== 'OMIT') next.splice(Math.max(0, Number(position) - 1), 0, field);
    update({ title: { ...configuredRules.title, fieldOrder: next } });
  }
  async function save() {
    if (!validation.success) { setError(validation.error.issues[0]?.message ?? 'Review the listing rules before saving.'); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/onboarding/listing-profile', { method: 'PUT', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, expectedVersion: initial.version, data: validation.data }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'The Listing Profile could not be saved.');
      if (surface === 'settings') {
        router.refresh();
      } else {
        router.push(merchantProfileSaveDestination({ section: 'listing', surface, workspaceId }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Listing Profile could not be saved.'); } finally { setSaving(false); }
  }
  return <div>
    {!canManage ? <p className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">Only the workspace owner can edit the Listing Style.</p> : null}
    <fieldset disabled={!canManage} className="space-y-6 disabled:opacity-75">
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="text-lg font-semibold text-white">Title Rules</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{titleFieldIds.map((field) => <label key={field} className="text-sm text-slate-300">{field.replaceAll('_', ' ')}<select value={rules.title.fieldOrder.includes(field) ? String(rules.title.fieldOrder.indexOf(field) + 1) : 'OMIT'} onChange={(event) => setTitleOrder(field, event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="OMIT">Omit</option>{[1,2,3,4,5].map((number) => <option key={number} value={number}>Position {number}</option>)}</select></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm text-slate-300">Character limit<input type="number" min="30" max="200" value={rules.title.characterLimit} onChange={(event) => update({ title: { ...rules.title, characterLimit: Number(event.target.value) } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Separator<select value={rules.title.separator} onChange={(event) => update({ title: { ...rules.title, separator: event.target.value as ListingRules['title']['separator'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="SPACE">Space</option><option value="DASH">Dash</option><option value="PIPE">Pipe</option><option value="COLON">Colon</option></select></label><label className="text-sm text-slate-300">Capitalization<select value={rules.title.capitalization} onChange={(event) => update({ title: { ...rules.title, capitalization: event.target.value as ListingRules['title']['capitalization'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="TITLE_CASE">Title case</option><option value="SENTENCE_CASE">Sentence case</option><option value="UPPERCASE">Uppercase</option></select></label></div><div className="mt-4"><Checkbox checked={rules.title.prohibitPromotionalWords} label="Avoid promotional words" onChange={(value) => update({ title: { ...rules.title, prohibitPromotionalWords: value } })} /></div></section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="text-lg font-semibold text-white">Description Rules</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm text-slate-300">Structure<select value={rules.description.structure} onChange={(event) => update({ description: { ...rules.description, structure: event.target.value as ListingRules['description']['structure'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="SPECIFICATIONS_FIRST">Specifications first</option><option value="OVERVIEW_FIRST">Overview first</option><option value="BALANCED">Balanced</option></select></label><label className="text-sm text-slate-300">Paragraphs<input type="number" min="1" max="6" value={rules.description.paragraphCount} onChange={(event) => update({ description: { ...rules.description, paragraphCount: Number(event.target.value) } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Tone<select value={rules.description.tone} onChange={(event) => update({ description: { ...rules.description, tone: event.target.value as ListingRules['description']['tone'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white">{['PROFESSIONAL','TECHNICAL','PREMIUM','CONVERSATIONAL','MINIMAL'].map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label></div><div className="mt-4 flex flex-wrap gap-5"><Checkbox checked={rules.description.includeUseCases} label="Include use cases" onChange={(value) => update({ description: { ...rules.description, includeUseCases: value } })} /><Checkbox checked={rules.description.includeBuyingAdvice} label="Include buying advice" onChange={(value) => update({ description: { ...rules.description, includeBuyingAdvice: value } })} /></div></section>
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><h2 className="text-lg font-semibold text-white">Detail Level & Features</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300">Technical level<select value={rules.description.technicalLevel} onChange={(event) => update({ description: { ...rules.description, technicalLevel: event.target.value as ListingRules['description']['technicalLevel'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="MINIMAL">Minimal</option><option value="BALANCED">Balanced</option><option value="DETAILED">Detailed</option></select></label><label className="text-sm text-slate-300">Feature display order<select value={rules.features.displayOrder} onChange={(event) => update({ features: { ...rules.features, displayOrder: event.target.value as ListingRules['features']['displayOrder'] } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"><option value="TECHNICAL_FIRST">Technical first</option><option value="BENEFITS_FIRST">Benefits first</option><option value="BALANCED">Balanced</option></select></label><label className="text-sm text-slate-300">Number of features<input type="number" min="1" max="20" value={rules.features.count} onChange={(event) => update({ features: { ...rules.features, count: Number(event.target.value) } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Maximum feature length<input type="number" min="20" max="300" value={rules.features.maximumLength} onChange={(event) => update({ features: { ...rules.features, maximumLength: Number(event.target.value) } })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Required information (comma separated)<input value={rules.requiredInformation.join(', ')} onChange={(event) => update({ requiredInformation: listValue(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label><label className="text-sm text-slate-300">Prohibited words or phrases (comma separated)<input value={rules.prohibitedContent.join(', ')} onChange={(event) => update({ prohibitedContent: listValue(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white" /></label></div><div className="mt-4 flex flex-wrap gap-5"><Checkbox checked={rules.features.technicalFirst} label="Technical details first" onChange={(value) => update({ features: { ...rules.features, technicalFirst: value } })} /><Checkbox checked={rules.features.customerBenefits} label="Include customer benefits" onChange={(value) => update({ features: { ...rules.features, customerBenefits: value } })} /></div></section>
    {error ? <p className="text-sm text-rose-300" role="alert">{error}</p> : null}<div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-45">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Listing Style</button></div>
    </fieldset>
  </div>;
}
