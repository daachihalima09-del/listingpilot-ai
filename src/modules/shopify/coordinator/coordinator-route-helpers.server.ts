import 'server-only';

import { NextResponse } from 'next/server';
import { ShopifyCoordinatorError } from './coordinator-error';

export function unauthenticatedCoordinatorResponse() {
  return NextResponse.json({
    error: { code: 'AUTH_UNAUTHENTICATED', message: 'Authentication is required.' },
  }, { status: 401 });
}

export function coordinatorErrorResponse(error: unknown) {
  if (error instanceof ShopifyCoordinatorError) {
    return NextResponse.json({
      error: { code: error.code, message: error.message },
    }, { status: error.statusCode });
  }
  console.error('Unable to complete coordinated Shopify publication.', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_COORDINATOR_FAILED',
      message: 'The Shopify publication could not be completed.',
    },
  }, { status: 500 });
}
