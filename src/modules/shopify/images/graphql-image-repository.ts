import { z } from 'zod';
import type {
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import {
  FILE_CREATE_MUTATION,
  FILE_UPDATE_MUTATION,
  IMAGE_FILES_QUERY,
  MEDIA_REORDER_JOB_QUERY,
  PRODUCT_MEDIA_QUERY,
  PRODUCT_REORDER_MEDIA_MUTATION,
  STAGED_UPLOADS_CREATE_MUTATION,
} from './graphql-documents.ts';
import {
  ShopifyImageError,
  normalizeShopifyImageError,
} from './image-errors.ts';
import type { ShopifyImageMimeType } from './image-limits.ts';

const numericId = z.string().regex(/^[1-9]\d{0,19}$/);
const productGidSchema = z.string().regex(
  /^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/,
);
const mediaGidSchema = z.string().regex(
  /^gid:\/\/shopify\/MediaImage\/[1-9]\d{0,19}$/,
);
const jobGidSchema = z.string().regex(/^gid:\/\/shopify\/Job\/.+$/);
const httpsUrl = z.string().url().refine((value) => (
  new URL(value).protocol === 'https:'
));
const userError = z.object({
  field: z.array(z.string()).nullable().optional(),
  message: z.string(),
  code: z.string().nullable().optional(),
}).passthrough();
const topLevel = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
}).passthrough();
const stagedTarget = z.object({
  url: httpsUrl,
  resourceUrl: httpsUrl,
  parameters: z.array(z.object({
    name: z.string().min(1).max(1_000),
    value: z.string().max(20_000),
  }).strict()).max(30),
}).strict();
const stagedData = z.object({
  stagedUploadsCreate: z.object({
    stagedTargets: z.array(stagedTarget).nullable(),
    userErrors: z.array(userError),
  }).strict(),
}).strict();
const fileStatus = z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']);
const imageFile = z.object({
  __typename: z.literal('MediaImage'),
  id: mediaGidSchema,
  fileStatus,
  alt: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  image: z.object({ url: httpsUrl }).strict().nullable(),
}).strict();
const fileMutation = (name: 'fileCreate' | 'fileUpdate') => z.object({
  [name]: z.object({
    files: z.array(imageFile).nullable(),
    userErrors: z.array(userError),
  }).strict(),
}).strict();
const fileNodesData = z.object({
  nodes: z.array(imageFile.nullable()),
}).strict();
const pageInfo = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
}).strict();
const productMediaNode = z.object({
  __typename: z.string(),
  id: z.string().min(1),
  alt: z.string().nullable(),
  mediaContentType: z.enum(['IMAGE', 'VIDEO', 'EXTERNAL_VIDEO', 'MODEL_3D']),
  status: z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']),
  fileStatus: fileStatus.optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  image: z.object({ url: httpsUrl }).strict().nullable().optional(),
}).strict();
const productMediaData = z.object({
  product: z.object({
    id: productGidSchema,
    media: z.object({
      nodes: z.array(productMediaNode),
      pageInfo,
    }).strict(),
  }).strict().nullable(),
}).strict();
const job = z.object({ id: jobGidSchema, done: z.boolean() }).strict();
const reorderData = z.object({
  productReorderMedia: z.object({
    job: job.nullable(),
    mediaUserErrors: z.array(userError),
  }).strict(),
}).strict();
const jobData = z.object({ job: job.nullable() }).strict();

export interface StagedImageTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

