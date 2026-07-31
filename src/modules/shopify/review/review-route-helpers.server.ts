import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { ShopifyReviewError } from './review-errors';

export function reviewErrorResponse(error: unknown): NextResponse {
  if (error instanceof ShopifyReviewError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode },
    );
  }
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json(
      { error: { code: 'INVALID_DECISION', message: 'The review request is invalid.' } },
      { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 },
    );
  }
  return NextResponse.json(
    { error: { code: 'SHOPIFY_UNAVAILABLE', message: 'The Shopify review is temporarily unavailable.' } },
    { status: 500 },
  );
}

