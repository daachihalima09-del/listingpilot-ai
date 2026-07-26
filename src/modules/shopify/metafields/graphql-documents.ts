// Fixed documents keep GraphQL operations server-controlled.
export const METAFIELD_DEFINITION_QUERY = `#graphql
  query ListingPilotMetafieldDefinition(
    $namespace: String!
    $query: String!
  ) {
    metafieldDefinitions(
      first: 10
      ownerType: PRODUCT
      namespace: $namespace
      query: $query
    ) {
      nodes {
        id
        namespace
        key
        ownerType
        type {
          name
        }
      }
    }
  }
`;

export const METAFIELD_DEFINITION_CREATE_MUTATION = `#graphql
  mutation ListingPilotMetafieldDefinitionCreate(
    $definition: MetafieldDefinitionInput!
  ) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        namespace
        key
        ownerType
        type {
          name
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

export const PRODUCT_METAFIELDS_QUERY = `#graphql
  query ListingPilotProductMetafields(
    $productId: ID!
    $keys: [String!]
  ) {
    product(id: $productId) {
      id
      metafields(first: 250, keys: $keys) {
        nodes {
          id
          legacyResourceId
          namespace
          key
          type
          value
          compareDigest
        }
      }
    }
  }
`;

export const METAFIELDS_SET_MUTATION = `#graphql
  mutation ListingPilotMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        legacyResourceId
        namespace
        key
        type
        value
        compareDigest
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

