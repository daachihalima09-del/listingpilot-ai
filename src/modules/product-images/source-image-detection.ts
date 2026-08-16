import { createHash } from 'node:crypto';

export type SourceImageKind = 'JSON_LD' | 'OPEN_GRAPH' | 'GALLERY' | 'SRCSET' | 'IMAGE_ELEMENT';

export interface DetectedSourceImage {
  url: string;
  urlHash: string;
  sourceKind: SourceImageKind;
  width: number | null;
  height: number | null;
  altText: string | null;
  score: number;
}

export const MAX_SOURCE_IMAGE_CANDIDATES = 24;

const excludedMediaContext = /(?:related[-_\s]*products?|recommend(?:ed|ations?)?|recently[-_\s]*viewed|complementary|upsell|cross[-_\s]*sell|collections?|category[-_\s]*(?:card|grid)|product[-_\s]*(?:card|tile)|campaign|editorial|lifestyle|membership|promotion|promo[-_\s]*banner|newsletter|footer|header|navigation|payment[-_\s]*icons?|social[-_\s]*links?|blog[-_\s]*card)/iu;
const excludedAsset = /(?:^|[\/_\-.])(logo|icon|sprite|avatar|tracking|pixel|badge|payment|social|spinner|loader|placeholder|membership|member|promo|promotion|banner|newsletter|footer|header|navigation|recommend(?:ed|ation)?|related|upsell|crosssell|cross-sell|branding|email|app-store|trustmark)(?:[\/_\-.]|$)/iu;
const exactGalleryContext = /(?:product[-_\s]*(?:gallery|media|images?|photos?|slider|carousel)|gallery[-_\s]*(?:media|images?|slider)|media[-_\s]*(?:gallery|viewer)|product__media|product-single__media|zoom-container|product-media-gallery|product-gallery|productview-(?:images|nav)|data-image-gallery)/iu;
const tokenStopWords = new Set([
  'https', 'www', 'com', 'products', 'product', 'collections', 'collection', 'with', 'from', 'this', 'that',
  'official', 'online', 'shop', 'store', 'buy', 'sale', 'display', 'intelligent', 'technology', 'series',
  'vacuum', 'cleaner', 'dryer', 'straightener', 'purifier', 'humidifier', 'television', 'smart',
]);

interface Identity {
  brandTokens: Set<string>;
  exactTokens: Set<string>;
  descriptiveTokens: Set<string>;
}

interface StructuredProduct {
  images: Array<{ url: string; width: number | null; height: number | null }>;
  identityText: string;
  score: number;
}

interface ContainerRegion {
  openingTag: string;
  start: number;
  end: number;
  context: string;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'iu'));
  return (match?.[1] ?? match?.[2] ?? '').trim() || null;
}

function textContent(value: string) {
  return value.replace(/<[^>]+>/gu, ' ').replace(/&(?:amp|nbsp|quot|apos);/giu, ' ').replace(/\s+/gu, ' ').trim();
}

function tokens(value: string) {
  return [...new Set(textContent(value).toLocaleLowerCase('en-US').split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !tokenStopWords.has(token)))];
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : null;
}

