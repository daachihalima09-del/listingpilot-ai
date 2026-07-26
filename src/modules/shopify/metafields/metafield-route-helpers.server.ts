import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyMetafieldError } from './metafield-errors';

const MAX_METAFIELD_CONFIGURATION_BYTES = 64 * 1024;

export function readShopifyMetafieldRequest(request: Request) {
  return readBoundedJsonRequest(request, MAX_METAFIELD_CONFIGURATION_BYTES);
}

export function unauthenticatedMetafieldResponse(): NextResponse {
  return NextResponse.json({
    error: {
      code: 'AUTH_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  }, { status: 401 });
}

export function shopifyMetafieldErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'SHOPIFY_METAFIELD_INVALID_INPUT',
        message: 'Correct the metafield configuration and try again.',
        fieldErrors: error.flatten().fieldErrors,
      },
    }, { status: 400 });
  }
  if (error instanceof ShopifyMetafieldError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message },
    }, { status: error.statusCode });
  }
  if (error instanceof JsonRequestBodyError) {
    return NextResponse.json({
      error: {
        code: error.statusCode === 413
          ? 'SHOPIFY_METAFIELD_PAYLOAD_TOO_LARGE'
          : 'SHOPIFY_METAFIELD_INVALID_INPUT',
        message: error.message,
      },
    }, { status: error.statusCode });
  }
  console.error('Unable to complete Shopify metafield operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_METAFIELD_OPERATION_FAILED',
      message: 'The Shopify metafield operation could not be completed.',
    },
  }, { status: 500 });
}

