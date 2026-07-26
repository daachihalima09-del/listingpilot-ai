import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyProductPublishError } from '../products/product-errors';
import {
  ShopifyPublicationError,
} from './publication-errors';

const MAX_PUBLICATION_BODY_BYTES = 136 * 1024;

export function readShopifyPublicationBody(request: Request): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_PUBLICATION_BODY_BYTES);
}

export function shopifyPublicationErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({
      error: {
        code: 'SHOPIFY_PUBLICATION_INVALID_INPUT',
        message: 'Correct the listing details and try again.',
      },
    }, { status: 400 });
  }
  if (
    error instanceof ShopifyPublicationError
    || error instanceof ShopifyProductPublishError
  ) {
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
          ? 'SHOPIFY_PUBLICATION_PAYLOAD_TOO_LARGE'
          : 'SHOPIFY_PUBLICATION_INVALID_INPUT',
        message: error.message,
      },
    }, { status: error.statusCode });
  }

  console.error('Unable to publish the project to Shopify.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_PUBLICATION_FAILED',
      message: 'The Shopify publish could not be completed.',
    },
  }, { status: 500 });
}