function canonicalImageUrl(raw: string, pageUrl: string): string | null {
  try {
    const url = new URL(raw.trim(), pageUrl);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return null;
    if (/^(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\./u.test(hostname)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function assetIdentity(url: string) {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(?:w|h|width|height|quality|q|crop|fit|format|fm)$/iu.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

function largestSrcsetCandidate(value: string): string | null {
  const candidates = value.split(',').map((candidate) => {
    const [url, descriptor = ''] = candidate.trim().split(/\s+/u);
    const width = descriptor.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
    const density = descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 1_000 : 0;
    return { url, rank: Number.isFinite(width + density) ? width + density : 0 };
  }).filter(({ url }) => Boolean(url));
  return candidates.sort((left, right) => right.rank - left.rank)[0]?.url ?? null;
}

function imageValues(value: unknown) {
  const images = Array.isArray(value) ? value : [value];
  return images.flatMap((image): Array<{ url: string; width: number | null; height: number | null }> => {
    if (typeof image === 'string') return [{ url: image, width: null, height: null }];
    if (!image || typeof image !== 'object') return [];
    const item = image as Record<string, unknown>;
    const url = item.contentUrl ?? item.url;
    return typeof url === 'string'
      ? [{ url, width: positiveInteger(item.width), height: positiveInteger(item.height) }]
      : [];
  });
}

function brandValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String((value as Record<string, unknown>).name ?? '');
  return '';
}

function collectStructuredProducts(value: unknown, pageEvidence: string, output: StructuredProduct[]) {
  if (Array.isArray(value)) {
    for (const entry of value) collectStructuredProducts(entry, pageEvidence, output);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = Array.isArray(record['@type']) ? record['@type'].join(' ') : String(record['@type'] ?? '');
  if (/\bProduct\b/iu.test(type)) {
    const identityText = [record.name, record.model, record.mpn, record.sku, record.productID, brandValue(record.brand), record.url]
      .map((entry) => String(entry ?? '')).join(' ');
    const productTokens = tokens(identityText);
    const pageTokens = new Set(tokens(pageEvidence));
    const exactMatches = productTokens.filter((token) => /\d/u.test(token) && pageTokens.has(token)).length;
    const matches = productTokens.filter((token) => pageTokens.has(token)).length;
    output.push({ images: imageValues(record.image), identityText, score: exactMatches * 20 + matches * 3 });
    return; // A Product node owns its image set; nested offers/brand data are not separate Products.
  }
  for (const child of Object.values(record)) collectStructuredProducts(child, pageEvidence, output);
}

function pageEvidence(html: string, pageUrl: string) {
  return [
    new URL(pageUrl).pathname,
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? '',
    html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/iu)?.[1] ?? '',
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '',
  ].join(' ');
}

function buildIdentity(html: string, pageUrl: string, structuredIdentity = ''): Identity {
  const evidence = `${pageEvidence(html, pageUrl)} ${structuredIdentity}`;
  const brandValues = [
    html.match(/<meta\b[^>]*(?:property|name|itemprop)=["'](?:product:brand|brand)["'][^>]*content=["']([^"']+)["']/iu)?.[1] ?? '',
  ];
  const brandTokens = new Set(brandValues.flatMap(tokens));
  const all = tokens(evidence);
  const exactTokens = new Set(all.filter((token) => /\d/u.test(token) && token.length >= 3));
  const descriptiveTokens = new Set(all.filter((token) => !brandTokens.has(token) && !/\d/u.test(token) && token.length >= 5));
  return { brandTokens, exactTokens, descriptiveTokens };
}

function hasStrongIdentityEvidence(value: string, identity: Identity) {
  const normalizedTokens = new Set(tokens(value));
  if ([...identity.exactTokens].some((token) => normalizedTokens.has(token))) return true;
  const descriptiveMatches = [...identity.descriptiveTokens].filter((token) => normalizedTokens.has(token)).length;
  return descriptiveMatches >= 2;
}

function findGalleryRegions(html: string): ContainerRegion[] {
  const regions: ContainerRegion[] = [];
  const stack: Array<{ name: string; openingTag: string; start: number; contentStart: number }> = [];
  const containerTags = new Set(['div', 'section', 'ul', 'ol', 'figure', 'product-gallery', 'media-gallery', 'product-media']);
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/giu)) {
    const name = match[1]!.toLowerCase();
    if (!containerTags.has(name)) continue;
    const tag = match[0];
    if (/^<\//u.test(tag)) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const opening = stack[index]!;
        if (opening.name !== name) continue;
        stack.splice(index);
        const context = `${opening.openingTag} ${html.slice(Math.max(0, opening.start - 250), opening.start)}`;
        if (exactGalleryContext.test(opening.openingTag) && !excludedMediaContext.test(context)) {
          regions.push({ openingTag: opening.openingTag, start: opening.contentStart, end: match.index ?? html.length, context });
        }
        break;
      }
    } else if (!/\/>$/u.test(tag)) {
      stack.push({ name, openingTag: tag, start: match.index ?? 0, contentStart: (match.index ?? 0) + tag.length });
    }
  }
  return regions;
}

function galleryRegionScore(region: ContainerRegion, identity: Identity, html: string) {
  const body = html.slice(region.start, region.end);
  const imageCount = (body.match(/<(?:img|source)\b/giu) ?? []).length;
  const exactMarker = /(?:product-gallery|product__media|product-single__media|product-media-gallery|data-image-gallery|productview-(?:images|nav))/iu.test(region.openingTag) ? 50 : 30;
  return exactMarker + (hasStrongIdentityEvidence(`${region.context} ${body.slice(0, 1_500)}`, identity) ? 25 : 0) + Math.min(imageCount, 20);
}

function declaredGalleryMemberCount(region: ContainerRegion, html: string) {
  return (html.slice(region.start, region.end).match(/<img\b[^>]*\bdata-main-image\b[^>]*>/giu) ?? []).length;
}

function finalize(candidates: Array<Omit<DetectedSourceImage, 'urlHash'>>) {
  const bestByUrl = new Map<string, Omit<DetectedSourceImage, 'urlHash'>>();
  for (const candidate of candidates) {
    const key = assetIdentity(candidate.url);
    const current = bestByUrl.get(key);
    if (!current || candidate.score > current.score) bestByUrl.set(key, candidate);
  }
  return [...bestByUrl.values()]
    .sort((left, right) => right.score - left.score) // Stable sort preserves authoritative gallery/JSON-LD order.
    .slice(0, MAX_SOURCE_IMAGE_CANDIDATES)
    .map((candidate) => ({ ...candidate, urlHash: createHash('sha256').update(candidate.url).digest('hex') }));
}

export function extractSourceImageCandidates(html: string, pageUrl: string): DetectedSourceImage[] {
  const addTo = (target: Array<Omit<DetectedSourceImage, 'urlHash'>>, rawUrl: string, sourceKind: SourceImageKind, score: number, width: number | null = null, height: number | null = null, altText: string | null = null) => {
    const url = canonicalImageUrl(rawUrl, pageUrl);
    if (!url || (width !== null && height !== null && (width < 300 || height < 300))) return;
    if (sourceKind !== 'JSON_LD' && sourceKind !== 'OPEN_GRAPH' && excludedAsset.test(`${new URL(url).pathname} ${new URL(url).search} ${altText ?? ''}`)) return;
    target.push({ url, sourceKind, score, width, height, altText: altText?.trim().slice(0, 512) || null });
  };

  // Tier 1: choose the Product node matching this page, never images from other Product nodes.
  const structuredProducts: StructuredProduct[] = [];
  const evidence = pageEvidence(html, pageUrl);
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { collectStructuredProducts(JSON.parse(match[1]!), evidence, structuredProducts); } catch { /* Ignore malformed metadata. */ }
  }
  const primaryProduct = structuredProducts
    .filter(({ images }) => images.length > 0)
    .sort((left, right) => right.score - left.score || right.images.length - left.images.length)[0];
  const structured: Array<Omit<DetectedSourceImage, 'urlHash'>> = [];
  if (primaryProduct) {
    for (const image of primaryProduct.images) addTo(structured, image.url, 'JSON_LD', 100, image.width, image.height);
    if (structured.length >= 2) return finalize(structured); // A multi-image Product set is complete enough for deterministic early stop.
  }

  const identity = buildIdentity(html, pageUrl, primaryProduct?.identityText);

  // Tier 1: select one exact Product gallery boundary, then collect only within it.
  const gallery = findGalleryRegions(html)
    .sort((left, right) => declaredGalleryMemberCount(right, html) - declaredGalleryMemberCount(left, html)
      || galleryRegionScore(right, identity, html) - galleryRegionScore(left, identity, html)
      || (left.end - left.start) - (right.end - right.start))[0];
  if (gallery) {
    const galleryCandidates: Array<Omit<DetectedSourceImage, 'urlHash'>> = [];
    const body = html.slice(gallery.start, gallery.end);
    const allImageTags = body.match(/<img\b[^>]*>/giu) ?? [];
    const primaryImageTags = allImageTags.filter((tag) => /\bdata-main-image\b/iu.test(tag));
    // Shopify themes commonly place thumbnails and payment/marketing images under a broad media wrapper.
    // When the gallery declares its main-image members, that membership is the authoritative boundary.
    const galleryImageTags = primaryImageTags.length > 0 ? primaryImageTags : allImageTags;
    for (const tag of galleryImageTags) {
      const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
      const rawUrl = (srcset && largestSrcsetCandidate(srcset)) ?? attr(tag, 'data-zoom-image') ?? attr(tag, 'data-src') ?? attr(tag, 'src');
      if (rawUrl) addTo(galleryCandidates, rawUrl, 'GALLERY', 80, positiveInteger(attr(tag, 'width')), positiveInteger(attr(tag, 'height')), attr(tag, 'alt'));
    }
    for (const tag of primaryImageTags.length > 0 ? [] : (body.match(/<source\b[^>]*>/giu) ?? [])) {
      const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
      const rawUrl = srcset ? largestSrcsetCandidate(srcset) : null;
      if (rawUrl) addTo(galleryCandidates, rawUrl, 'SRCSET', 75, positiveInteger(attr(tag, 'width')), positiveInteger(attr(tag, 'height')));
    }
    if (galleryCandidates.length > 0) return finalize(galleryCandidates); // Exact gallery found: no document-wide harvesting.
  }

  // A single Product structured image remains authoritative when the page exposes no exact gallery.
  if (structured.length > 0) return finalize(structured);

  // Tier 2: a declared social Product image is a bounded single-image fallback.
  const openGraph: Array<Omit<DetectedSourceImage, 'urlHash'>> = [];
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const property = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if (content && ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'product:image'].includes(property)) {
      addTo(openGraph, content, 'OPEN_GRAPH', 90);
    }
  }
  if (openGraph.length > 0) return finalize(openGraph);

  // Tier 3: only exact model/SKU/slug evidence or two distinctive Product-name tokens may admit an image.
  const fallback: Array<Omit<DetectedSourceImage, 'urlHash'>> = [];
  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const surrounding = html.slice(Math.max(0, (match.index ?? 0) - 500), Math.min(html.length, (match.index ?? 0) + tag.length + 500));
    if (excludedMediaContext.test(surrounding)) continue;
    const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
    const rawUrl = (srcset && largestSrcsetCandidate(srcset)) ?? attr(tag, 'data-zoom-image') ?? attr(tag, 'data-src') ?? attr(tag, 'src');
    const altText = attr(tag, 'alt');
    if (!rawUrl || !hasStrongIdentityEvidence(`${rawUrl} ${altText ?? ''}`, identity)) continue;
    addTo(fallback, rawUrl, srcset ? 'SRCSET' : 'IMAGE_ELEMENT', srcset ? 62 : 50, positiveInteger(attr(tag, 'width')), positiveInteger(attr(tag, 'height')), altText);
  }
  return finalize(fallback);
}
