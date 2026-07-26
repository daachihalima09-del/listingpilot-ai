// Dedicated documents avoid accepting arbitrary GraphQL from clients.
export const CURRENT_PRODUCT_VARIANTS_QUERY = `#graphql
  query ListingPilotProductVariants($productId: ID!, $after: String) {
    shop {
      currencyCode
      resourceLimits {
        maxProductOptions
        maxProductVariants
      }
    }
    product(id: $productId) {
      id
      hasOnlyDefaultVariant
      options {
        id
        name
        position
        values
      }
      variants(first: 250, after: $after) {
        nodes {
          id
          price
          compareAtPrice
          barcode
          selectedOptions {
            name
            value
          }
          inventoryItem {
            sku
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

// LEAVE_AS_IS prevents productOptionsCreate from generating an unseen
// Cartesian product. ListingPilot creates only merchant-reviewed variants.
export const PRODUCT_OPTIONS_CREATE_MUTATION = `#graphql
  mutation ListingPilotProductOptionsCreate(
    $productId: ID!
    $options: [OptionCreateInput!]!
  ) {
    productOptionsCreate(
      productId: $productId
      options: $options
      variantStrategy: LEAVE_AS_IS
    ) {
      product {
        id
        options {
          id
          name
          position
          values
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const PRODUCT_VARIANTS_BULK_CREATE_MUTATION = `#graphql
  mutation ListingPilotProductVariantsCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: PRESERVE_STANDALONE_VARIANT
    ) {
      productVariants {
        id
        price
        compareAtPrice
        barcode
        selectedOptions {
          name
          value
        }
        inventoryItem {
          sku
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `#graphql
  mutation ListingPilotProductVariantsUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(
      productId: $productId
      variants: $variants
      allowPartialUpdates: false
    ) {
      productVariants {
        id
        price
        compareAtPrice
        barcode
        selectedOptions {
          name
          value
        }
        inventoryItem {
          sku
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;
