import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export function buildShopifyHmacMessage(
  searchParams: URLSearchParams,
): string {
  const signedParameters = new URLSearchParams();
  for (const [key, value] of searchParams) {
    if (key !== 'hmac') {
      signedParameters.append(key, value);
    }
  }
  signedParameters.sort();
  return signedParameters.toString();
}

export function verifyShopifyOAuthHmac(
  searchParams: URLSearchParams,
  secret: string,
): boolean {
  const suppliedHmac = searchParams.get('hmac');
  if (
    !suppliedHmac
    || searchParams.getAll('hmac').length !== 1
    || !/^[a-fA-F0-9]{64}$/.test(suppliedHmac)
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(buildShopifyHmacMessage(searchParams), 'utf8')
    .digest();
  const supplied = Buffer.from(suppliedHmac, 'hex');
  return supplied.length === expected.length
    && timingSafeEqual(supplied, expected);
}