export interface ShopifyImageFile {
  id: string;
  fileStatus: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  alt: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface RemoteProductMedia {
  id: string;
  kind: 'IMAGE' | 'UNMANAGED';
  alt: string | null;
  status: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
  fileStatus: 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | null;
  imageUrl: string | null;
}

export interface ShopifyGraphqlImageRepository {
  createStagedTarget(
    workspaceId: string,
    input: {
      filename: string;
      mimeType: ShopifyImageMimeType;
      byteSize: number;
    },
  ): Promise<StagedImageTarget>;
  createFile(
    workspaceId: string,
    input: { resourceUrl: string; filename: string; altText: string | null },
  ): Promise<ShopifyImageFile>;
  getFiles(workspaceId: string, fileIds: string[]): Promise<ShopifyImageFile[]>;
  getProductMedia(
    workspaceId: string,
    productId: string,
  ): Promise<RemoteProductMedia[]>;
  updateFiles(
    workspaceId: string,
    inputs: Array<{
      fileId: string;
      altText: string | null;
      productId?: string;
    }>,
  ): Promise<ShopifyImageFile[]>;
  reorderMedia(
    workspaceId: string,
    productId: string,
    moves: Array<{ mediaId: string; newPosition: number }>,
  ): Promise<{ id: string; done: boolean }>;
  getJob(workspaceId: string, jobId: string): Promise<{
    id: string;
    done: boolean;
  } | null>;
}

type AdminRequest = (
  workspaceId: string,
  input: { method: 'POST'; path: string; body: unknown },
) => Promise<ShopifyAdminResponse>;

export function productGid(productId: string) {
  return `gid://shopify/Product/${numericId.parse(productId)}`;
}

export function mediaGid(mediaId: string) {
  return `gid://shopify/MediaImage/${numericId.parse(mediaId)}`;
}

function numericFromMediaGid(gid: string) {
  const match = /^gid:\/\/shopify\/MediaImage\/([1-9]\d{0,19})$/.exec(gid);
  if (!match) throw new Error('Invalid media ID.');
  return match[1];
}

function invalidResponse(cause?: unknown): never {
  throw new ShopifyImageError(
    'SHOPIFY_IMAGE_INVALID_RESPONSE',
    'Shopify returned an invalid image response.',
    502,
    cause ? { cause } : undefined,
  );
}

function parseData(response: ShopifyAdminResponse): unknown {
  const parsed = topLevel.safeParse(response.data);
  if (!parsed.success) return invalidResponse(parsed.error);
  if (parsed.data.errors?.length || parsed.data.data === undefined) {
    return invalidResponse();
  }
  return parsed.data.data;
}

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  return result.success ? result.data : invalidResponse(result.error);
}

function assertNoUserErrors(errors: Array<z.infer<typeof userError>>) {
  if (errors.length) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'Shopify rejected the image operation.',
      422,
    );
  }
}

function toFile(input: z.infer<typeof imageFile>): ShopifyImageFile {
  return {
    id: numericFromMediaGid(input.id),
    fileStatus: input.fileStatus,
    alt: input.alt,
    imageUrl: input.image?.url ?? null,
    createdAt: new Date(input.createdAt).toISOString(),
  };
}

