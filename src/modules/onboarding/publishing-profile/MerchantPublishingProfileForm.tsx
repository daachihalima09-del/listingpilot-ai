'use client';

import { ChevronDown, LoaderCircle, Save, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createPublishingProfile, publishingProfileDataSchema, type PublishingProfile, type PublishingPolicies } from '@/modules/merchant-preferences/publishing-profile';
import { merchantProfileSaveDestination, type MerchantProfileSurface } from '@/modules/settings/business-profile/routes';

type Mode = PublishingProfile['setupMode'];
const modes: Array<{ id: Mode; title: string; description: string; badge?: string }> = [
  { id: 'LISTINGPILOT_SAFE_DEFAULTS', title: 'Safe Defaults', description: 'Review every product before publishing. Preserve existing store data and prepare new products as drafts.', badge: 'Recommended' },
  { id: 'REVIEW_CURRENT_SHOPIFY_SETUP', title: 'Review Current Setup', description: 'ListingPilot will later inspect your publishing setup. Safe defaults apply until review is complete.' },
  { id: 'MANUAL', title: 'Configure Manually', description: 'Choose how ListingPilot should prepare updates, variants, images, SEO and metafields.' },
];
const inputClass = 'mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white';
function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) { return <label className="text-sm text-slate-300">{label}<select className={inputClass} value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ').toLocaleLowerCase().replace(/^\w/u, (letter) => letter.toLocaleUpperCase())}</option>)}</select></label>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <details className="group rounded-2xl border border-white/10 bg-white/[0.035]"><summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold text-white sm:p-5">{title}<ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary><div className="grid gap-4 border-t border-white/10 p-4 sm:grid-cols-2 sm:p-5">{children}</div></details>; }

export function MerchantPublishingProfileForm({ workspaceId, initial, surface = 'onboarding', canManage = true }: { workspaceId: string; initial: { version: number; data: PublishingProfile } | null; surface?: MerchantProfileSurface; canManage?: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Mode | null>(initial?.data.setupMode ?? null);
  const [profile, setProfile] = useState<PublishingProfile>(initial?.data ?? createPublishingProfile('LISTINGPILOT_SAFE_DEFAULTS'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useMemo(() => publishingProfileDataSchema.safeParse(profile), [profile]);
  function choose(mode: Mode) { setSelected(mode); setProfile(createPublishingProfile(mode)); setError(null); }
  function patch<K extends keyof PublishingPolicies>(key: K, value: PublishingPolicies[K]) { setProfile((current) => ({ ...current, policies: { ...current.policies, [key]: value } })); }
  async function save() {
    if (!selected || !validation.success) { setError(validation.success ? 'Choose a publishing setup mode.' : validation.error.issues[0]?.message ?? 'Review the Publishing Profile.'); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch('/api/onboarding/publishing-profile', { method: 'PUT', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, expectedVersion: initial?.version ?? null, data: validation.data }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'The Publishing Profile could not be saved.');
      if (surface === 'settings') router.refresh();
      else router.push(merchantProfileSaveDestination({ section: 'publishing', surface, workspaceId }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Publishing Profile could not be saved.'); } finally { setSaving(false); }
  }
  const policies = profile.policies;
  return <div>
    {!canManage ? <p className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">Only the workspace owner can edit the Publishing Profile.</p> : null}
    <fieldset disabled={!canManage} className="disabled:opacity-75">
    <h2 className="text-lg font-semibold text-white">How should approved content be prepared?</h2>
    <div className="mt-4 grid gap-4 lg:grid-cols-3">{modes.map((mode) => <button key={mode.id} type="button" aria-pressed={selected === mode.id} onClick={() => choose(mode.id)} className={`rounded-2xl border p-5 text-left transition ${selected === mode.id ? 'border-amber-300/60 bg-amber-300/[0.10]' : 'border-white/10 bg-white/[0.035] hover:border-amber-300/30'}`}>{mode.badge ? <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">{mode.badge}</span> : null}<h3 className="mt-4 font-semibold text-white">{mode.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{mode.description}</p></button>)}</div>
    {selected === 'REVIEW_CURRENT_SHOPIFY_SETUP' ? <div className="mt-5 rounded-xl border border-sky-300/20 bg-sky-300/[0.07] p-4 text-sm leading-6 text-sky-100"><strong>Pending analysis:</strong> No store inspection runs now. Safe Defaults remain effective and onboarding can continue.</div> : null}
    {selected ? <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm text-slate-300 sm:grid-cols-2"><p><strong className="text-white">New products:</strong> Draft by default</p><p><strong className="text-white">Existing products:</strong> Review before updates</p><p><strong className="text-white">Inventory:</strong> Never overwritten</p><p><strong className="text-white">Deletions:</strong> Variants and images preserved</p></div> : null}
    {selected === 'MANUAL' ? <div className="mt-6 space-y-3">
      <Panel title="Approval and product status">
        <Select label="New product status" value={policies.newProductStatus} options={['DRAFT', 'ACTIVE_AFTER_APPROVAL', 'ARCHIVED', 'PRESERVE_SOURCE_STATUS'] as const} onChange={(value) => patch('newProductStatus', value)} />
        <Select label="Approval workflow" value={policies.approval.mode} options={['ALWAYS_REQUIRE_APPROVAL', 'REQUIRE_APPROVAL_FOR_RISKY_CHANGES', 'ALLOW_APPROVED_AUTOMATION'] as const} onChange={(value) => patch('approval', { ...policies.approval, mode: value })} />
        <Select label="Existing product updates" value={policies.existingProductUpdateMode} options={['CREATE_ONLY', 'UPDATE_EXISTING_AFTER_REVIEW', 'UPDATE_MATCHED_FIELDS_ONLY', 'FULL_MANAGED_UPDATE'] as const} onChange={(value) => patch('existingProductUpdateMode', value)} />
        <Select label="Vendor and Brand" value={policies.brandVendor.policy} options={['PRESERVE_VENDOR', 'USE_CATALOG_PROFILE_MAPPING', 'REQUIRE_REVIEW'] as const} onChange={(value) => patch('brandVendor', { policy: value })} />
      </Panel>
      <Panel title="Handles, variants and inventory">
        <Select label="Existing handles" value={policies.handle.policy} options={['PRESERVE_EXISTING', 'GENERATE_FOR_NEW_PRODUCTS_ONLY', 'UPDATE_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT'] as const} onChange={(value) => patch('handle', { ...policies.handle, policy: value })} />
        <Select label="Redirect safety" value={policies.handle.redirectPolicy} options={['CREATE_REDIRECT_WHEN_SUPPORTED', 'REQUIRE_MANUAL_CONFIRMATION', 'DO_NOT_CREATE_REDIRECT'] as const} onChange={(value) => patch('handle', { ...policies.handle, redirectPolicy: value })} />
        <Select label="Variant updates" value={policies.variants.updateMode} options={['PRESERVE_EXISTING', 'ADD_AND_UPDATE_APPROVED', 'FULL_MANAGED_VARIANTS'] as const} onChange={(value) => patch('variants', { ...policies.variants, updateMode: value })} />
        <Select label="Inventory" value={policies.inventory.policy} options={['NEVER_UPDATE_INVENTORY', 'UPDATE_AFTER_EXPLICIT_APPROVAL', 'EXTERNAL_SYSTEM_MANAGED'] as const} onChange={(value) => patch('inventory', { ...policies.inventory, policy: value })} />
      </Panel>
      <Panel title="Images, metafields and catalog organization">
        <Select label="Add images" value={policies.images.addition} options={['DO_NOT_ADD', 'ADD_APPROVED_IMAGES', 'ADD_ALL_APPROVED_PIPELINE_IMAGES'] as const} onChange={(value) => patch('images', { ...policies.images, addition: value })} />
        <Select label="Metafields" value={policies.metafields.policy} options={['DO_NOT_PUBLISH', 'PUBLISH_VERIFIED_ONLY', 'PUBLISH_APPROVED_ONLY', 'MANAGE_LISTINGPILOT_NAMESPACE', 'MANAGE_SELECTED_MAPPINGS'] as const} onChange={(value) => patch('metafields', { ...policies.metafields, policy: value })} />
        <Select label="Tags" value={policies.tags.mode} options={['PRESERVE_EXISTING', 'APPEND_APPROVED', 'MANAGE_LISTINGPILOT_TAGS'] as const} onChange={(value) => patch('tags', { ...policies.tags, mode: value })} />
        <Select label="Collections" value={policies.collections.mode} options={['DO_NOT_MANAGE', 'SUGGEST_ONLY', 'ADD_TO_APPROVED_MANUAL_COLLECTIONS'] as const} onChange={(value) => patch('collections', { ...policies.collections, mode: value })} />
      </Panel>
    </div> : null}
    {error ? <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p> : null}
    {selected ? <div className="mt-7 flex justify-end"><button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-45">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save Publishing Profile</button></div> : null}
    <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />No products, variants, images, inventory, SEO, collections, or metafields are changed in Shopify.</p>
    </fieldset>
  </div>;
}
