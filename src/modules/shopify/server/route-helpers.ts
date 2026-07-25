import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  JsonRequestBodyError,
  readBoundedJsonRequest,
} from '@/lib/server/json-request';
import { ShopifyError, shopifyErrorCodes } from '../types/errors';

const MAX_SHOPIFY_CONNECT_BODY_BYTES = 4 * 1024;

export function readShopifyConnectRequestBody(request: Request): Promise<unknown> {
  return readBoundedJsonRequest(request, MAX_SHOPIFY_CONNECT_BODY_BYTES);
}

export function shopifyRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: shopifyErrorCodes.invalidInput,
          message: 'Enter a valid Shopify store and workspace.',
          fieldErrors: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof ShopifyError) {
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
          code: shopifyErrorCodes.invalidInput,
          message: error.message,
        },
      },
      { status: error.statusCode },
    );
  }

  console.error('Unable to start Shopify authorization.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json(
    {
      error: {
        code: shopifyErrorCodes.configuration,
        message: 'Shopify authorization could not be started.',
      },
    },
    { status: 500 },
  );
}
