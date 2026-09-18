import 'server-only';

import { NextResponse } from 'next/server';

export function unauthenticatedShopifyProductResponse(): NextResponse {
  return NextResponse.json({
    error: {
      code: 'AUTH_UNAUTHENTICATED',
      message: 'Authentication is required.',
    },
  }, { status: 401 });
}
