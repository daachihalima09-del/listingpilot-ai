'use client';

import type { ListingDraftInput } from '@/modules/listing-draft';
import Image from 'next/image';
import type { AssembledShopifyListing } from '../content/shopify-description';
import type { ShopifyImageConfigurationDto } from '../images/image-repository';
import type { ShopifyMetafieldConfigurationDto } from '../metafields/metafield-repository';
import type { ShopifyPublishingContext } from '../publishing/publication-types';
import type { ShopifyVariantConfigurationDto } from '../variants/variant-validation';

type EditArea = 'LISTING' | 'IMAGES' | 'METAFIELDS';

const valueOrState = (value: string | null | undefined) => value?.trim() || 'Not set';

function ReviewCard({ title, onEdit, editLabel, children }: {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
  children: React.ReactNode;
}) {
  return <section className="rounded-[1.5rem] border border-white/10 bg-[#081423] p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">{title}</h2>
      {onEdit ? <button type="button" onClick={onEdit} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-white/5">{editLabel}</button> : null}
    </div>
    <div className="mt-4">{children}</div>
  </section>;
}

export function ShopifyProductReview({
  listing,
  draft,
  images,
  variants,
  metafields,
  publishing,
  storeName,
  reviewComplete,
  onEdit,
  publishHref,
}: {
  listing: AssembledShopifyListing;
  draft: ListingDraftInput;
  images: ShopifyImageConfigurationDto | null;
  variants: ShopifyVariantConfigurationDto | null;
  metafields: ShopifyMetafieldConfigurationDto | null;
  publishing: ShopifyPublishingContext | undefined;
  storeName: string | null;
  reviewComplete: boolean;
  onEdit: (area: EditArea) => void;
  publishHref: string;
}) {
  const configuredImages = images?.images.filter(({ status }) => status !== 'INACTIVE') ?? [];
  const selectedMetafields = metafields?.recommendations.filter(({ enabled, status }) => enabled && status !== 'NEEDS_REVIEW') ?? [];
  const firstVariant = variants?.variants[0];
  const destination = publishing?.publication ? 'Update Existing Product' : 'Destination will be selected during final review.';
  const handle = valueOrState(draft.seo.handle.value);

  return <div className="space-y-6" aria-label="Shopify Product Review">
    <header className="rounded-[1.75rem] border border-amber-300/20 bg-[#081423] p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Shopify</p>
      <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Review the complete Product before publishing.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Review how ListingPilot has prepared this Product for your Shopify store.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs">{[
        ['Content', draft.status === 'SAVED' && reviewComplete ? 'Reviewed' : 'Needs review'],
        ['Images', configuredImages.length ? 'Selected' : 'Not set'],
        ['Organization', draft.reviewWorkspace?.reviewedSections.includes('CATALOG') ? 'Reviewed' : 'Needs review'],
        ['Pricing / Variants', firstVariant ? 'Configured' : 'Not set'],
        ['SEO', draft.reviewWorkspace?.reviewedSections.includes('SEO') ? 'Reviewed' : 'Needs review'],
        ['Metafields', selectedMetafields.length ? 'Selected' : 'Not set'],
      ].map(([label, state]) => <span key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-300">{label}: {state}</span>)}</div>
    </header>

    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
      <div className="min-w-0 space-y-6">
        <ReviewCard title="Product" onEdit={() => onEdit('LISTING')} editLabel="Edit Listing">
          <h3 className="text-xl font-semibold leading-8 text-white">{listing.title}</h3>
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-[#07111f] p-4 text-sm leading-7 text-slate-200 [&_h3]:pt-3 [&_h3]:font-semibold [&_h3]:text-white [&_p]:m-0" dangerouslySetInnerHTML={{ __html: listing.descriptionHtml }} />
        </ReviewCard>

        <ReviewCard title="Media" onEdit={() => onEdit('IMAGES')} editLabel="Edit Images">
          <p className="text-sm text-slate-400">{configuredImages.length ? `${configuredImages.length} Product image${configuredImages.length === 1 ? '' : 's'} selected` : 'No Product images selected'}</p>
          {configuredImages.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{configuredImages.slice(0, 8).map((image) => <div key={image.localId} className="overflow-hidden rounded-xl border border-white/10 bg-white/5"><div className="relative aspect-square bg-[#07111f]">{image.thumbnailUrl ? <Image src={image.thumbnailUrl} alt={image.altText || 'Product image'} fill sizes="(max-width: 640px) 50vw, 200px" unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-500">Preview unavailable</div>}</div><div className="p-2 text-[11px] text-slate-400">{image.isPrimary ? 'Primary · ' : ''}{image.quality === 'GOOD' ? 'Ready' : 'Needs review'}</div></div>)}</div> : null}
        </ReviewCard>

        <ReviewCard title="Pricing" onEdit={() => onEdit('LISTING')} editLabel="Edit Variants">
          <dl className="grid gap-3 sm:grid-cols-2">{[
            ['Price', firstVariant?.price], ['Compare-at Price', firstVariant?.compareAtPrice],
            ['SKU', firstVariant?.sku], ['Barcode', firstVariant?.barcode],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-white">{valueOrState(value)}</dd></div>)}</dl>
        </ReviewCard>

        <ReviewCard title="Inventory / Shipping">
          <dl className="grid gap-3 sm:grid-cols-3">{[
            ['Inventory tracking', 'Managed in Shopify'], ['Weight', 'Not changed by ListingPilot'], ['Physical Product', 'Managed in Shopify'],
          ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value}</dd></div>)}</dl>
        </ReviewCard>

        <ReviewCard title="Variants" onEdit={() => onEdit('LISTING')} editLabel="Edit Variants">
          {variants?.options.length ? <div className="space-y-3">{variants.options.map((option) => <div key={option.name}><p className="text-xs text-slate-500">{option.name}</p><p className="mt-1 text-sm text-white">{option.values.join(', ')}</p></div>)}<p className="text-sm text-slate-300">{variants.variants.length} configured variant{variants.variants.length === 1 ? '' : 's'}</p></div> : <p className="text-sm text-slate-300">Single Product / default variant</p>}
        </ReviewCard>
      </div>

      <aside className="min-w-0 space-y-6">
        <ReviewCard title="Product Organization" onEdit={() => onEdit('LISTING')} editLabel="Edit Organization">
          <dl className="space-y-3">{[
            ['Shopify category', null], ['Product Type', draft.catalog.productType.value], ['Vendor', draft.catalog.vendor.value],
            ['Collections', draft.catalog.collections.map(({ value }) => value).join(', ')], ['Tags', draft.catalog.tags.map(({ value }) => value).join(', ')],
          ].map(([label, value]) => <div key={label as string}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-white">{valueOrState(value as string | null)}</dd></div>)}</dl>
        </ReviewCard>

        <ReviewCard title="Metafields" onEdit={() => onEdit('METAFIELDS')} editLabel="Edit Metafields">
          {selectedMetafields.length ? <dl className="space-y-3">{selectedMetafields.map((field) => <div key={field.catalogId}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="mt-1 text-sm text-white">{field.value}</dd></div>)}</dl> : <p className="text-sm text-slate-400">No merchant metafields selected</p>}
        </ReviewCard>

        <ReviewCard title="Search Engine Listing" onEdit={() => onEdit('LISTING')} editLabel="Edit SEO">
          <dl className="space-y-3"><div><dt className="text-xs text-slate-500">SEO Title</dt><dd className="mt-1 text-sm text-white">{valueOrState(listing.seoTitle)}</dd></div><div><dt className="text-xs text-slate-500">URL / Handle</dt><dd className="mt-1 break-all text-sm text-white">{handle}</dd></div><div><dt className="text-xs text-slate-500">Meta Description</dt><dd className="mt-1 text-sm leading-6 text-white">{valueOrState(listing.seoDescription)}</dd></div></dl>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs text-emerald-300">{storeName ?? 'Your Shopify store'}</p><p className="mt-1 break-all text-xs text-slate-400">/{handle === 'Not set' ? 'product-handle' : handle}</p><p className="mt-2 text-base font-medium text-sky-200">{valueOrState(listing.seoTitle)}</p><p className="mt-1 text-xs leading-5 text-slate-300">{valueOrState(listing.seoDescription)}</p></div>
        </ReviewCard>

        <ReviewCard title="Shopify Destination">
          <p className="text-xs text-slate-500">Connected store</p><p className="mt-1 text-sm font-medium text-white">{publishing?.connected ? storeName ?? 'Connected Shopify store' : 'Not connected'}</p>
          <p className="mt-3 text-sm text-slate-300">{destination}</p>
        </ReviewCard>
      </aside>
    </div>

    <section className="rounded-[1.75rem] border border-amber-300/25 bg-[#081423] p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Ready for Shopify</p>
      <p className="mt-2 text-sm text-slate-300">{draft.status === 'SAVED' && reviewComplete ? 'Content reviewed' : 'Content needs review'} · {configuredImages.length} images selected · {selectedMetafields.length} metafields selected · {draft.reviewWorkspace?.reviewedSections.includes('SEO') ? 'SEO reviewed' : 'SEO needs review'}</p>
      <a href={publishHref} className="mt-5 inline-flex w-full justify-center rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-200 sm:w-auto">Review &amp; Publish to Shopify →</a>
      <p className="mt-3 text-xs text-slate-500">This opens Safe Publishing for comparison and final confirmation. Nothing is published from this preview.</p>
    </section>
  </div>;
}
