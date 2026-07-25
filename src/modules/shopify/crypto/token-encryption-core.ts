import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';

const encryptedTokenSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).strict();

function decodeKey(base64Key: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(base64Key)) {
    throw new Error('Invalid Shopify token encryption key.');
  }
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32 || key.toString('base64') !== base64Key) {
    throw new Error('Invalid Shopify token encryption key.');
  }
  return key;
}

export function encryptShopifyAccessToken(
  token: string,
  base64Key: string,
): string {
  if (!token) {
    throw new Error('A Shopify access token is required.');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(base64Key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const payload = {
    v: 1 as const,
    alg: 'A256GCM' as const,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  return JSON.stringify(payload);
}

export function decryptShopifyAccessToken(
  serialized: string,
  base64Key: string,
): string {
  let untrustedPayload: unknown;
  try {
    untrustedPayload = JSON.parse(serialized);
  } catch {
    throw new Error('Invalid encrypted Shopify token.');
  }
  const result = encryptedTokenSchema.safeParse(untrustedPayload);
  if (!result.success) {
    throw new Error('Invalid encrypted Shopify token.');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      decodeKey(base64Key),
      Buffer.from(result.data.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(result.data.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(result.data.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt Shopify token.');
  }
}
