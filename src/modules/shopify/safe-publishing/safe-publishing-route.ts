import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { SafePublishingError } from './safe-publishing-error';

export function safePublishingErrorResponse(error: unknown): NextResponse {
  if (error instanceof SafePublishingError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json({ error: { code: 'INVALID_PUBLISHING_REQUEST', message: 'The publishing request is invalid.' } }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  }
  console.error('Safe Shopify publishing failed', error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  return NextResponse.json({ error: { code: 'SHOPIFY_PUBLISHING_UNAVAILABLE', message: 'Safe Shopify publishing is temporarily unavailable.' } }, { status: 503 });
}
