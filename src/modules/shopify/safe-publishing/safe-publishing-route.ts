import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { SafePublishingError } from './safe-publishing-error';
import { createUnexpectedPublishingFailure } from './safe-publishing-route-core';

export function safePublishingErrorResponse(error: unknown): NextResponse {
  if (error instanceof SafePublishingError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json({ error: { code: 'INVALID_PUBLISHING_REQUEST', message: 'The publishing request is invalid.' } }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  }
  const failure = createUnexpectedPublishingFailure(error);
  console.error('Safe Shopify publishing failed', failure.log);
  const response = NextResponse.json(failure.body, { status: 503 });
  response.headers.set('x-listingpilot-request-id', failure.reference);
  return response;
}
