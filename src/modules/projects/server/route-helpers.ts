import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ProjectError } from '../types/errors';

const MAX_PROJECT_BODY_BYTES = 512 * 1024;

export function readProjectRequestBody(request: Request): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_PROJECT_BODY_BYTES);
}

export function bindProjectId(body: unknown, projectId: string): unknown {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? { ...body, projectId }
    : { projectId };
}

export function unauthenticatedProjectResponse(): NextResponse {
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

export function projectRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'PROJECT_INVALID_INPUT',
          message: 'Please correct the highlighted fields.',
          fieldErrors: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof ProjectError) {
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

  if (error instanceof JsonRequestBodyError) {
    return NextResponse.json(
      {
        error: {
          code: error.statusCode === 413
            ? 'PROJECT_PAYLOAD_TOO_LARGE'
            : 'PROJECT_INVALID_JSON',
          message: error.message,
        },
      },
      { status: error.statusCode },
    );
  }

  console.error('Unable to complete project operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json(
    {
      error: {
        code: 'PROJECT_OPERATION_FAILED',
        message: 'The project operation could not be completed. Please try again.',
      },
    },
    { status: 500 },
  );
}
