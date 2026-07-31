import type {
  MerchantBusinessProfileRecord,
  MerchantPreferenceSectionStatus,
  MerchantPreferenceSource,
  MerchantPreferenceValidationStatus,
} from './types.ts';
import type { MerchantPreferenceSectionId } from './section-ids.ts';

export interface MerchantBusinessProfileRepository {
  findByWorkspaceId(
    workspaceId: string,
  ): Promise<MerchantBusinessProfileRecord | null>;
  saveSection(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    sectionId: MerchantPreferenceSectionId;
    schemaVersion: number;
    expectedSectionVersion: number | null;
    status: MerchantPreferenceSectionStatus;
    validationStatus: MerchantPreferenceValidationStatus;
    source: MerchantPreferenceSource;
    payload: unknown;
    fingerprint: string;
    metadata: Readonly<Record<string, unknown>>;
    auditEvent?: 'STANDARD_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED';
    completedAt: Date | null;
  }): Promise<MerchantBusinessProfileRecord>;
}
