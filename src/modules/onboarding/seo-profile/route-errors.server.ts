import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { MerchantPreferenceError } from '@/modules/merchant-preferences';

export function merchantSeoProfileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) return NextResponse.json({ error: { code: 'INVALID_SEO_PROFILE', message: error instanceof ZodError ? error.issues[0]?.message ?? 'The SEO Profile is invalid.' : error.message } }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  if (error instanceof MerchantPreferenceError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  return NextResponse.json({ error: { code: 'SEO_PROFILE_UNAVAILABLE', message: 'The SEO Profile could not be saved right now.' } }, { status: 503 });
}
