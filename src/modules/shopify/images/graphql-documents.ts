// Current file-first Shopify media workflow. No deprecated media mutations.
export const STAGED_UPLOADS_CREATE_MUTATION = `#graphql
  mutation ListingPilotStagedImageUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const FILE_CREATE_MUTATION = `#graphql
  mutation ListingPilotImageFileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        __typename
        id
        fileStatus
        alt
        createdAt
        ... on MediaImage {
          image {
            url
          }
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

export const IMAGE_FILES_QUERY = `#graphql
  query ListingPilotImageFiles($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on MediaImage {
        id
        fileStatus
        alt
        createdAt
        image {
          url
        }
      }
    }
  }
`;

export const PRODUCT_MEDIA_QUERY = `#graphql
  query ListingPilotProductMedia($productId: ID!, $after: String) {
    product(id: $productId) {
      id
      media(first: 100, after: $after) {
        nodes {
          __typename
          id
          alt
          mediaContentType
          status
          ... on MediaImage {
            fileStatus
            createdAt
            image {
              url
            }
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

export const FILE_UPDATE_MUTATION = `#graphql
  mutation ListingPilotImageFileUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        __typename
        id
        fileStatus
        alt
        createdAt
        ... on MediaImage {
          image {
            url
          }
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

export const PRODUCT_REORDER_MEDIA_MUTATION = `#graphql
  mutation ListingPilotProductMediaReorder($productId: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $productId, moves: $moves) {
      job {
        id
        done
      }
      mediaUserErrors {
        field
        message
        code
      }
    }
  }
`;

export const MEDIA_REORDER_JOB_QUERY = `#graphql
  query ListingPilotMediaReorderJob($jobId: ID!) {
    job(id: $jobId) {
      id
      done
    }
  }
`;