export function createShopifyGraphqlImageRepository(
  request: AdminRequest,
): ShopifyGraphqlImageRepository {
  async function execute(workspaceId: string, query: string, variables: unknown) {
    try {
      return parseData(await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        body: { query, variables },
      }));
    } catch (error) {
      throw normalizeShopifyImageError(error);
    }
  }

  async function mutateFiles(
    workspaceId: string,
    query: string,
    name: 'fileCreate' | 'fileUpdate',
    variables: unknown,
  ) {
    const data = parsed(fileMutation(name), await execute(
      workspaceId,
      query,
      variables,
    ));
    const payload = data[name];
    assertNoUserErrors(payload.userErrors);
    if (!payload.files) return invalidResponse();
    return payload.files.map(toFile);
  }

  return {
    async createStagedTarget(workspaceId, input) {
      const data = parsed(stagedData, await execute(
        workspaceId,
        STAGED_UPLOADS_CREATE_MUTATION,
        {
          input: [{
            filename: input.filename,
            mimeType: input.mimeType,
            fileSize: String(input.byteSize),
            httpMethod: 'POST',
            resource: 'IMAGE',
          }],
        },
      ));
      assertNoUserErrors(data.stagedUploadsCreate.userErrors);
      if (data.stagedUploadsCreate.stagedTargets?.length !== 1) {
        return invalidResponse();
      }
      return data.stagedUploadsCreate.stagedTargets[0];
    },

    async createFile(workspaceId, input) {
      const files = await mutateFiles(
        workspaceId,
        FILE_CREATE_MUTATION,
        'fileCreate',
        {
          files: [{
            originalSource: input.resourceUrl,
            contentType: 'IMAGE',
            filename: input.filename,
            alt: input.altText,
            duplicateResolutionMode: 'REPLACE',
          }],
        },
      );
      if (files.length !== 1) return invalidResponse();
      return files[0];
    },

    async getFiles(workspaceId, fileIds) {
      if (!fileIds.length) return [];
      const data = parsed(fileNodesData, await execute(
        workspaceId,
        IMAGE_FILES_QUERY,
        { ids: fileIds.map(mediaGid) },
      ));
      return data.nodes.flatMap((node) => node ? [toFile(node)] : []);
    },

    async getProductMedia(workspaceId, productId) {
      const media: RemoteProductMedia[] = [];
      let after: string | null = null;
      do {
        const data: z.infer<typeof productMediaData> = parsed(
          productMediaData,
          await execute(workspaceId, PRODUCT_MEDIA_QUERY, {
            productId: productGid(productId),
            after,
          }),
        );
        if (!data.product) {
          throw new ShopifyImageError(
            'SHOPIFY_IMAGE_PRODUCT_NOT_FOUND',
            'The linked Shopify product was not found.',
            404,
          );
        }
        media.push(...data.product.media.nodes.map((node) => {
          if (
            node.__typename !== 'MediaImage'
            || node.mediaContentType !== 'IMAGE'
            || !mediaGidSchema.safeParse(node.id).success
          ) {
            return {
              id: node.id,
              kind: 'UNMANAGED' as const,
              alt: null,
              status: node.status,
              fileStatus: null,
              imageUrl: null,
            };
          }
          return {
            id: numericFromMediaGid(node.id),
            kind: 'IMAGE' as const,
            alt: node.alt,
            status: node.status,
            fileStatus: node.fileStatus ?? null,
            imageUrl: node.image?.url ?? null,
          };
        }));
        after = data.product.media.pageInfo.hasNextPage
          ? data.product.media.pageInfo.endCursor
          : null;
        if (data.product.media.pageInfo.hasNextPage && !after) {
          return invalidResponse();
        }
      } while (after);
      return media;
    },

    updateFiles(workspaceId, inputs) {
      if (!inputs.length) return Promise.resolve([]);
      return mutateFiles(
        workspaceId,
        FILE_UPDATE_MUTATION,
        'fileUpdate',
        {
          files: inputs.map((input) => ({
            id: mediaGid(input.fileId),
            alt: input.altText,
            ...(input.productId
              ? { referencesToAdd: [productGid(input.productId)] }
              : {}),
          })),
        },
      );
    },

    async reorderMedia(workspaceId, productId, moves) {
      if (!moves.length) throw new Error('At least one media move is required.');
      const data = parsed(reorderData, await execute(
        workspaceId,
        PRODUCT_REORDER_MEDIA_MUTATION,
        {
          productId: productGid(productId),
          moves: moves.map((move) => ({
            id: mediaGid(move.mediaId),
            newPosition: String(move.newPosition),
          })),
        },
      ));
      assertNoUserErrors(data.productReorderMedia.mediaUserErrors);
      if (!data.productReorderMedia.job) return invalidResponse();
      return data.productReorderMedia.job;
    },

    async getJob(workspaceId, jobId) {
      const data = parsed(jobData, await execute(
        workspaceId,
        MEDIA_REORDER_JOB_QUERY,
        { jobId: jobGidSchema.parse(jobId) },
      ));
      return data.job;
    },
  };
}

export async function uploadImageToStagedTarget(
  target: StagedImageTarget,
  input: {
    bytes: Uint8Array;
    filename: string;
    mimeType: ShopifyImageMimeType;
  },
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(target.url);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_RESPONSE',
      'Shopify returned an invalid upload target.',
      502,
    );
  }
  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }
  form.append(
    'file',
    new Blob([Uint8Array.from(input.bytes).buffer], { type: input.mimeType }),
    input.filename,
  );
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      body: form,
      credentials: 'omit',
      redirect: 'error',
    });
  } catch (error) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_UPLOAD_FAILED',
      'The image upload to Shopify failed.',
      503,
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_UPLOAD_FAILED',
      'The image upload to Shopify failed.',
      503,
    );
  }
}
