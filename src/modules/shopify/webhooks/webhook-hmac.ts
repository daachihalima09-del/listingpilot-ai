import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export function verifyShopifyWebhookHmac(
  rawBody: Uint8Array,
  suppliedHmac: string | null,
  apiSecret: string,
): boolean {
  if (!suppliedHmac || !/^[A-Za-z0-9+/]{43}=$/.test(suppliedHmac)) {
    return false;
  }
  const expected = createHmac('sha256', apiSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHmac, 'base64');
  return supplied.length === expected.length
    && timingSafeEqual(supplied, expected);
}

