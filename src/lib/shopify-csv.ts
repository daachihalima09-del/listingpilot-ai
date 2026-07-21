interface ShopifyExportProduct {
  brand: string;
  model: string;
}

interface ShopifyListingContent {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  tags: string;
}

function escapeCsvValue(value: string) {
  const normalized = `${value}`.replace(/"/g, '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

export function buildShopifyCsv(product: ShopifyExportProduct, listing: ShopifyListingContent) {
  return [
    ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Variant SKU', 'Variant Price', 'SEO Title', 'SEO Description'],
    [
      `${product.brand.toLowerCase()}-${product.model.toLowerCase()}`,
      listing.title,
      `<p>${listing.description}</p>`,
      product.brand,
      'Electronics',
      'TV',
      listing.tags,
      'TRUE',
      `${product.brand.toLowerCase()}-${product.model.toLowerCase()}-01`,
      '1299.00',
      listing.seoTitle,
      listing.seoDescription,
    ].map(escapeCsvValue).join(','),
  ].join('\n');
}
