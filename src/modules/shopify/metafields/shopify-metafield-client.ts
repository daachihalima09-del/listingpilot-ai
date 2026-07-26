import type {
  ShopifyMetafieldConfigurationDto,
} from './metafield-repository.ts';
import type {
  ShopifyMetafieldPublishResult,
} from './metafield-service.ts';
import type {
  MetafieldConfigurationInput,
} from './metafield-validation.ts';

export class ShopifyMetafieldClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyMetafieldClientError';
  }
}

type Fetcher = typeof fetch;

async function decode<T>(response: Response): Promise<T> {
  const data = await response.json() as {
    error?: { message?: string };
  } & T;
  if (!response.ok) {
    throw new ShopifyMetafieldClientError(
      data.error?.message ?? 'The Shopify metafield request failed.',
    );
  }
  return data;
}

export function createShopifyMetafieldClient(fetcher: Fetcher = fetch) {
  let pendingSave: Promise<ShopifyMetafieldConfigurationDto> | null = null;
  let pendingPublish: Promise<ShopifyMetafieldPublishResult> | null = null;
  return {
    save(projectId: string, input: MetafieldConfigurationInput) {
      if (pendingSave) return pendingSave;
      pendingSave = fetcher(
        `/api/projects/${encodeURIComponent(projectId)}/shopify-metafields`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      ).then((response) => decode<{
        configuration: ShopifyMetafieldConfigurationDto;
      }>(response)).then(({ configuration }) => configuration)
        .finally(() => { pendingSave = null; });
      return pendingSave;
    },
    publish(projectId: string) {
      if (pendingPublish) return pendingPublish;
      pendingPublish = fetcher(
        `/api/projects/${encodeURIComponent(projectId)}/shopify-metafields/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ).then((response) => decode<ShopifyMetafieldPublishResult>(response))
        .finally(() => { pendingPublish = null; });
      return pendingPublish;
    },
  };
}

