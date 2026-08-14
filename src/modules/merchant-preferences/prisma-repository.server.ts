import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { catalogProfileRecordToPreferenceSection } from './catalog-section';
import { MerchantPreferenceConcurrencyError } from './errors';
import {
  merchantProfileCreatedAuditEvent,
  preferenceSectionAuditEvent,
} from './audit';
import { stableMerchantPreferenceFingerprint } from './fingerprint';
import type { MerchantBusinessProfileRepository } from './repository';
import type { MerchantBusinessProfileRecord } from './types';

const businessProfileSelect = {
  id: true,
  workspaceId: true,
  version: true,
  status: true,
  lastCompletedSectionId: true,
  fingerprint: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  sections: {
    orderBy: { sectionId: 'asc' },
    select: {
      id: true,
      workspaceId: true,
      sectionId: true,
      schemaVersion: true,
      version: true,
      status: true,
      validationStatus: true,
      source: true,
      payload: true,
      fingerprint: true,
      metadata: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.MerchantBusinessProfileSelect;

async function legacyCatalogFallback(
  workspaceId: string,
): Promise<MerchantBusinessProfileRecord | null> {
  const legacy = await prisma.merchantCatalogProfile.findUnique({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      setupMode: true,
      version: true,
      completedAt: true,
      updatedAt: true,
      entries: {
        orderBy: [{ kind: 'asc' }, { position: 'asc' }],
        select: {
          kind: true,
          value: true,
          normalizedValue: true,
          position: true,
        },
      },
    },
  });
  if (!legacy) return null;
  const section = catalogProfileRecordToPreferenceSection(legacy);
  return {
    id: `legacy-business:${legacy.id}`,
    workspaceId,
    version: legacy.version,
    status: 'COMPLETE',
    lastCompletedSectionId: 'catalog',
    fingerprint: stableMerchantPreferenceFingerprint({
      workspaceId,
      section: section.fingerprint,
    }),
    metadata: {
      adaptedFrom: 'MerchantCatalogProfile',
      legacyProfileId: legacy.id,
    },
    createdAt: legacy.completedAt,
    updatedAt: legacy.updatedAt,
    sections: [section],
  };
}

export const prismaMerchantBusinessProfileRepository:
MerchantBusinessProfileRepository = {
  async findByWorkspaceId(workspaceId) {
    const profile = await prisma.merchantBusinessProfile.findUnique({
      where: { workspaceId },
      select: businessProfileSelect,
    });
    return profile ?? legacyCatalogFallback(workspaceId);
  },

  async saveSection(input) {
    return prisma.$transaction(async (transaction) => {
      const existingBusinessProfile = await transaction
        .merchantBusinessProfile.findUnique({
          where: { workspaceId: input.workspaceId },
          select: { id: true },
        });
      const existingSection = await transaction.merchantPreferenceSection
        .findUnique({
          where: {
            workspaceId_sectionId: {
              workspaceId: input.workspaceId,
              sectionId: input.sectionId,
            },
          },
          select: { id: true, version: true, status: true },
        });
      if (
        existingSection
        && existingSection.version !== input.expectedSectionVersion
      ) {
        throw new MerchantPreferenceConcurrencyError();
      }
      if (!existingSection && input.expectedSectionVersion !== null) {
        throw new MerchantPreferenceConcurrencyError();
      }

      const profileFingerprint = stableMerchantPreferenceFingerprint({
        workspaceId: input.workspaceId,
        sectionId: input.sectionId,
        sectionFingerprint: input.fingerprint,
        status: input.status,
      });
      const profile = await transaction.merchantBusinessProfile.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          version: 1,
          status: input.status === 'COMPLETE'
            ? 'COMPLETE'
            : input.status === 'NEEDS_REVIEW'
              ? 'NEEDS_REVIEW'
              : input.status === 'INVALID'
                ? 'INVALID'
                : 'INCOMPLETE',
          lastCompletedSectionId: input.status === 'COMPLETE'
            ? input.sectionId
            : null,
          fingerprint: profileFingerprint,
          metadata: { architectureVersion: 1 },
        },
        update: {
          version: { increment: 1 },
          status: input.status === 'COMPLETE'
            ? 'COMPLETE'
            : input.status === 'NEEDS_REVIEW'
              ? 'NEEDS_REVIEW'
              : input.status === 'INVALID'
                ? 'INVALID'
                : 'INCOMPLETE',
          ...(input.status === 'COMPLETE'
            ? { lastCompletedSectionId: input.sectionId }
            : {}),
          fingerprint: profileFingerprint,
        },
        select: { id: true },
      });

      let newSectionVersion: number;
      if (existingSection) {
        const updated = await transaction.merchantPreferenceSection.updateMany({
          where: {
            id: existingSection.id,
            workspaceId: input.workspaceId,
            version: input.expectedSectionVersion!,
          },
          data: {
            schemaVersion: input.schemaVersion,
            version: { increment: 1 },
            status: input.status,
            validationStatus: input.validationStatus,
            source: input.source,
            payload: input.payload as Prisma.InputJsonValue,
            fingerprint: input.fingerprint,
            metadata: input.metadata as Prisma.InputJsonObject,
            completedAt: input.completedAt,
          },
        });
        if (updated.count !== 1) {
          throw new MerchantPreferenceConcurrencyError();
        }
        newSectionVersion = existingSection.version + 1;
      } else {
        const section = await transaction.merchantPreferenceSection.create({
          data: {
            businessProfileId: profile.id,
            workspaceId: input.workspaceId,
            sectionId: input.sectionId,
            schemaVersion: input.schemaVersion,
            status: input.status,
            validationStatus: input.validationStatus,
            source: input.source,
            payload: input.payload as Prisma.InputJsonValue,
            fingerprint: input.fingerprint,
            metadata: input.metadata as Prisma.InputJsonObject,
            completedAt: input.completedAt,
          },
          select: { version: true },
        });
        newSectionVersion = section.version;
      }

      const audit = preferenceSectionAuditEvent({
        sectionId: input.sectionId,
        source: input.source,
        previousVersion: existingSection?.version ?? null,
        previousStatus: existingSection?.status ?? null,
        newVersion: newSectionVersion,
        status: input.status,
        changedFields: input.auditChangedFields,
        listingEvent: input.auditEvent,
        seoEvent: input.seoAuditEvent,
        publishingEvent: input.publishingAuditEvent,
        publishingMetadata: input.publishingAuditMetadata,
        aiEvent: input.aiAuditEvent,
        aiMetadata: input.aiAuditMetadata,
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
            entityId: profile.id,
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
          entityId: profile.id,
          metadata: audit.metadata as Prisma.InputJsonObject,
        },
      });
      return transaction.merchantBusinessProfile.findUniqueOrThrow({
        where: { id: profile.id },
        select: businessProfileSelect,
      });
    }, {
      maxWait: 30_000,
      timeout: 15_000,
    });
  },
};
