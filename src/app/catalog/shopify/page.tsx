import Link from 'next/link';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';
import { resolveShopifyCatalogContext } from '@/modules/shopify/catalog/catalog-context.server';
import { ShopifyCatalogError } from '@/modules/shopify/catalog/catalog-errors';
import { listShopifyCatalog } from '@/modules/shopify/catalog/catalog-service';
import { encodeShopifyProductReference } from '@/modules/shopify/catalog/catalog-validation';
import { ShopifyCatalogImportButton } from '@/modules/shopify/components/ShopifyCatalogImportButton';
import { prismaCatalogLinkStore } from '@/modules/shopify/repositories/prisma-catalog-link-store';

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ShopifyCatalogPage({ searchParams }: CatalogPageProps) {
  const user = await requireAuthenticatedUser();
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === 'string' ? query[key] as string : '';
  try {
    const context = await resolveShopifyCatalogContext(user.id);
    const input = {
      search: value('search'),
      status: value('status') || undefined,
      vendor: value('vendor') || undefined,
      productType: value('productType') || undefined,
      importState: value('importState') || 'ALL',
      cursor: value('cursor') || undefined,
    };
    const result = await listShopifyCatalog({
      requester: {
        request: (request) => requestShopifyAdminApi(context.workspace.id, request),
      },
      links: prismaCatalogLinkStore,
    }, context.workspace.id, input);
    const next = new URLSearchParams();
    for (const [key, current] of Object.entries(input)) {
      if (current && key !== 'cursor') next.set(key, current);
    }
    if (result.pageInfo.endCursor) next.set('cursor', result.pageInfo.endCursor);

    return (
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Connected store</p>
            <h1 className="mt-2 text-3xl font-semibold">Shopify Catalog</h1>
            <p className="mt-2 text-sm text-slate-400">{context.store.shopName ?? context.store.shopDomain}</p>
          </div>
          <Link href="/settings/shopify" className="text-sm text-amber-200 hover:underline">Shopify Settings</Link>
        </header>

        <form method="get" className="mt-7 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-6">
          <label className="md:col-span-2"><span className="mb-1 block text-xs text-slate-400">Search title, SKU, or product ID</span><input name="search" maxLength={100} defaultValue={input.search} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2" /></label>
          <label><span className="mb-1 block text-xs text-slate-400">Status</span><select name="status" defaultValue={input.status ?? ''} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2"><option value="">All</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></label>
          <label><span className="mb-1 block text-xs text-slate-400">Vendor</span><input name="vendor" maxLength={100} defaultValue={input.vendor} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2" /></label>
          <label><span className="mb-1 block text-xs text-slate-400">Product type</span><input name="productType" maxLength={100} defaultValue={input.productType} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2" /></label>
          <label><span className="mb-1 block text-xs text-slate-400">Import state</span><select name="importState" defaultValue={input.importState} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2"><option value="ALL">All</option><option value="IMPORTED">Imported</option><option value="NOT_IMPORTED">Not imported</option></select></label>
          <div className="flex gap-2 md:col-span-6"><button className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950">Apply</button><Link href="/catalog/shopify" className="rounded-lg border border-white/10 px-4 py-2">Clear filters</Link></div>
        </form>

        {result.products.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-white/10 p-8 text-center text-slate-300">No Shopify products match this catalog view.</div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-4">Product</th><th>Vendor / type</th><th>Status</th><th>Variants</th><th>Price</th><th>Updated</th><th className="p-4">Action</th></tr></thead>
              <tbody>
                {result.products.map((product) => (
                  <tr key={product.id} className="border-t border-white/10">
                    <td className="p-4"><div className="flex items-center gap-3">{product.featuredImage?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.featuredImage.url} alt={product.featuredImage.altText ?? product.title} className="h-12 w-12 rounded-lg object-cover" />
                    ) : <div className="h-12 w-12 rounded-lg bg-white/5" />}<span className="font-medium text-white">{product.title}</span></div></td>
                    <td><div>{product.vendor || '—'}</div><div className="text-xs text-slate-500">{product.productType || '—'}</div></td>
                    <td>{product.status}</td><td>{product.variantsCount.count}</td>
                    <td>{product.priceRangeV2.minVariantPrice.amount}{product.priceRangeV2.maxVariantPrice.amount !== product.priceRangeV2.minVariantPrice.amount ? ` – ${product.priceRangeV2.maxVariantPrice.amount}` : ''} {product.priceRangeV2.minVariantPrice.currencyCode}</td>
                    <td>{new Date(product.updatedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</td>
                    <td className="p-4"><div className="flex items-center gap-2"><Link className="rounded-lg border border-white/10 px-3 py-2" href={`/catalog/shopify/${encodeShopifyProductReference(product.id)}`}>Preview</Link>{product.importStatus.status === 'IMPORTED' && product.importStatus.projectId ? <Link className="rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-slate-950" href={`/workspace/${product.importStatus.projectId}`}>Open Project</Link> : product.importStatus.status === 'PROJECT_ARCHIVED' ? <Link className="rounded-lg border border-amber-300/20 px-3 py-2 text-amber-100" href="/projects?archived=true">View Archived Project</Link> : product.importStatus.status === 'RECOVERABLE_LINK' ? <ShopifyCatalogImportButton productId={product.id} label="Verify & Open Project" /> : product.importStatus.status === 'LINK_INCONSISTENT' ? <span className="max-w-56 text-xs text-rose-200">The existing ListingPilot link could not be safely verified.</span> : <ShopifyCatalogImportButton productId={product.id} />}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.pageInfo.hasNextPage && result.pageInfo.endCursor ? <div className="mt-6"><Link href={`/catalog/shopify?${next}`} className="rounded-lg border border-white/10 px-4 py-2">Next page</Link></div> : null}
      </div>
    );
  } catch (error) {
    const message = error instanceof ShopifyCatalogError ? error.message : 'The Shopify catalog is temporarily unavailable.';
    return <div role="alert" className="mx-auto mt-20 max-w-xl rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8"><h1 className="text-2xl font-semibold">Shopify Catalog</h1><p className="mt-3 text-slate-300">{message}</p><div className="mt-5 flex gap-3"><Link href="/settings/shopify" className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950">Shopify Settings</Link><Link href="/catalog/shopify" className="rounded-lg border border-white/10 px-4 py-2">Retry</Link></div></div>;
  }
}
