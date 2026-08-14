import type { AssembledShopifyListing } from '../content/shopify-description';

export function ShopifyListingPreview({
  listing,
  notice,
}: {
  readonly listing: AssembledShopifyListing;
  readonly notice?: string;
}) {
  return (
    <section aria-label="Shopify Preview" className="rounded-[1.75rem] border border-amber-300/20 bg-[#081423] p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Shopify Preview</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">What your Shopify customer will see</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">This preview is assembled from the structured draft without another AI call.</p>
      {notice ? <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">{notice}</p> : null}

      <div className="mt-6 space-y-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Product Title</h3>
          <p className="mt-2 text-xl font-semibold leading-8 text-white">{listing.title}</p>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Product Description</h3>
          <div
            className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-[#07111f] p-5 text-sm leading-7 text-slate-200 [&_h3]:pt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_p]:m-0"
            dangerouslySetInnerHTML={{ __html: listing.descriptionHtml }}
          />
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SEO Preview</h3>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-medium text-sky-200">{listing.seoTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{listing.seoDescription}</p>
          </div>
        </section>
      </div>
    </section>
  );
}
