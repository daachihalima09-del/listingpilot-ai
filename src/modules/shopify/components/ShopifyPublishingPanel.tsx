'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  ShoppingBag,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SHOPIFY_PUBLISH_STATUS,
  isMappedShopifyProductValid,
  mapListingToShopifyProduct,
  type ListingPilotPublishSource,
  type ShopifyPublishStatus,
} from '../publishing/listing-mapping';
import type {
  ShopifyPublishedProductReference,
  ShopifyPublishingContext,
} from '../publishing/publication-types';
import {
  getShopifyPublishingAvailability,
} from '../publishing/publishing-view';
import {
  createShopifyPublicationClient,
  safeShopifyAdminUrl,
  ShopifyPublicationClientError,
} from '../publishing/shopify-publication-client';

type Feedback =
  | { tone: 'success'; message: string }
  | { tone: 'unchanged'; message: string }
  | { tone: 'error'; message: string }
  | { tone: 'partial'; message: string };

function recoveryStorageKey(projectId: string): string {
  return `listingpilot:shopify-recovery:${projectId}`;
}

export function ShopifyPublishingPanel({
  projectId,
  source,
  initialContext,
}: {
  projectId: string;
  source: ListingPilotPublishSource;
  initialContext: ShopifyPublishingContext;
}) {
  const client = useRef(createShopifyPublicationClient());
  const submitting = useRef(false);
  const recoveryReceiptRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ShopifyPublishStatus>(
    DEFAULT_SHOPIFY_PUBLISH_STATUS,
  );
  const [publication, setPublication] = useState<
  ShopifyPublishedProductReference | null>(initialContext.publication);
  const [adminUrl, setAdminUrl] = useState(
    safeShopifyAdminUrl(initialContext.adminUrl),
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const context = { ...initialContext, publication };
  const availability = getShopifyPublishingAvailability(context);
  const mappedProduct = useMemo(
    () => mapListingToShopifyProduct(source, status),
    [source, status],
  );
  const mode = publication && !linkPending
    ? 'update' as const
    : 'create' as const;
  const mappingValid = isMappedShopifyProductValid(mappedProduct, mode);
  const canPublish = (
    availability === 'READY'
    || availability === 'PUBLISHED'
  ) && mappingValid && !isPublishing;

  async function handlePublish() {
    if (!canPublish || submitting.current) return;
    submitting.current = true;
    setIsPublishing(true);
    setFeedback(null);

    const key = recoveryStorageKey(projectId);
    let recoveryReceipt = mode === 'create'
      ? recoveryReceiptRef.current ?? undefined
      : undefined;
    if (mode === 'create' && !recoveryReceipt) {
      try {
        recoveryReceipt = window.sessionStorage.getItem(key) ?? undefined;
      } catch {
        recoveryReceipt = undefined;
      }
    }
    try {
      const result = await client.current.publish({
        projectId,
        mode,
        product: mappedProduct,
        recoveryReceipt,
      });
      setPublication(result.publication);
      setAdminUrl(safeShopifyAdminUrl(result.adminUrl));

      if (result.outcome === 'LINK_PENDING') {
        if (result.recoveryReceipt) {
          recoveryReceiptRef.current = result.recoveryReceipt;
          setLinkPending(true);
          try {
            window.sessionStorage.setItem(key, result.recoveryReceipt);
          } catch {
            // The in-memory encrypted receipt still protects this page session.
          }
        }
        setFeedback({
          tone: 'partial',
          message: result.recoveryReceipt
            ? 'The product was created in Shopify, but its project link could not be saved. Retry to save the link without creating another product.'
            : 'Shopify was updated, but the latest publish details could not be saved. Retry to finish saving.',
        });
      } else {
        recoveryReceiptRef.current = null;
        setLinkPending(false);
        try {
          window.sessionStorage.removeItem(key);
        } catch {
          // Storage is optional after the durable project link succeeds.
        }
        if (result.outcome === 'UNCHANGED') {
          setFeedback({
            tone: 'unchanged',
            message: 'No Shopify changes were required.',
          });
        } else if (result.outcome === 'UPDATED') {
          setFeedback({
            tone: 'success',
            message: result.changedFields.length
              ? `Updated Shopify fields: ${result.changedFields.join(', ')}.`
              : 'The Shopify product was updated.',
          });
        } else {
          setFeedback({
            tone: 'success',
            message: result.outcome === 'RECOVERED'
              ? 'The Shopify product link was saved successfully.'
              : 'The product was published to Shopify successfully.',
          });
        }
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyPublicationClientError
          ? error.message
          : 'The Shopify publish could not be completed. Your listing is unchanged.',
      });
    } finally {
      submitting.current = false;
      setIsPublishing(false);
    }
  }

  const buttonLabel = linkPending
    ? 'Save Shopify Product Link'
    : publication
      ? 'Update Shopify Product'
    : status === 'ACTIVE'
      ? 'Publish Active Product'
      : 'Publish Draft to Shopify';
  const stateLabel = isPublishing
    ? 'Publishing'
    : availability === 'CONFIGURATION_MISSING'
      ? 'Setup required'
      : availability === 'NOT_CONNECTED'
        ? 'Not connected'
        : availability === 'READ_ONLY'
          ? 'View only'
          : publication
            ? 'Published'
            : 'Ready';

  return (
    <section
      aria-labelledby="shopify-publishing-heading"
      className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <h2 id="shopify-publishing-heading" className="text-sm font-semibold text-slate-100">
              Publish to Shopify
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Publish this generated listing as a draft or active product.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          {stateLabel}
        </span>
      </div>

      {availability === 'CONFIGURATION_MISSING' && (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Shopify publishing is not configured. Ask the workspace owner to finish setup.
        </div>
      )}

      {availability === 'NOT_CONNECTED' && (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p>No Shopify store is connected to this workspace.</p>
          <Link href="/settings/shopify" className="mt-2 inline-block font-semibold underline underline-offset-4">
            Open Shopify settings
          </Link>
        </div>
      )}

      {availability === 'READ_ONLY' && (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          You can view Shopify publish details. Store-owner permission is required to publish or update.
        </div>
      )}

      {publication && (
        <dl className="mt-5 grid gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Product</dt>
            <dd className="mt-1 text-sm font-medium text-white">{publication.title}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Status</dt>
            <dd className="mt-1 text-sm font-medium text-white">{publication.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-slate-500">Handle</dt>
            <dd className="mt-1 break-all text-sm text-slate-300">{publication.handle ?? 'Not available'}</dd>
          </div>
          {adminUrl && (
            <div className="flex items-end">
              <a
                href={adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Open in Shopify Admin
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </dl>
      )}

      {(availability === 'READY' || availability === 'PUBLISHED') && (
        <div className="mt-5">
          <fieldset disabled={isPublishing}>
            <legend className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Shopify status
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {(['DRAFT', 'ACTIVE'] as const).map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${
                    status === value
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="shopify-status"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    className="sr-only"
                  />
                  {value === 'DRAFT' ? 'Draft' : 'Active'}
                </label>
              ))}
            </div>
          </fieldset>

          {!mappingValid && (
            <div role="alert" className="mt-4 flex items-start gap-2 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Complete the product title and correct the listing details before publishing.
            </div>
          )}

          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={!canPublish}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing
              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
            {isPublishing ? 'Publishing to Shopify…' : buttonLabel}
          </button>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`mt-5 flex items-start gap-2 rounded-xl border p-4 text-sm ${
            feedback.tone === 'error'
              ? 'border-rose-400/20 bg-rose-400/10 text-rose-200'
              : feedback.tone === 'partial'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {feedback.tone === 'success' || feedback.tone === 'unchanged'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </section>
  );
}
