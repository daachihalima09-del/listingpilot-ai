import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyImageError } from './image-errors';
import { SHOPIFY_IMAGE_LIMITS } from './image-limits';

export function readShopifyImageJson(request: Request) {
  return readBoundedJsonRequest(request, 64 * 1024);
}

export function unauthenticatedImageResponse() {
  return NextResponse.json({
    error: { code: 'AUTH_UNAUTHENTICATED', message: 'Authentication is required.' },
  }, { status: 401 });
}

export async function readImageUpload(request: Request) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > SHOPIFY_IMAGE_LIMITS.maximumImageBytes + 64 * 1024) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'The image upload is too large.',
      413,
    );
  }
  const form = await request.formData();
  const uploadId = form.get('uploadId');
  const file = form.get('file');
  if (typeof uploadId !== 'string' || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'The upload reference is invalid.',
      400,
    );
  }
  if (!(file instanceof File)) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'An image file is required.',
      400,
    );
  }
  return { uploadId, file };
}

export function shopifyImageErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'SHOPIFY_IMAGE_INVALID_INPUT',
        message: 'Correct the image details and try again.',
        fieldErrors: error.flatten().fieldErrors,
      },
    }, { status: 400 });
  }
  if (error instanceof ShopifyImageError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message },
    }, { status: error.statusCode });
  }
  if (error instanceof JsonRequestBodyError) {
    return NextResponse.json({
      error: { code: 'SHOPIFY_IMAGE_INVALID_INPUT', message: error.message },
    }, { status: error.statusCode });
  }
  console.error('Unable to complete Shopify image operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_IMAGE_UNAVAILABLE',
      message: 'The Shopify image operation could not be completed.',
    },
  }, { status: 500 });
}
