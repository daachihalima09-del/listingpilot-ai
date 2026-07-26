import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyVariantError } from './variant-errors';

const MAX_VARIANT_CONFIGURATION_BYTES = 512 * 1024;

export function readShopifyVariantConfiguration(
  request: Request,
): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_VARIANT_CONFIGURATION_BYTES);
}

export function unauthenticatedVariantResponse(): NextResponse {
  return NextResponse.json({
    error: {
      code: 'AUTH_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  }, { status: 401 });
}

export function shopifyVariantErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'SHOPIFY_VARIANT_INVALID_INPUT',
        message: 'Correct the variant configuration and try again.',
        fieldErrors: error.flatten().fieldErrors,
      },
    }, { status: 400 });
  }
  if (error instanceof ShopifyVariantError) {
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
          ? 'SHOPIFY_VARIANT_PAYLOAD_TOO_LARGE'
          : 'SHOPIFY_VARIANT_INVALID_INPUT',
        message: error.message,
      },
    }, { status: error.statusCode });
  }
  console.error('Unable to complete Shopify variant operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_VARIANT_OPERATION_FAILED',
      message: 'The Shopify variant operation could not be completed.',
    },
  }, { status: 500 });
}
