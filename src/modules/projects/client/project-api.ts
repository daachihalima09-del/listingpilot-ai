'use client';

export interface ProjectApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[] | undefined>;
    details?: unknown;
  };
}

export class ProjectApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly fieldErrors?: Record<string, string[] | undefined>;
  readonly details?: unknown;

  constructor(
    status: number,
    message: string,
    body?: ProjectApiErrorBody,
    requestId?: string | null,
  ) {
    super(message);
    this.name = 'ProjectApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.requestId = requestId ?? undefined;
    this.fieldErrors = body?.error?.fieldErrors;
    this.details = body?.error?.details;
  }
}

export async function projectApiRequest<T>(
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    timeoutMs?: number;
    timeoutMessage?: string;
    signal?: AbortSignal;
  },
): Promise<T> {
  const controller = new AbortController();
  const abortForCaller = () => controller.abort('caller');
  options.signal?.addEventListener('abort', abortForCaller, { once: true });
  const timeoutId = window.setTimeout(
    () => controller.abort('timeout'),
    options.timeoutMs ?? 45_000,
  );

  try {
    const response = await fetch(url, {
      method: options.method,
      ...(options.body === undefined ? {} : { headers: { 'content-type': 'application/json' } }),
      credentials: 'same-origin',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    const body = response.status === 204
      ? null
      : await response.json().catch(() => null) as unknown;

    if (!response.ok) {
      const errorBody = body && typeof body === 'object'
        ? body as ProjectApiErrorBody
        : undefined;
      throw new ProjectApiError(
        response.status,
        errorBody?.error?.message ?? 'The project operation failed.',
        errorBody,
        response.headers.get('x-listingpilot-generation-request-id'),
      );
    }

    return body as T;
  } catch (error) {
    if (controller.signal.reason === 'timeout') {
      throw new ProjectApiError(
        408,
        options.timeoutMessage ?? 'The request timed out. Check your connection and try again.',
      );
    }
    if (error instanceof ProjectApiError) {
      throw error;
    }
    throw new ProjectApiError(
      0,
      'The project operation failed. Check your connection and try again.',
    );
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortForCaller);
  }
}
