-- AlterEnum
ALTER TYPE "ProjectSourceType" ADD VALUE 'SHOPIFY_IMPORT';

-- CreateEnum
CREATE TYPE "ShopifyImportLinkStatus" AS ENUM ('LINKED', 'INCONSISTENT');

-- CreateTable
CREATE TABLE "shopify_product_import_links" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shopify_store_id" UUID NOT NULL,
    "shopify_product_gid" VARCHAR(255) NOT NULL,
    "shopify_product_legacy_id" VARCHAR(20) NOT NULL,
    "product_handle" VARCHAR(255),
    "status" "ShopifyImportLinkStatus" NOT NULL DEFAULT 'LINKED',
    "source_snapshot" JSONB NOT NULL,
    "shopify_updated_at_at_import" TIMESTAMP(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_source_read_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_product_import_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_product_import_links_project_id_key"
ON "shopify_product_import_links"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_product_import_links_project_id_workspace_id_key"
ON "shopify_product_import_links"("project_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_product_import_links_workspace_id_shopify_store_id_shopify_product_gid_key"
ON "shopify_product_import_links"("workspace_id", "shopify_store_id", "shopify_product_gid");

-- CreateIndex
CREATE INDEX "shopify_product_import_links_workspace_id_shopify_product_gid_idx"
ON "shopify_product_import_links"("workspace_id", "shopify_product_gid");

-- CreateIndex
CREATE INDEX "shopify_product_import_links_shopify_store_id_shopify_product_gid_idx"
ON "shopify_product_import_links"("shopify_store_id", "shopify_product_gid");

-- CreateIndex
CREATE INDEX "shopify_product_import_links_workspace_id_status_idx"
ON "shopify_product_import_links"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "shopify_product_import_links"
ADD CONSTRAINT "shopify_product_import_links_project_id_workspace_id_fkey"
FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_product_import_links"
ADD CONSTRAINT "shopify_product_import_links_shopify_store_id_workspace_id_fkey"
FOREIGN KEY ("shopify_store_id", "workspace_id") REFERENCES "shopify_stores"("id", "workspace_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
