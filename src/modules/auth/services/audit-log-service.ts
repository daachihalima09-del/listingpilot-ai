import 'server-only';

import { createAuditLogRecord, type AuditLogRecord } from '@/modules/auth/repositories/audit-log-repository';
import {
  AuditLogWriteError,
  InvalidAuthenticationInputError,
} from '@/modules/auth/types/errors';
import {
  createAuditLogSchema,
  type CreateAuditLogInput,
} from '@/modules/auth/validators/audit-log';

export async function recordAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
  const result = createAuditLogSchema.safeParse(input);
  if (!result.success) {
    throw new InvalidAuthenticationInputError();
  }

  try {
    return await createAuditLogRecord(result.data);
  } catch (error) {
    console.error('Unable to persist authentication audit event.', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    throw new AuditLogWriteError({ cause: error });
  }
}
