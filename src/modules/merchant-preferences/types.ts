import type { MerchantPreferenceSectionId } from './section-ids.ts';

export type MerchantBusinessProfileStatus =
  | 'INCOMPLETE'
  | 'COMPLETE'
  | 'NEEDS_REVIEW'
  | 'INVALID';

export type MerchantPreferenceSectionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'NEEDS_REVIEW'
  | 'INVALID';

export type MerchantPreferenceValidationStatus =
  | 'NOT_VALIDATED'
  | 'VALID'
  | 'INVALID';

export type MerchantPreferenceSource =
  | 'SHOPIFY_IMPORT'
  | 'MANUAL'
  | 'MERCHANT_EDIT'
  | 'PLATFORM_DEFAULT';

export interface MerchantPreferenceSectionRecord {
  id: string;
  workspaceId: string;
  sectionId: string;
  schemaVersion: number;
  version: number;
  status: MerchantPreferenceSectionStatus;
  validationStatus: MerchantPreferenceValidationStatus;
  source: MerchantPreferenceSource;
  payload: unknown;
  fingerprint: string;
  metadata: unknown;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchantBusinessProfileRecord {
  id: string;
  workspaceId: string;
  version: number;
  status: MerchantBusinessProfileStatus;
  lastCompletedSectionId: string | null;
  fingerprint: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  sections: MerchantPreferenceSectionRecord[];
}

export interface MerchantPreferenceSection<T = unknown> {
  readonly id: string;
  readonly workspaceId: string;
  readonly sectionId: MerchantPreferenceSectionId;
  readonly schemaVersion: number;
  readonly version: number;
  readonly status: MerchantPreferenceSectionStatus;
  readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly source: MerchantPreferenceSource;
  readonly data: T | null;
  readonly fingerprint: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MerchantBusinessProfile {
  readonly id: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly status: MerchantBusinessProfileStatus;
  readonly activeSectionIds: readonly MerchantPreferenceSectionId[];
  readonly sections: readonly MerchantPreferenceSection[];
  readonly sectionVersions: Readonly<
  Partial<Record<MerchantPreferenceSectionId, number>>
  >;
  readonly lastCompletedSectionId: MerchantPreferenceSectionId | null;
  readonly fingerprint: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
