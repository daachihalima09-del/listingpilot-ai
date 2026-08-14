import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { MerchantPreferenceError } from '@/modules/merchant-preferences';

export function merchantPublishingProfileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) return NextResponse.json({ error: { code: 'INVALID_PUBLISHING_PROFILE', message: error instanceof ZodError ? error.issues[0]?.message ?? 'The Publishing Profile is invalid.' : error.message } }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  if (error instanceof MerchantPreferenceError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  return NextResponse.json({ error: { code: 'PUBLISHING_PROFILE_UNAVAILABLE', message: 'The Publishing Profile could not be saved right now.' } }, { status: 503 });
}
