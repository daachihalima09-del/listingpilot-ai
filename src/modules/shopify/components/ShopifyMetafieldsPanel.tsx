'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  LoaderCircle,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type {
  ShopifyMetafieldConfigurationDto,
} from '../metafields/metafield-repository';
import {
  createShopifyMetafieldClient,
  ShopifyMetafieldClientError,
} from '../metafields/shopify-metafield-client';
import {
  canSaveLocalMetafieldConfiguration, getShopifyMetafieldViewState,
} from '../metafields/metafield-view-state';

interface Feedback {
  tone: 'success' | 'partial' | 'error';
  message: string;
}

export function MetafieldTechnicalDetails({ configuration }: { configuration: ShopifyMetafieldConfigurationDto }) {
  return <section className="rounded-2xl border border-white/10 bg-[#081423] p-5">
    <h3 className="text-sm font-semibold text-white">Metafield Technical Details</h3>
    <p className="mt-2 text-xs text-slate-500">Internal metadata, Shopify types, destinations, and publication state. Product Truth evidence remains private.</p>
    <div className="mt-4 grid gap-2">{configuration.fields.map((field) => <div key={field.catalogId} className="grid gap-1 rounded-lg border border-white/10 p-3 text-xs sm:grid-cols-[1fr_auto]"><span className="text-slate-300">{field.displayName}</span><span className="break-all text-slate-500">{field.namespace}.{field.key} · {field.type} · {field.publicationStatus.replaceAll('_', ' ')}</span></div>)}</div>
  </section>;
}

