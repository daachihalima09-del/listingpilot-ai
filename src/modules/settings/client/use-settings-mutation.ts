'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type FieldErrors = Record<string, string[] | undefined>;

interface SettingsMutationState {
  status: 'idle' | 'submitting' | 'success' | 'error';
  message?: string;
  fieldErrors?: FieldErrors;
}

interface SettingsApiErrorBody {
  error?: {
    message?: string;
    fieldErrors?: FieldErrors;
  };
}

const REQUEST_TIMEOUT_MS = 45_000;

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function getApiError(body: unknown): SettingsApiErrorBody['error'] {
  if (!body || typeof body !== 'object' || !('error' in body)) {
    return undefined;
  }

  const error = body.error;
  return error && typeof error === 'object'
    ? error as SettingsApiErrorBody['error']
    : undefined;
}

export function useSettingsMutation<TResponse>(endpoint: string) {
  const [state, setState] = useState<SettingsMutationState>({ status: 'idle' });
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, []);

  const clearFeedback = useCallback(() => {
    setState((current) => current.status === 'idle'
      ? current
      : { status: 'idle' });
  }, []);

  const setValidationErrors = useCallback((fieldErrors: FieldErrors) => {
    setState({
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors,
    });
  }, []);

  const mutate = useCallback(async (payload: unknown): Promise<TResponse | null> => {
    if (activeRequest.current) {
      return null;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort('timeout'),
      REQUEST_TIMEOUT_MS,
    );
    setState({ status: 'submitting' });

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const body = await readResponseBody(response);

      if (!response.ok) {
        const apiError = getApiError(body);
        if (mounted.current) {
          setState({
            status: 'error',
            message: apiError?.message ?? 'Settings could not be updated.',
            fieldErrors: apiError?.fieldErrors,
          });
        }
        return null;
      }

      if (mounted.current) {
        setState({
          status: 'success',
          message: 'Changes saved.',
        });
      }
      return body as TResponse;
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setState({
          status: 'error',
          message: 'Settings could not be updated. Check your connection and try again.',
        });
      } else if (mounted.current && controller.signal.reason === 'timeout') {
        setState({
          status: 'error',
          message: 'The update timed out. Please try again.',
        });
      }
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
      }
    }
  }, [endpoint]);

  return {
    state,
    isSubmitting: state.status === 'submitting',
    mutate,
    clearFeedback,
    setValidationErrors,
  };
}
