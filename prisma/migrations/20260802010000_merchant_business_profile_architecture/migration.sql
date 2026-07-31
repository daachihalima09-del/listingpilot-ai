-- CreateEnum
CREATE TYPE "MerchantBusinessProfileStatus" AS ENUM (
    'INCOMPLETE',
    'COMPLETE',
    'NEEDS_REVIEW',
    'INVALID'
);

-- CreateEnum
CREATE TYPE "MerchantPreferenceSectionStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETE',
    'NEEDS_REVIEW',
    'INVALID'
);

-- CreateEnum
CREATE TYPE "MerchantPreferenceValidationStatus" AS ENUM (
    'NOT_VALIDATED',
    'VALID',
    'INVALID'
);

-- CreateEnum
CREATE TYPE "MerchantPreferenceSource" AS ENUM (
    'SHOPIFY_IMPORT',
    'MANUAL',
    'MERCHANT_EDIT',
    'PLATFORM_DEFAULT'
);

-- CreateTable
CREATE TABLE "merchant_business_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MerchantBusinessProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "last_completed_section_id" VARCHAR(50),
    "fingerprint" CHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_preference_sections" (
    "id" UUID NOT NULL,
    "business_profile_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "section_id" VARCHAR(50) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "MerchantPreferenceSectionStatus" NOT NULL,
    "validation_status" "MerchantPreferenceValidationStatus" NOT NULL,
    "source" "MerchantPreferenceSource" NOT NULL,
    "payload" JSONB NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_preference_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_business_profiles_workspace_id_key"
ON "merchant_business_profiles"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_business_profiles_id_workspace_id_key"
ON "merchant_business_profiles"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "merchant_business_profiles_status_idx"
ON "merchant_business_profiles"("status");

-- CreateIndex
CREATE INDEX "merchant_business_profiles_updated_at_idx"
ON "merchant_business_profiles"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_preference_sections_workspace_id_section_id_key"
ON "merchant_preference_sections"("workspace_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_preference_sections_business_profile_id_section_id_key"
ON "merchant_preference_sections"("business_profile_id", "section_id");

-- CreateIndex
CREATE INDEX "merchant_preference_sections_business_profile_id_status_idx"
ON "merchant_preference_sections"("business_profile_id", "status");

-- CreateIndex
CREATE INDEX "merchant_preference_sections_workspace_id_status_idx"
ON "merchant_preference_sections"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "merchant_preference_sections_section_id_schema_version_idx"
ON "merchant_preference_sections"("section_id", "schema_version");

-- AddForeignKey
ALTER TABLE "merchant_business_profiles"
ADD CONSTRAINT "merchant_business_profiles_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_preference_sections"
ADD CONSTRAINT "merchant_preference_sections_business_profile_id_workspace_id_fkey"
FOREIGN KEY ("business_profile_id", "workspace_id")
REFERENCES "merchant_business_profiles"("id", "workspace_id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing completed Catalog Profiles into the reusable architecture.
WITH catalog_payloads AS (
    SELECT
        catalog.id AS legacy_profile_id,
        catalog.workspace_id,
        catalog.version,
        catalog.setup_mode,
        catalog.completed_at,
        catalog.created_at,
        catalog.updated_at,
        jsonb_build_object(
            'setupMode', catalog.setup_mode::text,
            'collections', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'COLLECTION'
            ), '[]'::jsonb),
            'productTypes', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'PRODUCT_TYPE'
            ), '[]'::jsonb),
            'vendors', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'VENDOR'
            ), '[]'::jsonb)
        ) AS payload
    FROM merchant_catalog_profiles catalog
)
INSERT INTO merchant_business_profiles (
    id,
    workspace_id,
    version,
    status,
    last_completed_section_id,
    fingerprint,
    metadata,
    created_at,
    updated_at
)
SELECT
    md5(workspace_id::text || ':merchant-business-profile')::uuid,
    workspace_id,
    GREATEST(version, 1),
    'COMPLETE'::"MerchantBusinessProfileStatus",
    'catalog',
    md5(payload::text) || md5('merchant-profile:' || payload::text),
    jsonb_build_object(
        'origin', 'catalog-profile-backfill',
        'legacyProfileId', legacy_profile_id
    ),
    created_at,
    updated_at
FROM catalog_payloads
ON CONFLICT (workspace_id) DO NOTHING;

WITH catalog_payloads AS (
    SELECT
        catalog.id AS legacy_profile_id,
        catalog.workspace_id,
        catalog.version,
        catalog.setup_mode,
        catalog.completed_at,
        catalog.created_at,
        catalog.updated_at,
        jsonb_build_object(
            'setupMode', catalog.setup_mode::text,
            'collections', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'COLLECTION'
            ), '[]'::jsonb),
            'productTypes', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'PRODUCT_TYPE'
            ), '[]'::jsonb),
            'vendors', COALESCE((
                SELECT jsonb_agg(entry.value ORDER BY entry.position)
                FROM merchant_catalog_entries entry
                WHERE entry.profile_id = catalog.id
                  AND entry.kind = 'VENDOR'
            ), '[]'::jsonb)
        ) AS payload
    FROM merchant_catalog_profiles catalog
)
INSERT INTO merchant_preference_sections (
    id,
    business_profile_id,
    workspace_id,
    section_id,
    schema_version,
    version,
    status,
    validation_status,
    source,
    payload,
    fingerprint,
    metadata,
    completed_at,
    created_at,
    updated_at
)
SELECT
    md5(workspace_id::text || ':merchant-preference:catalog')::uuid,
    md5(workspace_id::text || ':merchant-business-profile')::uuid,
    workspace_id,
    'catalog',
    1,
    GREATEST(version, 1),
    'COMPLETE'::"MerchantPreferenceSectionStatus",
    'VALID'::"MerchantPreferenceValidationStatus",
    CASE setup_mode
        WHEN 'SHOPIFY_IMPORT' THEN 'SHOPIFY_IMPORT'::"MerchantPreferenceSource"
        ELSE 'MANUAL'::"MerchantPreferenceSource"
    END,
    payload,
    md5(payload::text) || md5('catalog:' || payload::text),
    jsonb_build_object(
        'migratedFrom', 'MerchantCatalogProfile',
        'legacyProfileId', legacy_profile_id
    ),
    completed_at,
    created_at,
    updated_at
FROM catalog_payloads
ON CONFLICT (workspace_id, section_id) DO NOTHING;
