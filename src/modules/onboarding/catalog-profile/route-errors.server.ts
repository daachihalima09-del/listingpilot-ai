import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { MerchantCatalogProfileError } from './errors';

export function merchantCatalogProfileErrorResponse(
  error: unknown,
): NextResponse {
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json({
      error: {
        code: 'INVALID_CATALOG_PROFILE',
        message: error instanceof ZodError
          ? error.issues[0]?.message ?? 'The catalog profile is invalid.'
          : error.message,
      },
    }, {
      status: error instanceof JsonRequestBodyError ? error.statusCode : 400,
    });
  }
  if (error instanceof MerchantCatalogProfileError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message },
    }, { status: error.statusCode });
  }
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_UNAVAILABLE',
      message: 'The catalog profile could not be completed right now.',
    },
  }, { status: 503 });
}
