'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { projectApiRequest } from '@/modules/projects/client/project-api';

interface Summary {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  productType: string | null;
  collection: string | null;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  version: number;
  hasSource: boolean;
  hasAnalysis: boolean;
  hasListing: boolean;
  hasSeo: boolean;
  isShopifyReady: boolean;
  isShopifyLinked: boolean;
  listingStatus: string | null;
  reviewedSectionCount: number;
  hasStalePlan: boolean;
  archivedAt: string | null;
  updatedAt: string;
}

function intelligenceLabel(product: Summary): string {
  if (product.hasAnalysis) return product.isShopifyReady ? 'Ready' : 'Analyzed';
  return product.hasSource ? 'Not analyzed' : 'Not started';
}

function shopifyLabel(product: Summary): string {
  if (product.hasStalePlan) return 'Plan stale';
  if (!product.hasListing) return '—';
  return product.isShopifyLinked ? 'Linked' : 'Ready to prepare';
}

export function ProductListClient({
  project,
  organizationId,
  workspaceId,
  canManage,
  initialProducts,
}: {
  project: { id: string; name: string; defaultProductType: string | null; defaultCollection: string | null };
  organizationId: string;
  workspaceId: string;
  canManage: boolean;
  initialProducts: Summary[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [productType, setProductType] = useState(project.defaultProductType ?? '');
  const [collection, setCollection] = useState(project.defaultCollection ?? '');
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameProductType, setRenameProductType] = useState('');
  const [renameCollection, setRenameCollection] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createUnlinkedAsDraft, setCreateUnlinkedAsDraft] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const tenantQuery = new URLSearchParams({ organizationId, workspaceId }).toString();

  async function addProduct(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const response = await projectApiRequest<{ product: Summary }>(
        `/api/projects/${project.id}/products`,
        { method: 'POST', body: { workspaceId, name, productType: productType || null, collection: collection || null } },
      );
      setProducts((current) => [response.product, ...current]);
      setName('');
      setProductType(project.defaultProductType ?? '');
      setCollection(project.defaultCollection ?? '');
      setAdding(false);
      router.push(`/workspace/${project.id}/products/${response.product.id}?${tenantQuery}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product could not be created.');
    }
  }

  async function renameProduct(event: FormEvent, product: Summary) {
    event.preventDefault();
    setError(null);
    try {
      const response = await projectApiRequest<{ product: Summary }>(
        `/api/projects/${project.id}/products/${product.id}`,
        { method: 'PATCH', body: { workspaceId, version: product.version, name: renameValue, productType: renameProductType || null, collection: renameCollection || null } },
      );
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, ...response.product } : item));
      setRenamingId(null);
      setRenameValue('');
      setRenameProductType('');
      setRenameCollection('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Product could not be renamed.');
    }
  }

  const selectedProducts = products.filter(({ id }) => selectedIds.includes(id));
  const eligibleProducts = products.filter((product) => product.hasAnalysis && product.hasListing && product.listingStatus === 'SAVED' && product.reviewedSectionCount >= 6);

  function toggleProduct(productId: string) {
    setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  async function prepareBulkPublishing() {
    if (!selectedProducts.length || preparing) return;
    setError(null);
    setPreparing(true);
    try {
      const batch = await projectApiRequest<{ id: string }>(`/api/projects/${project.id}/bulk-shopify`, {
        method: 'POST',
        body: {
          workspaceId,
          products: selectedProducts.map((product) => ({
            productId: product.id,
            intent: product.isShopifyLinked ? 'REVIEW' : createUnlinkedAsDraft ? 'CREATE_NEW' : 'REVIEW',
          })),
        },
        timeoutMs: 120_000,
        timeoutMessage: 'Bulk preparation took too long. Refresh the Project before retrying.',
      });
      router.push(`/workspace/${project.id}/bulk-shopify?${new URLSearchParams({ organizationId, workspaceId, batchId: batch.id })}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The selected Products could not be prepared.');
      setPreparing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#071322] px-6 py-10 text-slate-100">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Project</p>
            <h1 className="mt-2 text-3xl font-bold">{project.name}</h1>
            <p className="mt-2 text-slate-400">This Project groups Products that you can analyze, prepare, and publish independently.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300"><span>{products.length} {products.length === 1 ? 'Product' : 'Products'}</span>{project.defaultProductType ? <span className="rounded-full bg-white/5 px-3 py-1">Default type: {project.defaultProductType}</span> : null}{project.defaultCollection ? <span className="rounded-full bg-white/5 px-3 py-1">Default collection: {project.defaultCollection}</span> : null}</div>
          </div>
          {canManage && (
            <button type="button" onClick={() => setAdding(true)} className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-200">
              Add Product
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={addProduct} className="mb-6 grid gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 sm:grid-cols-2">
            <label className="min-w-64 flex-1">
              <span className="mb-2 block text-sm font-medium">Product name</span>
              <input autoFocus required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3" />
            </label>
            <label><span className="mb-2 block text-sm font-medium">Product Type <span className="text-slate-500">(optional)</span></span><input maxLength={255} value={productType} onChange={(event) => setProductType(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3" /></label>
            <label><span className="mb-2 block text-sm font-medium">Collection <span className="text-slate-500">(optional)</span></span><input maxLength={255} value={collection} onChange={(event) => setCollection(event.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3" /></label>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button type="submit" className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950">Create</button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-slate-600 px-5 py-3">Cancel</button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="mb-5 rounded-xl border border-rose-700 bg-rose-950/40 p-4 text-rose-200">{error}</p>}

        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/60">
          <div className="grid grid-cols-[40px_minmax(220px,2fr)_repeat(4,minmax(100px,1fr))_auto] gap-4 border-b border-slate-700 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span aria-hidden="true" /><span>Product</span><span>Intelligence</span><span>Listing</span><span>Review</span><span>Shopify</span><span aria-hidden="true" />
          </div>
          {products.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400">No products yet. Add the first product to begin.</div>
          ) : products.map((product) => (
            <div key={product.id} className="grid grid-cols-[40px_minmax(220px,2fr)_repeat(4,minmax(100px,1fr))_auto] items-center gap-4 border-b border-slate-800 px-5 py-5 last:border-b-0">
              <input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleProduct(product.id)} aria-label={`Select ${product.name}`} className="h-5 w-5 accent-amber-300" />
              <div>{renamingId === product.id ? (
                <form onSubmit={(event) => renameProduct(event, product)} className="grid gap-2">
                  <input required minLength={2} maxLength={200} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" aria-label="Product name" />
                  <div className="grid gap-2 sm:grid-cols-2"><input maxLength={255} value={renameProductType} onChange={(event) => setRenameProductType(event.target.value)} className="min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" aria-label="Product type" placeholder="Product type (optional)" /><input maxLength={255} value={renameCollection} onChange={(event) => setRenameCollection(event.target.value)} className="min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" aria-label="Collection" placeholder="Collection (optional)" /></div>
                  <button type="submit" className="w-fit rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Save</button>
                </form>
              ) : <><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-slate-500">{[product.productType, product.collection].filter(Boolean).join(' · ') || 'No Project defaults'} · Updated {new Date(product.updatedAt).toLocaleDateString()}</p></>}</div>
              <span>{intelligenceLabel(product)}</span>
              <span>{product.hasListing ? 'Generated' : 'Not generated'}</span>
              <span>{product.listingStatus !== 'SAVED' ? product.hasListing ? 'Not saved' : '—' : product.reviewedSectionCount >= 6 ? 'Approved' : 'Needs review'}</span>
              <span>{shopifyLabel(product)}</span>
              <div className="flex gap-2">
                {canManage && <button type="button" onClick={() => { setRenamingId(product.id); setRenameValue(product.name); setRenameProductType(product.productType ?? ''); setRenameCollection(product.collection ?? ''); }} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-amber-300">Edit</button>}
                <Link href={`/workspace/${project.id}/products/${product.id}?${tenantQuery}`} className="rounded-lg border border-slate-600 px-4 py-2 font-medium hover:border-amber-300 hover:text-amber-200">Open</Link>
              </div>
            </div>
          ))}
        </div>
        {products.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" onClick={() => setSelectedIds(eligibleProducts.map(({ id }) => id))} className="rounded-lg border border-slate-700 px-3 py-2 hover:border-amber-300">Select all eligible</button>
          <button type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length} className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">Clear selection</button>
        </div>}
        {selectedProducts.length > 0 && canManage && <aside className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-300/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
          <div>
            <p className="font-semibold">{selectedProducts.length} {selectedProducts.length === 1 ? 'Product' : 'Products'} selected</p>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={createUnlinkedAsDraft} onChange={(event) => setCreateUnlinkedAsDraft(event.target.checked)} className="mt-1 accent-amber-300" />
              <span>Create all visibly selected unlinked Products as Shopify Drafts. Linked Products remain updates.</span>
            </label>
          </div>
          <button type="button" onClick={prepareBulkPublishing} disabled={preparing} className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50">
            {preparing ? 'Preparing…' : 'Prepare for Shopify'}
          </button>
        </aside>}
      </section>
    </main>
  );
}
