import type { DraftSpecification, DraftTextField, ListingDraft } from '../../listing-draft/domain/contracts.ts';

const PRODUCT_INFORMATION_ORDER = Object.freeze([
  'Model',
  'Brand',
  'Type',
  'Capacity',
  'Key Technologies',
  'Programs / Functions',
  'Control',
  'Design',
  'Finish',
  'Version',
]);

export interface ShopifyListingSource {
  readonly title: DraftTextField;
  readonly specifications: readonly DraftSpecification[];
  readonly overview: DraftTextField;
  readonly features: readonly DraftTextField[];
  readonly seo: Readonly<{
    readonly title: DraftTextField;
    readonly description: DraftTextField;
  }>;
}

export interface AssembledShopifyListing {
  readonly title: string;
  readonly descriptionHtml: string;
  readonly productInformation: readonly Readonly<{ label: string; value: string }>[];
  readonly descriptionParagraphs: readonly string[];
  readonly features: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizedLabel(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

function canonicalLabel(value: string): string {
  const normalized = normalizedLabel(value).replace(/\s*\(if applicable\)$/u, '');
  return PRODUCT_INFORMATION_ORDER.find((label) => normalizedLabel(label) === normalized) ?? value.trim();
}

export function orderedProductInformation(
  specifications: readonly DraftSpecification[],
): readonly Readonly<{ label: string; value: string }>[] {
  const rank = new Map(PRODUCT_INFORMATION_ORDER.map((label, index) => [normalizedLabel(label), index]));
  return specifications
    .map((item, sourceIndex) => ({
      label: canonicalLabel(item.label),
      value: item.value.trim(),
      sourceIndex,
    }))
    .filter(({ label, value }) => Boolean(label && value))
    .sort((left, right) => (
      (rank.get(normalizedLabel(left.label)) ?? PRODUCT_INFORMATION_ORDER.length)
      - (rank.get(normalizedLabel(right.label)) ?? PRODUCT_INFORMATION_ORDER.length)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ label, value }) => Object.freeze({ label, value }));
}

export function descriptionParagraphs(value: string): readonly string[] {
  return value
    .replace(/\r\n?/gu, '\n')
    .split(/\n\s*\n/gu)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/gu, ' ').trim())
    .filter(Boolean);
}

function featureText(value: string): string {
  const trimmed = value.trim().replace(/^\u2714\s*/u, '');
  return trimmed ? `\u2714 ${trimmed}` : '';
}

export function assembleShopifyListing(source: ShopifyListingSource): AssembledShopifyListing {
  const productInformation = orderedProductInformation(source.specifications);
  const paragraphs = descriptionParagraphs(source.overview.value);
  const features = source.features.map(({ value }) => featureText(value)).filter(Boolean);
  const informationHtml = productInformation
    .map(({ label, value }) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join('');
  const paragraphsHtml = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const featuresHtml = features.length
    ? `<h3>Key Features:</h3>${features.map((feature) => `<p>${escapeHtml(feature)}</p>`).join('')}`
    : '';

  return Object.freeze({
    title: source.title.value.trim(),
    descriptionHtml: `${informationHtml}${paragraphsHtml}${featuresHtml}`,
    productInformation: Object.freeze(productInformation),
    descriptionParagraphs: Object.freeze(paragraphs),
    features: Object.freeze(features),
    seoTitle: source.seo.title.value.trim(),
    seoDescription: source.seo.description.value.trim(),
  });
}

export function isShopifyListingSource(value: unknown): value is ListingDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ListingDraft>;
  return Boolean(
    candidate.title && typeof candidate.title.value === 'string'
    && Array.isArray(candidate.specifications)
    && candidate.overview && typeof candidate.overview.value === 'string'
    && Array.isArray(candidate.features)
    && candidate.seo && typeof candidate.seo.title?.value === 'string'
    && typeof candidate.seo.description?.value === 'string',
  );
}
