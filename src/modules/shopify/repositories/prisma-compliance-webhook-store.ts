import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  ShopifyComplianceOutcome,
  ShopifyComplianceWebhookStore,
} from '../webhooks/compliance-service';

const AUDIT_ACTION = 'shopify.compliance_webhook_received';
const AUDIT_ENTITY_TYPE = 'ShopifyWebhookDelivery';

function outcomeFor(
  topic: string,
  knownShop: boolean,
): ShopifyComplianceOutcome {
  if (!knownShop) return 'UNKNOWN_SHOP';
  return topic === 'shop/redact'
    ? 'SHOP_REDACTION_POLICY_PENDING'
    : 'NO_CUSTOMER_DATA_STORED';
}

function metadataOutcome(value: unknown): ShopifyComplianceOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outcome = (value as { outcome?: unknown }).outcome;
  return outcome === 'NO_CUSTOMER_DATA_STORED'
    || outcome === 'SHOP_REDACTION_POLICY_PENDING'
    || outcome === 'UNKNOWN_SHOP'
    ? outcome
    : null;
}

export const prismaShopifyComplianceWebhookStore:
ShopifyComplianceWebhookStore = {
  record(input) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${input.webhookId}))
      `;
      const existing = await transaction.auditLog.findFirst({
        where: {
          action: AUDIT_ACTION,
          entityType: AUDIT_ENTITY_TYPE,
          entityId: input.webhookId,
        },
        select: { workspaceId: true, metadata: true },
      });
      if (existing) {
        return {
          duplicate: true,
          knownShop: Boolean(existing.workspaceId),
          outcome: metadataOutcome(existing.metadata)
            ?? outcomeFor(input.topic, Boolean(existing.workspaceId)),
        };
      }

      const store = await transaction.shopifyStore.findUnique({
        where: { shopDomain: input.shopDomain },
        select: {
          id: true,
          workspaceId: true,
          status: true,
          accessTokenEncrypted: true,
          disconnectedAt: true,
          workspace: { select: { organizationId: true } },
        },
      });
      const outcome = outcomeFor(input.topic, Boolean(store));

      if (
        input.topic === 'shop/redact'
        && store
        && (store.status !== 'DISCONNECTED' || store.accessTokenEncrypted)
      ) {
        await transaction.shopifyStore.update({
          where: { id: store.id },
          data: {
            status: 'DISCONNECTED',
            accessTokenEncrypted: null,
            disconnectedAt: store.disconnectedAt ?? input.receivedAt,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          organizationId: store?.workspace.organizationId,
          workspaceId: store?.workspaceId,
          action: AUDIT_ACTION,
          entityType: AUDIT_ENTITY_TYPE,
          entityId: input.webhookId,
          metadata: {
            topic: input.topic,
            shopDomain: input.shopDomain,
            shopId: input.shopId,
            eventId: input.eventId,
            apiVersion: input.apiVersion,
            triggeredAt: input.triggeredAt?.toISOString() ?? null,
            payloadHash: input.rawBodyHash,
            outcome,
            customerDataStored: false,
            policyDecisionRequired: input.topic === 'shop/redact',
          },
        },
      });
      return { duplicate: false, knownShop: Boolean(store), outcome };
    }, { maxWait: 5_000, timeout: 4_000 });
  },
};
