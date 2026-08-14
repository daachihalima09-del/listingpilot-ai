'use client';

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  CloudDownload,
  LoaderCircle,
  Plus,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  merchantProfileSaveDestination,
  type MerchantProfileSurface,
} from '@/modules/settings/business-profile/routes';
import type {
  MerchantCatalogProfileDto,
  MerchantCatalogProfileValues,
  MerchantCatalogSetupMode,
} from './types';
import {
  merchantCatalogComparisonKey,
  merchantCatalogProfileInputSchema,
  normalizeMerchantCatalogValue,
} from './validation';

interface MerchantCatalogProfileFormProps {
  workspaceId: string;
  organizationId: string;
  workspaceName: string;
  shopName: string | null;
  shopDomain: string | null;
  shopifyConnected: boolean;
  canManage: boolean;
  initialProfile: MerchantCatalogProfileDto | null;
  surface?: MerchantProfileSurface;
}

type SectionKey = keyof MerchantCatalogProfileValues;

const emptyValues = (): MerchantCatalogProfileValues => ({
  collections: [],
  productTypes: [],
  vendors: [],
});

const sectionConfiguration: Array<{
  key: SectionKey;
  title: string;
  singular: string;
  placeholder: string;
  guidance: string;
}> = [
  {
    key: 'collections',
    title: 'Collections',
    singular: 'Collection',
    placeholder: 'Collection name',
    guidance: 'The collection names ListingPilot should recognize.',
  },
  {
    key: 'productTypes',
    title: 'Product Types',
    singular: 'Product type',
    placeholder: 'Product type',
    guidance: 'The product type values used to organize your catalog.',
  },
  {
    key: 'vendors',
    title: 'Vendors',
    singular: 'Vendor',
    placeholder: 'Vendor name',
    guidance: 'Shopify Vendor values exactly as your store uses them.',
  },
];

function valueError(values: string[], index: number): string | null {
  const normalized = normalizeMerchantCatalogValue(values[index] ?? '');
  if (!normalized) return 'Enter a value or remove this row.';
  if (normalized.length > 255) return 'Use 255 characters or fewer.';
  const key = merchantCatalogComparisonKey(normalized);
  if (values.findIndex((value) => (
    merchantCatalogComparisonKey(value) === key
  )) !== index) {
    return 'This value is already in the list.';
  }
  return null;
}

function CatalogListEditor({
  sectionKey,
  title,
  singular,
  placeholder,
  guidance,
  values,
  showErrors,
  onChange,
}: {
  sectionKey: SectionKey;
  title: string;
  singular: string;
  placeholder: string;
  guidance: string;
  values: string[];
  showErrors: boolean;
  onChange: (values: string[]) => void;
}) {
  function update(index: number, value: string) {
    onChange(values.map((current, currentIndex) => (
      currentIndex === index ? value : current
    )));
  }

  function move(index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= values.length) return;
    const reordered = [...values];
    [reordered[index], reordered[nextIndex]] = [
      reordered[nextIndex],
      reordered[index],
    ];
    onChange(reordered);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-400">
              {values.length}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-400">{guidance}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3.5 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300/45 hover:bg-amber-300/[0.13] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add {singular}
        </button>
      </div>

      {values.length === 0 ? (
        <button
          type="button"
          onClick={() => onChange([''])}
          className="mt-5 flex w-full items-center justify-center rounded-xl border border-dashed border-white/15 px-4 py-7 text-sm text-slate-400 transition hover:border-amber-300/30 hover:bg-amber-300/[0.04] hover:text-slate-200"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add your first {singular.toLocaleLowerCase('en-US')}
        </button>
      ) : (
        <div className="mt-5 space-y-3">
          {values.map((value, index) => {
            const error = showErrors ? valueError(values, index) : null;
            return (
              <div key={`${sectionKey}-${index}`}>
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 sm:flex">
                  <span className="w-6 shrink-0 text-center text-xs font-medium text-slate-600">
                    {index + 1}
                  </span>
                  <input
                    id={`${sectionKey}-${index}`}
                    value={value}
                    onChange={(event) => update(index, event.target.value)}
                    onBlur={(event) => update(
                      index,
                      normalizeMerchantCatalogValue(event.target.value),
                    )}
                    placeholder={placeholder}
                    aria-label={`${singular} ${index + 1}`}
                    aria-invalid={Boolean(error)}
                    className={`min-w-0 flex-1 rounded-xl border bg-[#07111f]/70 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:ring-2 ${
                      error
                        ? 'border-rose-400/50 focus:border-rose-400 focus:ring-rose-400/20'
                        : 'border-white/10 focus:border-amber-300/45 focus:ring-amber-300/15'
                    }`}
                  />
                  <div className="col-start-2 flex items-center gap-2 sm:contents">
                    <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-[#07111f]/70">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${singular.toLocaleLowerCase('en-US')} up`}
                        className="p-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === values.length - 1}
                        aria-label={`Move ${singular.toLocaleLowerCase('en-US')} down`}
                        className="border-l border-white/10 p-2 text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onChange(values.filter((_, itemIndex) => (
                        itemIndex !== index
                      )))}
                      aria-label={`Delete ${singular.toLocaleLowerCase('en-US')}`}
                      className="rounded-lg border border-white/10 p-2 text-slate-500 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {error ? (
                  <p className="ml-8 mt-1.5 text-xs text-rose-300">{error}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SetupModeCard({
  mode,
  recommended,
  title,
  description,
  note,
  disabled,
  onSelect,
}: {
  mode: MerchantCatalogSetupMode;
  recommended?: boolean;
  title: string;
  description: string;
  note?: string;
  disabled?: boolean;
  onSelect: (mode: MerchantCatalogSetupMode) => void;
}) {
  const Icon = mode === 'SHOPIFY_IMPORT' ? CloudDownload : Wrench;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(mode)}
      className="group flex h-full w-full flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-amber-300/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 sm:p-6"
    >
      <div className="flex w-full items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {recommended ? (
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Recommended
          </span>
        ) : null}
      </div>
      <h2 className="mt-5 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{description}</p>
      {note ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          {note}
        </p>
      ) : null}
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-200">
        Choose this method
        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}

