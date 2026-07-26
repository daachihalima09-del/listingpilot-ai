'use client';

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  findNextAvailableCombination,
} from '../variants/option-combinations';
import {
  createShopifyVariantClient,
  ShopifyVariantClientError,
} from '../variants/shopify-variant-client';
import {
  SHOPIFY_MAX_PRODUCT_OPTIONS,
  shopifyVariantConfigurationSchema,
  type ShopifyVariantConfigurationDto,
  type ShopifyVariantConfigurationRequest,
} from '../variants/variant-validation';
import { getShopifyVariantViewState } from '../variants/variant-view-state';

type EditorVariant = ShopifyVariantConfigurationDto['variants'][number];

interface Feedback {
  tone: 'success' | 'error' | 'partial';
  message: string;
}

function cloneConfiguration(
  configuration: ShopifyVariantConfigurationDto,
): ShopifyVariantConfigurationDto {
  return structuredClone(configuration);
}

function saveRequest(
  configuration: ShopifyVariantConfigurationDto,
): ShopifyVariantConfigurationRequest {
  return {
    version: configuration.version,
    options: configuration.options.map((option) => ({
      name: option.name,
      values: [...option.values],
    })),
    variants: configuration.variants.map((variant) => ({
      optionValues: variant.optionValues.map((value) => ({ ...value })),
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      sku: variant.sku,
      barcode: variant.barcode,
    })),
  };
}

function blankVariant(
  optionValues: EditorVariant['optionValues'],
): EditorVariant {
  return {
    optionValues,
    price: '0.00',
    compareAtPrice: null,
    sku: null,
    barcode: null,
    published: false,
    firstPublishedAt: null,
    lastPublishedAt: null,
  };
}

