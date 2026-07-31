-- CreateEnum
CREATE TYPE "MerchantCatalogSetupMode" AS ENUM ('SHOPIFY_IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "MerchantCatalogEntryKind" AS ENUM ('COLLECTION', 'PRODUCT_TYPE', 'VENDOR');

-- CreateTable
CREATE TABLE "merchant_catalog_profiles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "setup_mode" "MerchantCatalogSetupMode" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_catalog_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_catalog_entries" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "kind" "MerchantCatalogEntryKind" NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "normalized_value" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_catalog_profiles_workspace_id_key"
ON "merchant_catalog_profiles"("workspace_id");

-- CreateIndex
CREATE INDEX "merchant_catalog_profiles_completed_at_idx"
ON "merchant_catalog_profiles"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_catalog_entries_profile_id_kind_normalized_value_key"
ON "merchant_catalog_entries"("profile_id", "kind", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_catalog_entries_profile_id_kind_position_key"
ON "merchant_catalog_entries"("profile_id", "kind", "position");

-- CreateIndex
CREATE INDEX "merchant_catalog_entries_profile_id_kind_idx"
ON "merchant_catalog_entries"("profile_id", "kind");

-- AddForeignKey
ALTER TABLE "merchant_catalog_profiles"
ADD CONSTRAINT "merchant_catalog_profiles_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_catalog_entries"
ADD CONSTRAINT "merchant_catalog_entries_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "merchant_catalog_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
