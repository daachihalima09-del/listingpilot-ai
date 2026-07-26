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
  MetafieldCatalogGroup,
} from '../metafields/metafield-catalog';
import type {
  ShopifyMetafieldConfigurationDto,
} from '../metafields/metafield-repository';
import {
  createShopifyMetafieldClient,
  ShopifyMetafieldClientError,
} from '../metafields/shopify-metafield-client';
import {
  getShopifyMetafieldViewState,
} from '../metafields/metafield-view-state';

const groups: Array<{
  id: MetafieldCatalogGroup;
  title: string;
  note?: string;
}> = [
  { id: 'SPECIFICATIONS', title: 'Specifications' },
  {
    id: 'PRODUCT_TRUTH',
    title: 'Product Truth',
    note: 'Only summary metadata is published. Evidence and source content remain private in ListingPilot.',
  },
  { id: 'GENERATED_CONTENT', title: 'Generated Content' },
  { id: 'SYSTEM_METADATA', title: 'System Metadata' },
];

interface Feedback {
  tone: 'success' | 'partial' | 'error';
  message: string;
}

export function ShopifyMetafieldsPanel({
  projectId,
  configured,
  connected,
  canManage,
  hasPublishedProduct,
  initialConfiguration,
}: {
  projectId: string;
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  hasPublishedProduct: boolean;
  initialConfiguration: ShopifyMetafieldConfigurationDto;
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
  const controlsEnabled = viewState === 'READY' && activity === 'idle';

  function toggle(catalogId: string) {
    if (!controlsEnabled) return;
    setConfiguration((current) => ({
      ...current,
      fields: current.fields.map((field) => (
        field.catalogId === catalogId
          ? { ...field, enabled: !field.enabled }
          : field
      )),
    }));
    setDirty(true);
    setFeedback(null);
  }

  async function save() {
    if (!controlsEnabled || !dirty || submitting.current) return;
    submitting.current = true;
    setActivity('saving');
    setFeedback(null);
    try {
      const saved = await client.current.save(projectId, {
        version: configuration.version,
        fields: configuration.fields.map(({ catalogId, enabled }) => ({
          catalogId,
          enabled,
        })),
      });
      setConfiguration(saved);
      setDirty(false);
      setFeedback({ tone: 'success', message: 'Metafield configuration saved.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyMetafieldClientError
          ? error.message
          : 'The metafield configuration could not be saved.',
      });
    } finally {
      submitting.current = false;
      setActivity('idle');
    }
  }

  async function publish() {
    if (!controlsEnabled || dirty || submitting.current) return;
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
          Shopify must be configured and connected before metafields can be managed.{' '}
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

      <div className="mt-5 space-y-5">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
              {group.title}
            </h3>
            {group.note ? (
              <p className="mt-1 text-xs leading-5 text-slate-500">{group.note}</p>
            ) : null}
            <div className="mt-2 grid gap-2">
              {configuration.fields
                .filter((field) => field.group === group.id)
                .map((field) => (
                  <div
                    key={field.catalogId}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{field.displayName}</span>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-500">
                          {field.type}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {field.publicationStatus.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{field.description}</p>
                      <p className="mt-1 truncate text-xs text-slate-300">
                        {field.preview ?? 'No mapped value'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.enabled}
                      aria-label={`${field.enabled ? 'Disable' : 'Enable'} ${field.displayName}`}
                      onClick={() => toggle(field.catalogId)}
                      disabled={!controlsEnabled || field.catalogId === 'listingpilot_system.schema_version' || field.catalogId === 'listingpilot_system.project_reference'}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                        field.enabled ? 'bg-amber-400' : 'bg-slate-700'
                      }`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-slate-950 transition ${
                        field.enabled ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

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
          disabled={!controlsEnabled || !dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {activity === 'saving'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Save className="h-4 w-4" aria-hidden="true" />}
          {activity === 'saving' ? 'Saving…' : 'Save configuration'}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={!controlsEnabled || dirty}
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
