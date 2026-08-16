'use client';

import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  ShopifyImageConfigurationDto,
} from '../images/image-repository';
import {
  createShopifyImageClient,
  ShopifyImageClientError,
} from '../images/shopify-image-client';
import {
  parseProductImageImportResponse,
  type ProductSourceImageDto,
} from '@/modules/product-images/product-image-client-contract';

type Activity = 'idle' | 'adding' | 'finding' | 'uploading' | 'saving' | 'publishing' | 'refreshing';

export function ShopifyImagesPanel({
  projectId,
  containerProjectId,
  workspaceId,
  configured,
  connected,
  canManage,
  hasPublishedProduct,
  initialConfiguration,
  onNext,
}: {
  projectId: string;
  containerProjectId: string;
  workspaceId: string;
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  hasPublishedProduct: boolean;
  initialConfiguration: ShopifyImageConfigurationDto;
  onNext: () => void;
}) {
  const client = useRef(createShopifyImageClient());
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [activity, setActivity] = useState<Activity>('idle');
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sources, setSources] = useState<ProductSourceImageDto[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const shopifyReady = configured && connected && canManage;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/projects/${encodeURIComponent(containerProjectId)}/products/${encodeURIComponent(projectId)}/images/sources?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { sources?: typeof sources; error?: { message?: string } };
        if (!response.ok) throw new Error(body.error?.message ?? 'Source images could not be loaded.');
        setSources(body.sources ?? []);
      })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setFeedback(error.message); });
    return () => controller.abort();
  }, [containerProjectId, projectId, workspaceId]);

  async function importSelectedSources() {
    if (!selectedSourceIds.length || locked.current) return;
    locked.current = true;
    setActivity('adding');
    setFeedback(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(containerProjectId)}/products/${encodeURIComponent(projectId)}/images/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, sourceImageIds: selectedSourceIds }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'Selected images could not be imported.');
      const imported = parseProductImageImportResponse(body);
      setConfiguration(imported.configuration);
      setSources(imported.sources);
      setSelectedSourceIds([]);
      setFeedback(`${selectedSourceIds.length} source ${selectedSourceIds.length === 1 ? 'image' : 'images'} imported.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Selected images could not be imported.');
    } finally {
      locked.current = false;
      setActivity('idle');
    }
  }

  async function findImagesFromSource() {
    if (locked.current || !canManage) return;
    locked.current = true;
    setActivity('finding');
    setFeedback(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(containerProjectId)}/products/${encodeURIComponent(projectId)}/images/sources`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const body = await response.json() as { sources?: typeof sources; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'Source images could not be found.');
      setSources(body.sources ?? []);
      setSelectedSourceIds([]);
      setFeedback(body.sources?.length
        ? `${body.sources.length} source ${body.sources.length === 1 ? 'image' : 'images'} found.`
        : 'No usable product images were found on the saved source page.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Source images could not be found.');
    } finally {
      locked.current = false;
      setActivity('idle');
    }
  }

  function edit(localId: string, changes: Partial<
    ShopifyImageConfigurationDto['images'][number]
  >) {
    setConfiguration((current) => ({
      ...current,
      images: current.images.map((image) => (
        image.localId === localId ? { ...image, ...changes } : image
      )),
    }));
    setDirty(true);
    setFeedback(null);
  }

  function move(index: number, delta: number) {
    const destination = index + delta;
    if (destination < 0 || destination >= configuration.images.length) return;
    const images = [...configuration.images];
    [images[index], images[destination]] = [images[destination], images[index]];
    setConfiguration({
      ...configuration,
      images: images.map((image, position) => ({
        ...image,
        position,
        isPrimary: position === 0
          ? image.isPrimary || !images.some(({ isPrimary }) => isPrimary)
          : image.isPrimary,
      })),
    });
    setDirty(true);
  }

  async function run(
    next: Activity,
    operation: () => Promise<ShopifyImageConfigurationDto>,
    message: string,
  ) {
    if (locked.current) return;
    locked.current = true;
    setActivity(next);
    setFeedback(null);
    try {
      setConfiguration(await operation());
      setDirty(false);
      setFeedback(message);
      return true;
    } catch (error) {
      setFeedback(error instanceof ShopifyImageClientError
        ? error.message
        : 'The image operation could not be completed.');
      return false;
    } finally {
      locked.current = false;
      setActivity('idle');
    }
  }

  async function saveAndNext() {
    if (!dirty) { onNext(); return; }
    const saved = await run('saving', () => client.current.save(projectId, {
      version: configuration.version,
      images: configuration.images.map((image, position) => ({ localId: image.localId, altText: image.altText, position, isPrimary: image.isPrimary, active: true })),
    }), 'Image configuration saved.');
    if (saved) onNext();
  }

  function save() {
    void run('saving', () => client.current.save(projectId, {
      version: configuration.version,
      images: configuration.images.map((image, position) => ({
        localId: image.localId,
        altText: image.altText,
        position,
        isPrimary: image.isPrimary,
        active: true,
      })),
    }), 'Image configuration saved.');
  }

  async function publish() {
    if (locked.current || dirty) return;
    locked.current = true;
    setActivity('publishing');
    setFeedback(null);
    try {
      const result = await client.current.publish(projectId);
      setConfiguration(result.configuration);
      setFeedback(result.message);
    } catch (error) {
      setFeedback(error instanceof ShopifyImageClientError
        ? error.message
        : 'Shopify images could not be published.');
    } finally {
      locked.current = false;
      setActivity('idle');
    }
  }

  const disabled = !shopifyReady || activity !== 'idle';
  return (
    <section
      aria-labelledby="shopify-images-heading"
      className="rounded-[1.75rem] border border-white/10 bg-[#081423] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="shopify-images-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ImageIcon className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Product Images
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Add JPEG, PNG, or WEBP images. ListingPilot preserves unmanaged Shopify media and never deletes Shopify images automatically.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          {activity === 'idle'
            ? dirty ? 'Unsaved configuration'
              : configuration.lastPublishedAt ? 'Published' : 'Ready'
            : activity}
        </span>
      </div>

      {!configured || !connected ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          You can organize Product images now. Connect Shopify when you are ready to publish them.{' '}
          <Link href="/settings/shopify" className="font-semibold underline">Open settings</Link>
        </div>
      ) : !canManage ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          You can view images. Store-owner permission is required to make changes.
        </div>
      ) : null}

      <div className="mt-6 border-t border-white/10 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-white">Images found from source</h3><p className="mt-1 text-sm text-slate-400">Choose the product images you want ListingPilot to manage.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!canManage || activity !== 'idle'} onClick={() => void findImagesFromSource()} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40">Find images from source</button><button type="button" disabled={!canManage || !sources.some(({ status }) => status === 'DETECTED')} onClick={() => setSelectedSourceIds(sources.filter(({ status }) => status === 'DETECTED').map(({ id }) => id))} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40">Select all</button><button type="button" disabled={!canManage || !selectedSourceIds.length || activity !== 'idle'} onClick={() => void importSelectedSources()} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Import selected</button></div>
        </div>
        {sources.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sources.map((source) => <label key={source.id} className={`overflow-hidden rounded-xl border p-3 ${source.status === 'IMPORTED' ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-white/10 bg-white/[0.03]'}`}>
          <div className="relative aspect-square overflow-hidden rounded-lg bg-white/5">
            {/* Preview URLs are authenticated same-origin routes with validated image responses. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source.previewUrl} alt={source.altText ?? 'Detected product image'} className="h-full w-full object-contain" />
          </div>
          <div className="mt-3 flex items-start gap-2"><input type="checkbox" disabled={!canManage || source.status === 'IMPORTED'} checked={selectedSourceIds.includes(source.id)} onChange={() => setSelectedSourceIds((current) => current.includes(source.id) ? current.filter((id) => id !== source.id) : [...current, source.id])} className="mt-1 accent-amber-300" /><div className="min-w-0 text-xs text-slate-400"><p className="font-semibold text-slate-200">{source.status === 'IMPORTED' ? 'Imported ✓' : source.sourceKind.replaceAll('_', ' ').toLocaleLowerCase()}</p><p>{source.width && source.height ? `${source.width} × ${source.height}` : 'Dimensions checked on import'}</p><p className={source.quality === 'GOOD' ? 'text-emerald-300' : 'text-amber-300'}>{source.quality === 'GOOD' ? 'Good' : source.quality === 'LOW_RESOLUTION' ? 'Low resolution' : 'Needs attention'}</p></div></div>
        </label>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-400">Analyze a Product URL or Supplier URL to find source images.</div>}
      </div>

      <div className="mt-6 border-t border-white/10 pt-6"><h3 className="font-semibold text-white">Add images</h3><div className="mt-3 flex flex-wrap gap-2">
        <input
          value={remoteUrl}
          onChange={(event) => setRemoteUrl(event.target.value)}
          disabled={disabled}
          aria-label="Remote image URL"
          placeholder="https://example.com/product.jpg"
          className="min-h-11 min-w-64 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"
        />
        <button
          type="button"
          disabled={disabled || !remoteUrl.trim()}
          onClick={() => void run('adding', async () => {
            const result = await client.current.addRemote(projectId, {
              url: remoteUrl,
              altText: null,
            });
            setRemoteUrl('');
            return result;
          }, 'Remote image added.')}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add image URL
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void run(
              'uploading',
              () => client.current.upload(projectId, file, null),
              'Image uploaded.',
            );
            event.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" /> Upload image
        </button>
      </div></div>

      <div className="mt-6 border-t border-white/10 pt-6"><h3 className="font-semibold text-white">Product images</h3><div className="mt-4 space-y-3">
        {configuration.images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
            No images configured.
          </div>
        ) : configuration.images.map((image, index) => (
          <div key={image.localId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            {image.thumbnailUrl ? (
              // Shopify CDN URLs are server-validated and contain no staged secrets.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.thumbnailUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-lg bg-white/5">
                <ImageIcon className="h-5 w-5 text-slate-500" />
              </div>
            )}
            <div className="min-w-48 flex-1">
              <div className="flex gap-2 text-xs text-slate-400">
                <span>{image.sourceType === 'REMOTE_URL' ? 'Remote URL' : 'Local upload'}</span>
                <span>{image.status.toLocaleLowerCase()}</span>
                {image.isPrimary ? <span className="text-amber-300">Primary</span> : null}
                <span>{image.width && image.height ? `${image.width} × ${image.height}` : 'Dimensions unavailable'}</span>
                <span>{image.mimeType.replace('image/', '').toUpperCase()}</span>
              </div>
              <p className={`mt-1 text-xs ${image.quality === 'GOOD' ? 'text-emerald-300' : 'text-amber-300'}`}>{image.quality === 'GOOD' ? 'Good' : image.quality === 'LOW_RESOLUTION' ? 'Low resolution' : 'Needs attention'}{image.qualityWarning ? ` — ${image.qualityWarning}` : ''}</p>
              <input
                value={image.altText ?? ''}
                disabled={disabled}
                maxLength={512}
                aria-label={`Alt text for image ${index + 1}`}
                onChange={(event) => edit(image.localId, {
                  altText: event.target.value || null,
                })}
                placeholder="Optional alt text"
                className="mt-2 min-h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              />
              {image.lastError ? <p className="mt-1 text-xs text-rose-300">{image.lastError}</p> : null}
            </div>
            <div className="flex gap-1">
              <button type="button" disabled={disabled || index === 0} aria-label="Move image up" onClick={() => move(index, -1)} className="rounded-lg p-2 text-slate-300 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={disabled || index === configuration.images.length - 1} aria-label="Move image down" onClick={() => move(index, 1)} className="rounded-lg p-2 text-slate-300 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" disabled={disabled || image.isPrimary} onClick={() => {
                setConfiguration((current) => ({
                  ...current,
                  images: current.images.map((entry, position) => ({
                    ...entry,
                    isPrimary: entry.localId === image.localId,
                    position,
                  })).sort((left) => left.localId === image.localId ? -1 : 0)
                    .map((entry, position) => ({ ...entry, position })),
                }));
                setDirty(true);
              }} className="rounded-lg px-2 text-xs text-amber-300 disabled:opacity-30">Primary</button>
              <button type="button" disabled={disabled} aria-label="Remove image from ListingPilot" onClick={() => {
                const remaining = configuration.images.filter(({ localId }) => localId !== image.localId)
                  .map((entry, position) => ({
                    ...entry,
                    position,
                    isPrimary: position === 0 && (entry.isPrimary || image.isPrimary),
                  }));
                setConfiguration({ ...configuration, images: remaining });
                setDirty(true);
              }} className="rounded-lg p-2 text-rose-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div></div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Primary order applies among ListingPilot-managed images only; unrelated Shopify media keep their relative positions. Removing here does not delete media from Shopify.
      </p>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm"><h3 className="font-semibold text-white">Image quality</h3><p className="mt-1 text-slate-400">{configuration.images.filter(({ quality }) => quality === 'GOOD').length} images ready · {configuration.images.filter(({ quality }) => quality !== 'GOOD').length} need attention</p></div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !dirty} onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {activity === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        <button type="button" disabled={disabled} onClick={() => void saveAndNext()} className="min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">Save &amp; Next →</button>
        <button type="button" disabled={disabled || !hasPublishedProduct || dirty || !configuration.images.length} onClick={() => void publish()} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white disabled:opacity-50">
          Publish images
        </button>
        <button type="button" disabled={disabled} onClick={() => void run('refreshing', () => client.current.refresh(projectId), 'Shopify image status refreshed.')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-white disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh status
        </button>
      </div>
      {feedback ? <div role="status" className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{feedback}</div> : null}
    </section>
  );
}
