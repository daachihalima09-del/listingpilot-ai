import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SettingsError } from '../types/errors';

const MAX_SETTINGS_BODY_BYTES = 16 * 1024;

class SettingsRequestBodyError extends Error {
  readonly statusCode: 400 | 413;

  constructor(message: string, statusCode: 400 | 413) {
    super(message);
    this.name = 'SettingsRequestBodyError';
    this.statusCode = statusCode;
  }
}

export async function readSettingsRequestBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SETTINGS_BODY_BYTES) {
    throw new SettingsRequestBodyError('The request body is too large.', 413);
  }

  if (!request.body) {
    throw new SettingsRequestBodyError('A JSON request body is required.', 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_SETTINGS_BODY_BYTES) {
        await reader.cancel();
        throw new SettingsRequestBodyError('The request body is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new SettingsRequestBodyError('The request body must be valid JSON.', 400);
  }
}

export function unauthenticatedSettingsResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'AUTH_UNAUTHENTICATED',
        message: 'Authentication is required.',
      },
    },
    { status: 401 },
  );
}

export function settingsRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'SETTINGS_INVALID_INPUT',
          message: 'Please correct the highlighted fields.',
          fieldErrors: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof SettingsError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.statusCode },
    );
  }

  if (error instanceof SettingsRequestBodyError) {
    return NextResponse.json(
      {
        error: {
          code: error.statusCode === 413
            ? 'SETTINGS_PAYLOAD_TOO_LARGE'
            : 'SETTINGS_INVALID_JSON',
          message: error.message,
        },
      },
      { status: error.statusCode },
    );
  }

  console.error('Unable to update tenant settings.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json(
    {
      error: {
        code: 'SETTINGS_UPDATE_FAILED',
        message: 'Settings could not be updated. Please try again.',
      },
    },
    { status: 500 },
  );
}
