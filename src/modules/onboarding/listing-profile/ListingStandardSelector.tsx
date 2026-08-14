'use client';

import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  listingStandards,
  type ListingStandardId,
} from '@/modules/merchant-preferences/listing-standard';
import {
  merchantProfileSaveDestination,
  type MerchantProfileSurface,
} from '@/modules/settings/business-profile/routes';

export function ListingStandardSelector({
  workspaceId,
  initialVersion,
  initialStandardId = null,
  surface = 'onboarding',
  canManage = true,
}: {
  workspaceId: string;
  initialVersion: number | null;
  initialStandardId?: ListingStandardId | null;
  surface?: MerchantProfileSurface;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ListingStandardId | null>(initialStandardId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueToProfile() {
    if (!selected) {
      setError('Choose one listing standard to continue.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        surface === 'settings'
          ? '/api/settings/business-profile/listing-standard'
          : '/api/onboarding/listing-profile',
        {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          standardId: selected,
          expectedVersion: initialVersion,
        }),
        },
      );
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'The listing standard could not be saved.');
      const destination = merchantProfileSaveDestination({
        section: 'listing-standard',
        surface,
        workspaceId,
      });
      router.push(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The listing standard could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!canManage ? (
        <p className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">
          Only the workspace owner can change the Listing Standard.
        </p>
      ) : null}
      <fieldset disabled={!canManage} className="disabled:opacity-75">
      <div className="grid gap-4 md:grid-cols-2">
        {listingStandards.map((standard) => {
          const active = selected === standard.id;
          return (
            <button
              key={standard.id}
              type="button"
              aria-pressed={active}
              onClick={() => { setSelected(standard.id); setError(null); }}
              className={`relative rounded-2xl border p-5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${active ? 'border-amber-300/60 bg-amber-300/[0.10] shadow-[0_18px_40px_rgba(0,0,0,0.2)]' : 'border-white/10 bg-white/[0.035] hover:border-amber-300/35 hover:bg-amber-300/[0.04]'}`}
            >
              {active ? <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-slate-950"><Check className="h-4 w-4" /></span> : null}
              {standard.badge ? <span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">{standard.badge}</span> : null}
              <h2 className="mt-4 text-lg font-semibold text-white">{standard.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{standard.description}</p>
              {standard.id === 'NEOVIX' ? <p className="mt-4 text-xs font-medium text-amber-100">Brand-first titles · structured specifications · verified claims only</p> : null}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p> : null}
      <div className="mt-7 flex justify-end">
        <button type="button" onClick={continueToProfile} disabled={!selected || saving} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {surface === 'settings' ? 'Save and edit Listing Style' : 'Continue to Listing Profile'}
        </button>
      </div>
      </fieldset>
    </div>
  );
}