export function ShopifyVariantsPanel({
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
  initialConfiguration: ShopifyVariantConfigurationDto;
}) {
  const client = useRef(createShopifyVariantClient());
  const submitting = useRef(false);
  const original = useRef(cloneConfiguration(initialConfiguration));
  const [configuration, setConfiguration] = useState(
    cloneConfiguration(initialConfiguration),
  );
  const [dirty, setDirty] = useState(initialConfiguration.version === 0);
  const [activity, setActivity] = useState<
  'idle' | 'saving' | 'publishing'>('idle');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const validation = useMemo(
    () => shopifyVariantConfigurationSchema.safeParse(
      saveRequest(configuration),
    ),
    [configuration],
  );
  const published = configuration.variants.some(
    ({ lastPublishedAt }) => Boolean(lastPublishedAt),
  );
  const viewState = getShopifyVariantViewState({
    configured,
    connected,
    hasPublishedProduct,
    canManage,
  });
  const controlsEnabled = (
    configured
    && connected
    && hasPublishedProduct
    && canManage
    && activity === 'idle'
  );

  function update(mutator: (draft: ShopifyVariantConfigurationDto) => void) {
    setConfiguration((current) => {
      const draft = cloneConfiguration(current);
      mutator(draft);
      return draft;
    });
    setDirty(true);
    setFeedback(null);
  }

  function addOption() {
    if (
      !controlsEnabled
      || configuration.options.length >= SHOPIFY_MAX_PRODUCT_OPTIONS
    ) return;
    update((draft) => {
      const name = `Option ${draft.options.length + 1}`;
      const value = 'Value 1';
      draft.options.push({ name, values: [value] });
      for (const variant of draft.variants) {
        variant.optionValues.push({ name, value });
      }
    });
  }

  function removeOption(index: number) {
    if (index < original.current.options.length) return;
    update((draft) => {
      draft.options.splice(index, 1);
      for (const variant of draft.variants) {
        variant.optionValues.splice(index, 1);
      }
      if (draft.options.length === 0 && draft.variants.length > 1) {
        draft.variants = [draft.variants[0]];
        draft.variants[0].optionValues = [];
      }
    });
  }

  function addOptionValue(optionIndex: number) {
    update((draft) => {
      const option = draft.options[optionIndex];
      option.values.push(`Value ${option.values.length + 1}`);
    });
  }

  function removeOptionValue(optionIndex: number, valueIndex: number) {
    const originalValue = original.current.options[optionIndex]?.values[valueIndex];
    if (originalValue || configuration.options[optionIndex].values.length <= 1) {
      return;
    }
    update((draft) => {
      const option = draft.options[optionIndex];
      const [removed] = option.values.splice(valueIndex, 1);
      const fallback = option.values[0];
      for (const variant of draft.variants) {
        if (variant.optionValues[optionIndex]?.value === removed) {
          variant.optionValues[optionIndex].value = fallback;
        }
      }
    });
  }

  function addVariant() {
    const combination = findNextAvailableCombination(
      configuration.options,
      configuration.variants.map(({ optionValues }) => optionValues),
    );
    if (!combination) {
      setFeedback({
        tone: 'error',
        message: 'Add another option value before adding a new combination.',
      });
      return;
    }
    update((draft) => {
      draft.variants.push(blankVariant(combination));
    });
  }

  function removeVariant(index: number) {
    if (configuration.variants[index].published) return;
    update((draft) => {
      draft.variants.splice(index, 1);
    });
  }

  async function handleSave() {
    if (!controlsEnabled || !dirty || !validation.success || submitting.current) {
      return;
    }
    submitting.current = true;
    setActivity('saving');
    setFeedback(null);
    try {
      const saved = await client.current.save(
        projectId,
        saveRequest(configuration),
      );
      setConfiguration(saved);
      original.current = cloneConfiguration(saved);
      setDirty(false);
      setFeedback({
        tone: 'success',
        message: 'Variant configuration saved.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyVariantClientError
          ? error.message
          : 'The variant configuration could not be saved.',
      });
    } finally {
      submitting.current = false;
      setActivity('idle');
    }
  }

  async function handlePublish() {
    if (
      !controlsEnabled
      || dirty
      || !validation.success
      || submitting.current
    ) return;
    submitting.current = true;
    setActivity('publishing');
    setFeedback(null);
    try {
      const result = await client.current.publish(projectId);
      setConfiguration(result.configuration);
      original.current = cloneConfiguration(result.configuration);
      setFeedback({
        tone: result.outcome === 'PARTIAL' ? 'partial' : 'success',
        message: result.outcome === 'PARTIAL'
          ? `${result.message} Remote variants were preserved.`
          : result.outcome === 'UNCHANGED'
            ? 'No Shopify variant changes were required.'
            : `Published ${result.created} new and ${result.updated} updated variant${result.updated === 1 ? '' : 's'}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof ShopifyVariantClientError
          ? error.message
          : 'Shopify variants could not be published.',
      });
    } finally {
      submitting.current = false;
      setActivity('idle');
    }
  }

  const stateLabel = activity === 'saving'
    ? 'Saving'
    : activity === 'publishing'
      ? 'Publishing'
      : viewState === 'CONFIGURATION_MISSING'
        ? 'Setup required'
        : viewState === 'NOT_CONNECTED'
          ? 'Not connected'
          : viewState === 'PRODUCT_NOT_PUBLISHED'
            ? 'Product required'
            : viewState === 'READ_ONLY'
              ? 'View only'
              : !validation.success
                ? 'Invalid'
                : dirty
                  ? 'Unsaved'
                  : published
                    ? 'Published'
                    : configuration.options.length
                      ? 'Multiple variants'
                      : 'Single variant';

  return (
    <section
      aria-labelledby="shopify-variants-heading"
      className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shopify-variants-heading" className="text-sm font-semibold text-slate-100">
            Variants &amp; Pricing
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Configure option combinations and basic Shopify pricing.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          {stateLabel}
        </span>
      </div>

      {viewState === 'CONFIGURATION_MISSING' || viewState === 'NOT_CONNECTED' ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Shopify must be configured and connected before variants can be managed.{' '}
          <Link href="/settings/shopify" className="font-semibold underline underline-offset-4">
            Open Shopify settings
          </Link>
        </div>
      ) : viewState === 'PRODUCT_NOT_PUBLISHED' ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          Publish this product to Shopify before configuring its variants.
        </div>
      ) : viewState === 'READ_ONLY' ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          You can view variant pricing. Store-owner permission is required to make changes.
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {configuration.options.map((option, optionIndex) => (
          <div key={`${optionIndex}-${option.name}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex gap-2">
              <input
                aria-label={`Option ${optionIndex + 1} name`}
                value={option.name}
                disabled={
                  !controlsEnabled
                  || optionIndex < original.current.options.length
                }
                onChange={(event) => update((draft) => {
                  const oldName = draft.options[optionIndex].name;
                  draft.options[optionIndex].name = event.target.value;
                  for (const variant of draft.variants) {
                    const selected = variant.optionValues.find(
                      ({ name }) => name === oldName,
                    );
                    if (selected) selected.name = event.target.value;
                  }
                })}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-white outline-none"
              />
              {optionIndex >= original.current.options.length && (
                <button
                  type="button"
                  aria-label={`Remove ${option.name}`}
                  onClick={() => removeOption(optionIndex)}
                  disabled={!controlsEnabled}
                  className="rounded-lg border border-rose-400/20 p-2 text-rose-200 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {option.values.map((value, valueIndex) => (
                <div key={`${valueIndex}-${value}`} className="flex items-center gap-1">
                  <input
                    aria-label={`${option.name} value ${valueIndex + 1}`}
                    value={value}
                    disabled={
                      !controlsEnabled
                      || Boolean(
                        original.current.options[optionIndex]?.values.includes(
                          value,
                        ),
                      )
                    }
                    onChange={(event) => update((draft) => {
                      const oldValue = draft.options[optionIndex].values[valueIndex];
                      draft.options[optionIndex].values[valueIndex] = event.target.value;
                      for (const variant of draft.variants) {
                        const selected = variant.optionValues[optionIndex];
                        if (selected?.value === oldValue) {
                          selected.value = event.target.value;
                        }
                      }
                    })}
                    className="w-32 rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-slate-200 outline-none"
                  />
                  {!original.current.options[optionIndex]?.values.includes(value) && option.values.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove ${value}`}
                      onClick={() => removeOptionValue(optionIndex, valueIndex)}
                      disabled={!controlsEnabled}
                      className="p-2 text-slate-500 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOptionValue(optionIndex)}
                disabled={!controlsEnabled}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add value
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addOption}
          disabled={
            !controlsEnabled
            || configuration.options.length >= SHOPIFY_MAX_PRODUCT_OPTIONS
            || (published && configuration.options.length > 0)
          }
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add option
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {configuration.variants.map((variant, variantIndex) => (
          <div key={variantIndex} className="rounded-xl border border-white/10 bg-[#07111f] p-4">
            {configuration.options.length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {configuration.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="text-xs text-slate-400">
                    <span className="mb-1 block">{option.name || `Option ${optionIndex + 1}`}</span>
                    <select
                      value={variant.optionValues[optionIndex]?.value ?? ''}
                      disabled={!controlsEnabled || variant.published}
                      onChange={(event) => update((draft) => {
                        draft.variants[variantIndex].optionValues[optionIndex] = {
                          name: draft.options[optionIndex].name,
                          value: event.target.value,
                        };
                      })}
                      className="rounded-lg border border-white/10 bg-[#081423] px-3 py-2 text-sm text-white"
                    >
                      {option.values.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Default Shopify variant
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['price', 'Price'],
                ['compareAtPrice', 'Compare-at price'],
                ['sku', 'SKU'],
                ['barcode', 'Barcode'],
              ] as const).map(([field, label]) => (
                <label key={field} className="text-xs text-slate-400">
                  <span className="mb-1 block">{label}</span>
                  <input
                    value={variant[field] ?? ''}
                    inputMode={field === 'price' || field === 'compareAtPrice' ? 'decimal' : 'text'}
                    disabled={!controlsEnabled}
                    onChange={(event) => update((draft) => {
                      const value = event.target.value;
                      if (field === 'price') {
                        draft.variants[variantIndex].price = value;
                      } else {
                        draft.variants[variantIndex][field] = value || null;
                      }
                    })}
                    className="w-full rounded-lg border border-white/10 bg-[#081423] px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
              ))}
            </div>
            {!variant.published && configuration.variants.length > 1 && (
              <button
                type="button"
                onClick={() => removeVariant(variantIndex)}
                disabled={!controlsEnabled}
                className="mt-3 inline-flex items-center gap-1 text-xs text-rose-200 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove local variant
              </button>
            )}
          </div>
        ))}
        {configuration.options.length > 0 && (
          <button
            type="button"
            onClick={addVariant}
            disabled={!controlsEnabled}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add variant combination
          </button>
        )}
      </div>

      {!validation.success && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {validation.error.issues[0]?.message ?? 'Correct the variant configuration.'}
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-500">
        ListingPilot never deletes Shopify variants automatically. Variants not managed here remain in Shopify.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!controlsEnabled || !dirty || !validation.success}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {activity === 'saving'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Save className="h-4 w-4" aria-hidden="true" />}
          {activity === 'saving' ? 'Saving…' : 'Save configuration'}
        </button>
        <button
          type="button"
          onClick={() => void handlePublish()}
          disabled={!controlsEnabled || dirty || !validation.success}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        >
          {activity === 'publishing'
            ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {activity === 'publishing' ? 'Publishing variants…' : 'Publish variants'}
        </button>
      </div>

      {feedback && (
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
      )}
    </section>
  );
}
