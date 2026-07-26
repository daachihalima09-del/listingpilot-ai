import type { CoordinatorExecutionDto } from './coordinator-types.ts';

export class CoordinatorClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoordinatorClientError';
  }
}

async function parse(response: Response) {
  const body = await response.json().catch(() => null) as {
    coordinator?: CoordinatorExecutionDto;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.coordinator) {
    throw new CoordinatorClientError(
      body?.error?.message ?? 'Shopify publication could not be completed.',
    );
  }
  return body.coordinator;
}

export function createCoordinatorClient(fetcher: typeof fetch = fetch) {
  let pending: Promise<CoordinatorExecutionDto> | null = null;
  return {
    run(
      projectId: string,
      action: 'publish' | 'retry' | 'refresh',
    ) {
      if (pending) return pending;
      pending = fetcher(
        `/api/projects/${encodeURIComponent(projectId)}/shopify-publication-coordinator/${action}`,
        { method: 'POST' },
      ).then(parse).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
