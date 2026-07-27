import 'server-only';

import { recordAuditLog } from '@/modules/auth/services/audit-log-service';

export async function recordShopifyLaunchAuditSafely(input: {
  action:
    | 'shopify.launch_received'
    | 'shopify.launch_verified'
    | 'shopify.launch_rejected'
    | 'shopify.launch_expired'
    | 'shopify.launch_workspace_selected'
    | 'shopify.oauth_continued_from_launch'
    | 'shopify.connection_completed_from_launch';
  intentId?: string;
  userId?: string;
  organizationId?: string;
  workspaceId?: string;
  metadata?: Record<string, string | boolean | null>;
}): Promise<void> {
  try {
    await recordAuditLog({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: input.action,
      entityType: 'ShopifyLaunchIntent',
      entityId: input.intentId,
      metadata: input.metadata,
    });
  } catch {
    // Audit persistence must not leak request details or break the secure flow.
  }
}

