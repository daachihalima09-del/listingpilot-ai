import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';
import { resolveShopifyCatalogContext } from '@/modules/shopify/catalog/catalog-context.server';
import { fetchShopifyCatalogProduct } from '@/modules/shopify/catalog/catalog-service';
import { decodeShopifyProductReference } from '@/modules/shopify/catalog/catalog-validation';
import { normalizeShopifyProductSnapshot, stripExternalHtml } from '@/modules/shopify/catalog/snapshot';
import { ShopifyCatalogImportButton } from '@/modules/shopify/components/ShopifyCatalogImportButton';
import { getShopifyConfig } from '@/modules/shopify/config';

export default async function ShopifyProductPreview({
  params,
}: {
  params: Promise<{ productReference: string }>;
}) {
  const user = await requireAuthenticatedUser();
  let productId: string;
  try {
    productId = decodeShopifyProductReference((await params).productReference);
  } catch {
    notFound();
  }
  const context = await resolveShopifyCatalogContext(user.id);
  const raw = await fetchShopifyCatalogProduct({
    request: (request) => requestShopifyAdminApi(context.workspace.id, request),
  }, productId);
  const snapshot = normalizeShopifyProductSnapshot(raw, getShopifyConfig().apiVersion);
  const product = snapshot.product;
  return (
    <article className="mx-auto max-w-4xl">
      <Link href="/catalog/shopify" className="text-sm text-amber-200 hover:underline">← Shopify Catalog</Link>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-slate-500">{product.status}</p><h1 className="mt-2 text-3xl font-semibold">{product.title}</h1><p className="mt-2 text-slate-400">{product.vendor} · {product.productType}</p></div><ShopifyCatalogImportButton productId={product.id} /></div>
        <p className="mt-6 whitespace-pre-wrap leading-7 text-slate-300">{stripExternalHtml(product.descriptionHtml) || 'No description.'}</p>
        <dl className="mt-7 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Variants</dt><dd>{product.variants.length}</dd></div><div><dt className="text-xs text-slate-500">Media</dt><dd>{product.media.length}</dd></div><div><dt className="text-xs text-slate-500">Updated</dt><dd>{new Date(product.updatedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</dd></div></dl>
        <h2 className="mt-8 text-xl font-semibold">Variants</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-2">Title</th><th>SKU</th><th>Price</th><th>Compare at</th></tr></thead><tbody>{product.variants.map((variant) => <tr key={variant.id} className="border-t border-white/10"><td className="py-3">{variant.title}</td><td>{variant.sku ?? '—'}</td><td>{variant.price}</td><td>{variant.compareAtPrice ?? '—'}</td></tr>)}</tbody></table></div>
        <p className="mt-7 rounded-xl bg-amber-400/5 p-4 text-sm text-amber-100">Shopify has not been modified. Imported information remains source-derived and unverified until reviewed in ListingPilot.</p>
      </div>
    </article>
  );
}

