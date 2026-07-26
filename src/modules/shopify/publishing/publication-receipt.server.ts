import 'server-only';

import { z } from 'zod';
import { getShopifyConfig } from '../config';
import {
  decryptShopifyAccessToken,
  encryptShopifyAccessToken,
} from '../crypto/token-encryption-core';

const recoveryReceiptSchema = z.object({
  version: z.literal(1),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  product: z.object({
    id: z.string().regex(/^[1-9]\d{0,19}$/),
    title: z.string().min(1).max(255),
    handle: z.string().min(1).max(255),
    status: z.enum(['ACTIVE', 'DRAFT']),
  }).strict(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export type ShopifyPublicationRecovery =
  z.infer<typeof recoveryReceiptSchema>;

export function createShopifyPublicationRecoveryReceipt(
  input: Omit<ShopifyPublicationRecovery, 'version' | 'expiresAt'>,
  now = new Date(),
): string {
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  return encryptShopifyAccessToken(JSON.stringify({
    version: 1,
    ...input,
    expiresAt: expiresAt.toISOString(),
  }), getShopifyConfig().tokenEncryptionKey);
}

export function parseShopifyPublicationRecoveryReceipt(
  serialized: string,
  now = new Date(),
): ShopifyPublicationRecovery {
  const decrypted = decryptShopifyAccessToken(
    serialized,
    getShopifyConfig().tokenEncryptionKey,
  );
  const receipt = recoveryReceiptSchema.parse(JSON.parse(decrypted));
  if (new Date(receipt.expiresAt).getTime() <= now.getTime()) {
    throw new Error('The Shopify publication recovery receipt expired.');
  }
  return receipt;
}
