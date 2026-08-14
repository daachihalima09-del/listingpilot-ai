import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { JsonRequestBodyError } from '../../../lib/server/json-request.ts';
import { MerchantPreferenceError } from '../../merchant-preferences/index.ts';
import { OpenAiResponsesError } from '../../openai/responses-client-core.ts';
import { ProjectError } from '../../projects/types/errors.ts';
import { ListingDraftError } from '../domain/errors.ts';

export function listingDraftRouteErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: 'DRAFT_INVALID_REQUEST', message: 'The listing draft request is invalid.' } }, { status: 400 });
  }
  if (error instanceof ListingDraftError) {
    if (process.env.NODE_ENV !== 'production' && ['DRAFT_INVENTED_VALUE', 'DRAFT_POLICY_VIOLATION'].includes(error.code)) {
      console.error('Listing draft validation diagnostic.', {
        code: error.code,
        ...error.metadata,
      });
    }
    const merchantMessage = error.code === 'DRAFT_INVENTED_VALUE'
      ? 'Listing quality check failed. A generated product detail did not match the verified product information.'
      : error.message;
    return NextResponse.json({ error: { code: error.code, message: merchantMessage } }, { status: error.statusCode });
  }
  if (error instanceof OpenAiResponsesError) {
    return NextResponse.json({ error: { code: `DRAFT_PROVIDER_${error.code}`, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof ProjectError || error instanceof MerchantPreferenceError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
  }
  if (error instanceof JsonRequestBodyError) {
    return NextResponse.json({ error: { code: 'DRAFT_INVALID_REQUEST', message: error.message } }, { status: error.statusCode });
  }
  console.error('Unable to complete listing draft operation.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: { code: 'DRAFT_OPERATION_FAILED', message: 'The listing draft operation could not be completed. Please try again.' },
  }, { status: 500 });
}
