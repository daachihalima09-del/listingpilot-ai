import type {
  ShopifyImageConfigurationDto,
} from './image-repository.ts';
import type { ImagePublishResult } from './image-service.ts';

export class ShopifyImageClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyImageClientError';
  }
}

async function parsed<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new ShopifyImageClientError(
      body?.error?.message ?? 'The image operation could not be completed.',
    );
  }
  return body as T;
}

export function createShopifyImageClient(fetcher: typeof fetch = fetch) {
  const base = (projectId: string) => (
    `/api/projects/${encodeURIComponent(projectId)}/shopify-images`
  );
  return {
    async save(projectId: string, input: unknown) {
      const body = await parsed<{ configuration: ShopifyImageConfigurationDto }>(
        await fetcher(base(projectId), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
      return body.configuration;
    },
    async addRemote(projectId: string, input: unknown) {
      const body = await parsed<{ configuration: ShopifyImageConfigurationDto }>(
        await fetcher(`${base(projectId)}/remote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
      return body.configuration;
    },
    async upload(projectId: string, file: File, altText: string | null) {
      const initiated = await parsed<{
        uploadId: string;
        uploadUrl: string;
      }>(await fetcher(`${base(projectId)}/upload-init`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
          altText,
        }),
      }));
      const form = new FormData();
      form.append('uploadId', initiated.uploadId);
      form.append('file', file);
      const body = await parsed<{ configuration: ShopifyImageConfigurationDto }>(
        await fetcher(initiated.uploadUrl, { method: 'POST', body: form }),
      );
      return body.configuration;
    },
    async publish(projectId: string) {
      return parsed<ImagePublishResult>(await fetcher(`${base(projectId)}/publish`, {
        method: 'POST',
      }));
    },
    async refresh(projectId: string) {
      const body = await parsed<{ configuration: ShopifyImageConfigurationDto }>(
        await fetcher(`${base(projectId)}/refresh`, { method: 'POST' }),
      );
      return body.configuration;
    },
  };
}
