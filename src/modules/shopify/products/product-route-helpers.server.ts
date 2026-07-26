import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyProductPublishError } from './product-errors';

const MAX_PRODUCT_CREATE_BODY_BYTES = 128 * 1024;

export function readShopifyProductCreateBody(
  request: Request,
): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_PRODUCT_CREATE_BODY_BYTES);
}

export function readShopifyProductUpdateBody(
  request: Request,
): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_PRODUCT_CREATE_BODY_BYTES);
}

export function unauthenticatedShopifyProductResponse(): NextResponse {
  return NextResponse.json({
    error: {
      code: 'AUTH_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  }, { status: 401 });
}

export function shopifyProductRouteErrorResponse(
  error: unknown,
): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'SHOPIFY_PRODUCT_INVALID_INPUT',
        message: 'Correct the product details and try again.',
        fieldErrors: error.flatten().fieldErrors,
      },
    }, { status: 400 });
  }
  if (error instanceof ShopifyProductPublishError) {
    return NextResponse.json({
      error: {
        code: error.code,
        message: error.message,
      },
    }, { status: error.statusCode });
  }
  if (error instanceof JsonRequestBodyError) {
    return NextResponse.json({
      error: {
        code: error.statusCode === 413
          ? 'SHOPIFY_PRODUCT_PAYLOAD_TOO_LARGE'
          : 'SHOPIFY_PRODUCT_INVALID_INPUT',
        message: error.message,
      },
    }, { status: error.statusCode });
  }

  console.error('Unable to complete Shopify product operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_PRODUCT_OPERATION_FAILED',
      message: 'The Shopify product operation could not be completed.',
    },
  }, { status: 500 });
}
