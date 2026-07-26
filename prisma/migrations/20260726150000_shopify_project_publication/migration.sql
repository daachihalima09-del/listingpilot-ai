-- CreateEnum
CREATE TYPE "ShopifyProductPublicationStatus" AS ENUM ('ACTIVE', 'DRAFT');

-- CreateTable
CREATE TABLE "shopify_product_publications" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shopify_product_id" VARCHAR(20) NOT NULL,
    "shopify_handle" VARCHAR(255),
    "shopify_title" VARCHAR(255) NOT NULL,
    "last_status" "ShopifyProductPublicationStatus" NOT NULL,
    "first_published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_product_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_workspace_id_key" ON "projects"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_product_publications_project_id_workspace_id_key" ON "shopify_product_publications"("project_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_product_publications_workspace_id_shopify_product_id_key" ON "shopify_product_publications"("workspace_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "shopify_product_publications_workspace_id_last_published_at_idx" ON "shopify_product_publications"("workspace_id", "last_published_at");

-- AddForeignKey
ALTER TABLE "shopify_product_publications" ADD CONSTRAINT "shopify_product_publications_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
