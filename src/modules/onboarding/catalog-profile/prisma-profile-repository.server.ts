import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CATALOG_PREFERENCE_SCHEMA_VERSION,
  catalogPreferenceSource,
} from '@/modules/merchant-preferences/catalog-section';
import {
  merchantProfileCreatedAuditEvent,
  preferenceSectionAuditEvent,
} from '@/modules/merchant-preferences/audit';
import { stableMerchantPreferenceFingerprint } from '@/modules/merchant-preferences/fingerprint';
import { MerchantPreferenceConcurrencyError } from '@/modules/merchant-preferences/errors';
import type { MerchantCatalogProfileRepository } from './profile-service';
import { MerchantCatalogProfileError } from './errors';
import type {
  MerchantCatalogEntryKind,
} from './types';
import { merchantCatalogComparisonKey } from './validation';

const profileSelect = {
  id: true,
  workspaceId: true,
  setupMode: true,
  version: true,
  completedAt: true,
  updatedAt: true,
  entries: {
    orderBy: [
      { kind: 'asc' },
      { position: 'asc' },
    ],
    select: {
      kind: true,
      value: true,
      normalizedValue: true,
      position: true,
    },
  },
} satisfies Prisma.MerchantCatalogProfileSelect;

function entryData(
  kind: MerchantCatalogEntryKind,
  values: string[],
) {
  return values.map((value, position) => ({
    kind,
    value,
    normalizedValue: merchantCatalogComparisonKey(value),
    position,
  }));
}

