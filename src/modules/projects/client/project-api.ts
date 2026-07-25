'use client';

export interface ProjectApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[] | undefined>;
  };
}

export class ProjectApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[] | undefined>;

  constructor(
    status: number,
    message: string,
    body?: ProjectApiErrorBody,
  ) {
    super(message);
    this.name = 'ProjectApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.fieldErrors = body?.error?.fieldErrors;
  }
}

export async function projectApiRequest<T>(
  url: string,
  options: {
    method: 'POST' | 'PATCH' | 'DELETE';
    body: unknown;
    timeoutMs?: number;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort('timeout'),
    options.timeoutMs ?? 45_000,
  );

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(options.body),
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
      );
    }

    return body as T;
  } catch (error) {
    if (controller.signal.reason === 'timeout') {
      throw new ProjectApiError(
        408,
        'The request timed out. Check your connection and try again.',
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
  }
}