export function ShopifyMetafieldsPanel({
  projectId,
  configured,
  connected,
  canManage,
  hasPublishedProduct,
  initialConfiguration,
  onNext,
}: {
  projectId: string;
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  hasPublishedProduct: boolean;
  initialConfiguration: ShopifyMetafieldConfigurationDto;
  onNext?: () => void;
}) {
  const client = useRef(createShopifyMetafieldClient());
  const submitting = useRef(false);
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [dirty, setDirty] = useState(initialConfiguration.version === 0);
  const [activity, setActivity] = useState<
    'idle' | 'saving' | 'publishing'
  >('idle');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const viewState = getShopifyMetafieldViewState({
    configured,
    connected,
    hasPublishedProduct,
    canManage,
    hasMappedData: configuration.hasMappedData,
  });
  const localControlsEnabled = canSaveLocalMetafieldConfiguration({
    canManage,
    hasMappedData: configuration.hasMappedData,
  }) && activity === 'idle';
  const publishEnabled = viewState === 'READY' && activity === 'idle';

  function toggle(catalogId: string) {
    if (!localControlsEnabled || catalogId.startsWith('review.')) return;
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.map((field) => (
        field.catalogId === catalogId
          ? { ...field, enabled: !field.enabled }
          : field
      )),
      recommendations: current.recommendations.map((field) => (
        field.catalogId === catalogId ? { ...field, enabled: !field.enabled } : field
      )),
    }));
    setDirty(true);
    setFeedback(null);
  }

  function selectMapping(catalogId: string, value: string) {
    if (!localControlsEnabled) return;
    const [namespace, key] = value.split('.', 2);
    if (!namespace || !key) return;
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.map((field) => field.catalogId === catalogId ? { ...field, namespace, key } : field),
      recommendations: current.recommendations.map((field) => field.catalogId === catalogId ? {
        ...field,
        destination: value,
        status: 'MAPPED',
        note: 'Uses the compatible Shopify field selected by the merchant.',
      } : field),
    }));
    setDirty(true);
    setFeedback(null);
  }

  async function save(): Promise<boolean> {
    if (!localControlsEnabled || submitting.current) return false;
    if (!dirty) return true;
    submitting.current = true;
    setActivity('saving');
    setFeedback(null);
    try {
      const saved = await client.current.save(projectId, {
        version: configuration.version,
        fields: configuration.fields.map(({ catalogId, enabled, namespace, key }) => ({
          catalogId,
          enabled,
          namespace,
          key,
        })),
      });
      setConfiguration(saved);
      setDirty(false);
      setFeedback({ tone: 'success', message: 'Metafield configuration saved.' });
      return true;
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyMetafieldClientError
          ? error.message
          : 'The metafield configuration could not be saved.',
      });
      return false;
    } finally {
      submitting.current = false;
      setActivity('idle');
    }
  }

  async function publish() {
    if (!publishEnabled || dirty || submitting.current) return;
    submitting.current = true;
    setActivity('publishing');
    setFeedback(null);
    try {
      const result = await client.current.publish(projectId);
      setConfiguration(result.configuration);
      setFeedback({
        tone: result.outcome === 'PARTIAL' ? 'partial' : 'success',
        message: result.message,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyMetafieldClientError
          ? error.message
          : 'Shopify metafields could not be published.',
      });
    } finally {
      submitting.current = false;
      setActivity('idle');
    }
  }

  const stateLabel = activity === 'saving'
    ? 'Saving'
    : activity === 'publishing'
      ? 'Publishing metafields'
      : dirty
        ? 'Unsaved configuration'
        : configuration.conflicts.length
          ? 'Definition conflict'
          : configuration.lastPublishedAt
            ? 'Published'
            : viewState === 'READY'
              ? 'Ready'
              : viewState.replaceAll('_', ' ').toLocaleLowerCase('en-US');

  return (
    <section
      aria-labelledby="shopify-metafields-heading"
      className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shopify-metafields-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Database className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Shopify Metafields
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Metafields publish structured ListingPilot data to Shopify for future filtering, merchandising, and theme use.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          {stateLabel}
        </span>
      </div>

      {viewState === 'CONFIGURATION_MISSING' || viewState === 'NOT_CONNECTED' ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          You can review and save this local configuration now. Connect Shopify later to discover definitions or publish.{' '}
          <Link href="/settings/shopify" className="font-semibold underline underline-offset-4">
            Open Shopify settings
          </Link>
        </div>
      ) : viewState === 'PRODUCT_NOT_PUBLISHED' ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Publish this product to Shopify before publishing metafields.
        </div>
      ) : viewState === 'READ_ONLY' ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          You can view metafields. Store-owner permission is required to save or publish.
        </div>
      ) : viewState === 'NO_MAPPED_DATA' ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          Analyze and save structured project data before publishing metafields.
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {([
          ['Recommended', configuration.summary.recommended],
          ['Mapped', configuration.summary.mapped],
          ['Needs review', configuration.summary.needsReview],
          ['Optional', configuration.summary.optional],
        ] as const).map(([label, count]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-2xl font-semibold text-white">{count}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Structured Product Data</p>
        <h3 className="mt-2 text-lg font-semibold text-white">Recommended for {configuration.catalogCategory.replaceAll('_', ' ').toLocaleLowerCase('en-US')}</h3>
        <p className="mt-1 text-sm text-slate-400">Only verified Product Truth is recommended automatically.</p>
        <div className="mt-3 grid gap-2">
          {configuration.recommendations.length ? configuration.recommendations.map((field) => (
                  <div
                    key={field.catalogId}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{field.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${field.status === 'NEEDS_REVIEW' ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}`}>
                          {field.status.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-200">{field.value}</p>
                      <p className="mt-1 text-xs text-slate-500">{field.destination} · {field.note}</p>
                      {field.options.length > 1 ? <select aria-label={`Choose Shopify field for ${field.label}`} value={field.status === 'MAPPED' ? field.destination : ''} onChange={(event) => selectMapping(field.catalogId, event.target.value)} className="mt-2 rounded-lg border border-white/10 bg-[#0d1a2b] px-3 py-2 text-xs text-slate-200"><option value="">Choose a compatible Shopify field</option>{field.options.map((option) => <option key={`${option.namespace}.${option.key}`} value={`${option.namespace}.${option.key}`}>{option.label} ({option.namespace}.{option.key})</option>)}</select> : null}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.enabled}
                      aria-label={`${field.enabled ? 'Disable' : 'Enable'} ${field.label}`}
                      onClick={() => toggle(field.catalogId)}
                      disabled={!localControlsEnabled || field.status === 'NEEDS_REVIEW'}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                        field.enabled ? 'bg-amber-400' : 'bg-slate-700'
                      }`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-slate-950 transition ${
                        field.enabled ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>
                )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No category-specific verified attributes are available yet. Verified specifications remain available in technical details.</div>}
        </div>
      </div>

      {configuration.nativeFields.length ? <div className="mt-6"><h3 className="text-sm font-semibold text-white">Managed in Listing</h3><p className="mt-1 text-xs text-slate-500">These are native Shopify product fields, not metafields.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{configuration.nativeFields.map((field) => <div key={`${field.label}-${field.value}`} className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-500">{field.label}</p><p className="mt-1 text-sm text-slate-200">{field.value}</p></div>)}</div></div> : null}

      {configuration.conflicts.map((conflict) => (
        <div key={conflict.catalogId} role="alert" className="mt-4 flex gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Shopify already has an incompatible definition for {conflict.displayName}.
            ListingPilot did not overwrite it. Expected {conflict.expectedType}; found {conflict.existingType}.
            Review this definition in Shopify Admin.
          </span>
        </div>
      ))}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!localControlsEnabled || !dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {activity === 'saving'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Save className="h-4 w-4" aria-hidden="true" />}
          {activity === 'saving' ? 'Saving…' : 'Save configuration'}
        </button>
        {onNext ? (
          <button
            type="button"
            onClick={() => void (async () => {
              if (await save()) onNext();
            })()}
            disabled={!localControlsEnabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            Save &amp; Continue to Shopify &#8594;
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void publish()}
          disabled={!publishEnabled || dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {activity === 'publishing'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {activity === 'publishing' ? 'Publishing…' : 'Publish metafields'}
        </button>
      </div>

      {feedback ? (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`mt-5 rounded-xl border p-4 text-sm ${
            feedback.tone === 'error'
              ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
              : feedback.tone === 'partial'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}
    </section>
  );
}