export const prismaMerchantCatalogProfileRepository:
MerchantCatalogProfileRepository = {
  async findByWorkspaceId(workspaceId) {
    return prisma.merchantCatalogProfile.findUnique({
      where: { workspaceId },
      select: profileSelect,
    });
  },

  async save(input) {
    try {
      const savedId = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.merchantCatalogProfile.findUnique({
          where: { workspaceId: input.workspaceId },
          select: { id: true, version: true },
        });
        if (
          input.expectedVersion !== undefined
          && (
            (existing && existing.version !== input.expectedVersion)
            || (!existing && input.expectedVersion !== null)
          )
        ) {
          throw new MerchantPreferenceConcurrencyError();
        }
        const now = new Date();
        let profile: { id: string; version: number };
        if (existing) {
          if (input.expectedVersion !== undefined) {
            const update = await transaction.merchantCatalogProfile.updateMany({
              where: {
                id: existing.id,
                workspaceId: input.workspaceId,
                version: input.expectedVersion!,
              },
              data: {
                setupMode: input.profile.setupMode,
                completedAt: now,
                version: { increment: 1 },
              },
            });
            if (update.count !== 1) {
              throw new MerchantPreferenceConcurrencyError();
            }
            profile = {
              id: existing.id,
              version: existing.version + 1,
            };
          } else {
            profile = await transaction.merchantCatalogProfile.update({
              where: { id: existing.id },
              data: {
                setupMode: input.profile.setupMode,
                completedAt: now,
                version: { increment: 1 },
              },
              select: { id: true, version: true },
            });
          }
        } else {
          profile = await transaction.merchantCatalogProfile.create({
            data: {
              workspaceId: input.workspaceId,
              setupMode: input.profile.setupMode,
              completedAt: now,
            },
            select: { id: true, version: true },
          });
        }

        await transaction.merchantCatalogEntry.deleteMany({
          where: { profileId: profile.id },
        });
        const entries = [
          ...entryData('COLLECTION', input.profile.collections),
          ...entryData('PRODUCT_TYPE', input.profile.productTypes),
          ...entryData('VENDOR', input.profile.vendors),
        ].map((entry) => ({ ...entry, profileId: profile.id }));
        if (entries.length > 0) {
          await transaction.merchantCatalogEntry.createMany({ data: entries });
        }

        const payload = {
          setupMode: input.profile.setupMode,
          collections: input.profile.collections,
          productTypes: input.profile.productTypes,
          vendors: input.profile.vendors,
        };
        const sectionFingerprint = stableMerchantPreferenceFingerprint({
          sectionId: 'catalog',
          schemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
          payload,
        });
        const businessFingerprint = stableMerchantPreferenceFingerprint({
          workspaceId: input.workspaceId,
          catalog: sectionFingerprint,
          status: 'COMPLETE',
        });
        const existingBusinessProfile = await transaction
          .merchantBusinessProfile.findUnique({
            where: { workspaceId: input.workspaceId },
            select: { id: true },
          });
        const businessProfile = await transaction.merchantBusinessProfile.upsert({
          where: { workspaceId: input.workspaceId },
          create: {
            workspaceId: input.workspaceId,
            version: 1,
            status: 'COMPLETE',
            lastCompletedSectionId: 'catalog',
            fingerprint: businessFingerprint,
            metadata: { architectureVersion: 1 },
          },
          update: {
            version: { increment: 1 },
            status: 'COMPLETE',
            lastCompletedSectionId: 'catalog',
            fingerprint: businessFingerprint,
          },
          select: { id: true },
        });
        const existingSection = await transaction.merchantPreferenceSection
          .findUnique({
            where: {
              workspaceId_sectionId: {
                workspaceId: input.workspaceId,
                sectionId: 'catalog',
              },
            },
            select: { id: true, version: true, status: true },
          });
        const source = catalogPreferenceSource(
          input.profile.setupMode,
          Boolean(existing),
        );
        if (existingSection) {
          await transaction.merchantPreferenceSection.update({
            where: { id: existingSection.id },
            data: {
              businessProfileId: businessProfile.id,
              schemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
              version: profile.version,
              status: 'COMPLETE',
              validationStatus: 'VALID',
              source,
              payload,
              fingerprint: sectionFingerprint,
              metadata: {
                legacyProfileId: profile.id,
                compatibilityAdapter: 'MerchantCatalogProfile',
              },
              completedAt: now,
            },
          });
        } else {
          await transaction.merchantPreferenceSection.create({
            data: {
              businessProfileId: businessProfile.id,
              workspaceId: input.workspaceId,
              sectionId: 'catalog',
              schemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
              version: profile.version,
              status: 'COMPLETE',
              validationStatus: 'VALID',
              source,
              payload,
              fingerprint: sectionFingerprint,
              metadata: {
                legacyProfileId: profile.id,
                compatibilityAdapter: 'MerchantCatalogProfile',
              },
              completedAt: now,
            },
          });
        }
        const audit = preferenceSectionAuditEvent({
          sectionId: 'catalog',
          source,
          previousVersion: existingSection?.version ?? null,
          previousStatus: existingSection?.status ?? null,
          newVersion: profile.version,
          status: 'COMPLETE',
          valueCounts: {
            collections: input.profile.collections.length,
            productTypes: input.profile.productTypes.length,
            vendors: input.profile.vendors.length,
          },
        });
        if (!existingBusinessProfile) {
          const profileAudit = merchantProfileCreatedAuditEvent();
          await transaction.auditLog.create({
            data: {
              organizationId: input.organizationId,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              action: profileAudit.action,
              entityType: 'MerchantBusinessProfile',
              entityId: businessProfile.id,
              metadata: profileAudit.metadata as Prisma.InputJsonObject,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            action: audit.action,
            entityType: 'MerchantBusinessProfile',
            entityId: businessProfile.id,
            metadata: {
              ...audit.metadata,
              legacyCatalogProfileId: profile.id,
            } as Prisma.InputJsonObject,
          },
        });
        return profile.id;
      }, {
        maxWait: 30_000,
        timeout: 15_000,
      });

      const profile = await prisma.merchantCatalogProfile.findUniqueOrThrow({
        where: { id: savedId },
        select: profileSelect,
      });
      return profile;
    } catch (error) {
      if (
        error instanceof MerchantPreferenceConcurrencyError
        || (
          error
          && typeof error === 'object'
          && 'code' in error
          && error.code === 'P2002'
        )
      ) {
        throw new MerchantCatalogProfileError(
          'PREFERENCE_CONCURRENCY_CONFLICT',
          409,
          'This Catalog Profile was updated elsewhere. Reload before saving again.',
        );
      }
      throw error;
    }
  },
};
