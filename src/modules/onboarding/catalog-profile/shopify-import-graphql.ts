export const MERCHANT_CATALOG_COLLECTIONS_QUERY = `#graphql
  query ListingPilotMerchantCatalogCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      nodes { title }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const MERCHANT_CATALOG_PRODUCTS_QUERY = `#graphql
  query ListingPilotMerchantCatalogProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      nodes { productType vendor }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