export function MerchantCatalogProfileForm({
  workspaceId,
  organizationId,
  workspaceName,
  shopName,
  shopDomain,
  shopifyConnected,
  canManage,
  initialProfile,
  surface = 'onboarding',
}: MerchantCatalogProfileFormProps) {
  const router = useRouter();
  const initialValues = initialProfile
    ? {
        collections: initialProfile.collections,
        productTypes: initialProfile.productTypes,
        vendors: initialProfile.vendors,
      }
    : emptyValues();
  const [mode, setMode] = useState<MerchantCatalogSetupMode | null>(
    initialProfile?.setupMode ?? null,
  );
  const [drafts, setDrafts] = useState<
  Record<MerchantCatalogSetupMode, MerchantCatalogProfileValues>
  >({
    SHOPIFY_IMPORT: initialProfile?.setupMode === 'SHOPIFY_IMPORT'
      ? initialValues
      : emptyValues(),
    MANUAL: initialProfile?.setupMode === 'MANUAL'
      ? initialValues
      : emptyValues(),
  });
  const [importLoaded, setImportLoaded] = useState(
    initialProfile?.setupMode === 'SHOPIFY_IMPORT',
  );
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const activeValues = mode ? drafts[mode] : null;
  const validation = useMemo(() => (
    mode && activeValues
      ? merchantCatalogProfileInputSchema.safeParse({
          setupMode: mode,
          ...activeValues,
        })
      : null
  ), [activeValues, mode]);

  async function loadShopifyValues() {
    setImporting(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/onboarding/catalog-profile/import?${new URLSearchParams({
          workspaceId,
        })}`,
        { method: 'GET', headers: { accept: 'application/json' } },
      );
      const body = await response.json() as {
        values?: MerchantCatalogProfileValues;
        error?: { message?: string };
      };
      if (!response.ok || !body.values) {
        throw new Error(body.error?.message ?? 'Shopify import could not be completed.');
      }
      setDrafts((current) => ({ ...current, SHOPIFY_IMPORT: body.values! }));
      setImportLoaded(true);
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'Shopify import could not be completed.',
      });
    } finally {
      setImporting(false);
    }
  }

  async function selectMode(selectedMode: MerchantCatalogSetupMode) {
    setMode(selectedMode);
    setShowErrors(false);
    setNotice(null);
    if (
      selectedMode === 'SHOPIFY_IMPORT'
      && !importLoaded
      && shopifyConnected
    ) {
      await loadShopifyValues();
    }
  }

  function updateSection(section: SectionKey, values: string[]) {
    if (!mode) return;
    setDrafts((current) => ({
      ...current,
      [mode]: { ...current[mode], [section]: values },
    }));
    setNotice(null);
  }

  async function saveProfile() {
    setShowErrors(true);
    setNotice(null);
    if (!mode || !validation?.success) {
      setNotice({
        type: 'error',
        message: 'Resolve the highlighted catalog values before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/onboarding/catalog-profile', {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          expectedVersion: initialProfile?.version ?? null,
          ...validation.data,
        }),
      });
      const body = await response.json() as {
        profile?: MerchantCatalogProfileDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.profile) {
        throw new Error(body.error?.message ?? 'The catalog profile could not be saved.');
      }
      setNotice({
        type: 'success',
        message: 'Merchant Catalog Profile saved.',
      });
      if (surface === 'settings') {
        router.refresh();
      } else {
        router.push(merchantProfileSaveDestination({
          section: 'catalog',
          surface,
          organizationId,
          workspaceId,
        }));
      }
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'The catalog profile could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-5 text-sm text-amber-100">
        Only the workspace owner can configure the Merchant Catalog Profile.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Store className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {shopName || workspaceName}
            </p>
            <p className="truncate text-xs text-slate-500">
              {shopDomain || `${workspaceName} workspace`}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
          shopifyConnected
            ? 'bg-emerald-400/10 text-emerald-300'
            : 'bg-amber-300/10 text-amber-200'
        }`}>
          {shopifyConnected ? 'Shopify connected' : 'Manual setup available'}
        </span>
      </div>

      {!mode ? (
        <section>
          <h2 className="text-xl font-semibold text-white">
            How would you like to configure your catalog?
          </h2>
          <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2">
            <SetupModeCard
              mode="SHOPIFY_IMPORT"
              recommended
              title="Import from Shopify"
              description="Import your existing collections, product types and vendor information from Shopify. You'll be able to review and edit everything before saving."
              note="Nothing will be changed in your Shopify store during this step."
              disabled={!shopifyConnected}
              onSelect={selectMode}
            />
            <SetupModeCard
              mode="MANUAL"
              title="Configure Manually"
              description="Create your catalog structure manually by adding your collections, product types and vendor information."
              onSelect={selectMode}
            />
          </div>
          {!shopifyConnected ? (
            <p className="mt-4 text-sm text-amber-200">
              Connect Shopify to use the recommended import, or continue manually.
            </p>
          ) : null}
        </section>
      ) : (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200">
                {mode === 'SHOPIFY_IMPORT'
                  ? <CloudDownload className="h-5 w-5" aria-hidden="true" />
                  : <Wrench className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {mode === 'SHOPIFY_IMPORT'
                    ? 'Import from Shopify'
                    : 'Configure Manually'}
                </p>
                <p className="text-xs text-slate-500">
                  Edit and reorder values before saving.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setNotice(null);
                setShowErrors(false);
              }}
              className="w-full rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white sm:w-auto"
            >
              Change setup method
            </button>
          </div>

          {importing ? (
            <div className="my-8 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] py-12 text-sm text-slate-300">
              <LoaderCircle className="h-5 w-5 animate-spin text-amber-300" aria-hidden="true" />
              Reading catalog values from Shopify…
            </div>
          ) : activeValues ? (
            <div className="mt-6 space-y-4">
              {sectionConfiguration.map(({ key, ...section }) => (
                <CatalogListEditor
                  key={key}
                  {...section}
                  sectionKey={key}
                  values={activeValues[key]}
                  showErrors={showErrors}
                  onChange={(values) => updateSection(key, values)}
                />
              ))}
            </div>
          ) : null}

          {mode === 'SHOPIFY_IMPORT' && importLoaded && !importing ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-emerald-200">
                <Check className="h-4 w-4" aria-hidden="true" />
                Imported values are a private ListingPilot draft. Shopify remains unchanged.
              </p>
              <button
                type="button"
                onClick={loadShopifyValues}
                className="text-xs font-semibold text-emerald-200 underline decoration-emerald-300/30 underline-offset-4 hover:text-white"
              >
                Import fresh values
              </button>
            </div>
          ) : null}

          {notice ? (
            <div
              role={notice.type === 'error' ? 'alert' : 'status'}
              className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                notice.type === 'error'
                  ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-200'
                  : 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200'
              }`}
            >
              {notice.type === 'error'
                ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                : <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {notice.message}
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
            <p className="max-w-lg text-xs leading-5 text-slate-500">
              Saving creates an internal ListingPilot profile only. No catalog
              values are created or changed in Shopify.
            </p>
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving || importing}
              className="inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#081423] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {saving
                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving
                ? 'Saving…'
                : surface === 'settings'
                  ? 'Save Catalog Profile'
                  : 'Save and continue'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
