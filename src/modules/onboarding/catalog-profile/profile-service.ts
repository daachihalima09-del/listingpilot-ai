import type {
  MerchantCatalogProfileDto,
  MerchantCatalogProfileRecord,
} from './types.ts';
import {
  merchantCatalogProfileInputSchema,
  profileRecordToDto,
} from './validation.ts';
import { MerchantCatalogProfileError } from './errors.ts';

export interface MerchantCatalogProfileRepository {
  findByWorkspaceId(
    workspaceId: string,
  ): Promise<MerchantCatalogProfileRecord | null>;
  save(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    expectedVersion?: number | null;
    profile: ReturnType<typeof merchantCatalogProfileInputSchema.parse>;
  }): Promise<MerchantCatalogProfileRecord>;
}

export interface MerchantCatalogProfileAccess {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export async function getMerchantCatalogProfile(
  repository: MerchantCatalogProfileRepository,
  workspaceId: string,
): Promise<MerchantCatalogProfileDto | null> {
  const profile = await repository.findByWorkspaceId(workspaceId);
  return profile ? profileRecordToDto(profile) : null;
}

export async function saveMerchantCatalogProfile(
  repository: MerchantCatalogProfileRepository,
  access: MerchantCatalogProfileAccess,
  untrustedInput: unknown,
  expectedVersion?: number | null,
): Promise<MerchantCatalogProfileDto> {
  if (access.role !== 'OWNER') {
    throw new MerchantCatalogProfileError(
      'OWNER_REQUIRED',
      403,
      'Only the workspace owner can configure the catalog profile.',
    );
  }
  const profile = merchantCatalogProfileInputSchema.parse(untrustedInput);
  const saved = await repository.save({
    actorUserId: access.actorUserId,
    organizationId: access.organizationId,
    workspaceId: access.workspaceId,
    expectedVersion,
    profile,
  });
  return profileRecordToDto(saved);
}
