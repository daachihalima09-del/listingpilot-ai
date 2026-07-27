export const SHOPIFY_CATALOG_PRODUCTS_QUERY = `#graphql
  query ListingPilotCatalogProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        legacyResourceId
        title
        handle
        vendor
        productType
        status
        updatedAt
        featuredMedia {
          ... on MediaImage {
            image { url altText }
          }
        }
        variantsCount { count }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const SHOPIFY_CATALOG_PRODUCT_QUERY = `#graphql
  query ListingPilotCatalogProduct($id: ID!) {
    product(id: $id) {
      id
      legacyResourceId
      title
      handle
      descriptionHtml
      vendor
      productType
      status
      tags
      createdAt
      updatedAt
      publishedAt
      seo { title description }
      options { id name position values }
      featuredMedia {
        ... on MediaImage { id alt image { url altText } }
      }
      media(first: 50) {
        nodes {
          __typename
          id
          alt
          mediaContentType
          ... on MediaImage { image { url altText } }
        }
      }
      variants(first: 100) {
        nodes {
          id
          legacyResourceId
          title
          sku
          barcode
          price
          compareAtPrice
          position
          selectedOptions { name value }
          image { id url altText }
        }
      }
      metafields(first: 50) {
        nodes { id namespace key type value }
      }
    }
  }
`;

