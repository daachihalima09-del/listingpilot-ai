import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '@/lib/server/json-request';
import { MerchantPreferenceError } from '../../merchant-preferences/errors.ts';
import { ListingCalibrationError } from '../domain/errors.ts';

export function calibrationRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof ListingCalibrationError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof MerchantPreferenceError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof ZodError || error instanceof JsonRequestBodyError) {
    return NextResponse.json({ error: { code: 'CALIBRATION_INVALID_REQUEST', message: 'The calibration request is invalid.' } }, { status: error instanceof JsonRequestBodyError ? error.statusCode : 400 });
  }
  console.error('Listing calibration request failed.', { name: error instanceof Error ? error.name : 'UnknownError' });
  return NextResponse.json({ error: { code: 'CALIBRATION_UNAVAILABLE', message: 'Listing calibration is temporarily unavailable.' } }, { status: 500 });
}

export function queryObject(request: Request): Record<string, string | undefined> {
  const query = new URL(request.url).searchParams;
  return Object.fromEntries([...query.entries()].map(([key, value]) => [key, value || undefined]));
}
