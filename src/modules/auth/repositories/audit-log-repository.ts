import 'server-only';

import { Prisma, type AuditLog } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ValidatedAuditLogInput } from '@/modules/auth/validators/audit-log';

export type AuditLogRecord = AuditLog;

export async function createAuditLogRecord(
  input: ValidatedAuditLogInput,
): Promise<AuditLogRecord> {
  const metadata = input.metadata === null || input.metadata === undefined
    ? Prisma.DbNull
    : input.metadata;

  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata,
    },
  });
}
