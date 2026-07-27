import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { ShopifyCatalogError } from './catalog-errors';

export function shopifyCatalogErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json({
      error: {
        code: 'INVALID_PRODUCT_REFERENCE',
        message: 'The catalog request is invalid.',
      },
    }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  }
  if (error instanceof ShopifyCatalogError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message },
    }, { status: error.statusCode });
  }
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_UNAVAILABLE',
      message: 'The Shopify catalog is temporarily unavailable.',
    },
  }, { status: 503 });
}

