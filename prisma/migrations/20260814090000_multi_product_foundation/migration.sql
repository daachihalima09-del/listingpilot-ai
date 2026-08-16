-- Sprint 10 phase A: introduce durable product ownership without removing the
-- legacy project columns. Existing project UUIDs are reused for their first
-- product so old bookmarks and dependent records retain a stable identity.
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "status_before_archive" "ProjectStatus",
    "source_type" "ProjectSourceType",
    "source_url" TEXT,
    "raw_input" TEXT,
    "analysis_data" JSONB,
    "generated_listing" JSONB,
    "seo_data" JSONB,
    "readiness_data" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_id_workspace_id_key" ON "products"("id", "workspace_id");
CREATE UNIQUE INDEX "products_id_project_id_workspace_id_key" ON "products"("id", "project_id", "workspace_id");
CREATE INDEX "products_project_id_workspace_id_updated_at_idx" ON "products"("project_id", "workspace_id", "updated_at");
CREATE INDEX "products_project_id_workspace_id_status_idx" ON "products"("project_id", "workspace_id", "status");
CREATE INDEX "products_workspace_id_updated_at_idx" ON "products"("workspace_id", "updated_at");
CREATE INDEX "products_archived_at_idx" ON "products"("archived_at");

ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_workspace_id_fkey"
    FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "products" (
    "id", "workspace_id", "project_id", "name", "status", "status_before_archive",
    "source_type", "source_url", "raw_input", "analysis_data", "generated_listing",
    "seo_data", "readiness_data", "version", "archived_at", "created_at", "updated_at"
)
SELECT
    "id", "workspace_id", "id", "name", "status", "status_before_archive",
    "source_type", "source_url", "raw_input", "analysis_data", "generated_listing",
    "seo_data", "readiness_data", "version", "archived_at", "created_at", "updated_at"
FROM "projects";

ALTER TABLE "shopify_variant_configurations" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_product_publications" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_metafield_configurations" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_product_import_links" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_change_reviews" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_publishing_plans" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_image_configurations" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_image_upload_sessions" ADD COLUMN "product_id" UUID;
ALTER TABLE "shopify_publication_executions" ADD COLUMN "product_id" UUID;

UPDATE "shopify_variant_configurations" SET "product_id" = "project_id";
UPDATE "shopify_product_publications" SET "product_id" = "project_id";
UPDATE "shopify_metafield_configurations" SET "product_id" = "project_id";
UPDATE "shopify_product_import_links" SET "product_id" = "project_id";
UPDATE "shopify_change_reviews" SET "product_id" = "project_id";
UPDATE "shopify_publishing_plans" SET "product_id" = "project_id";
UPDATE "shopify_image_configurations" SET "product_id" = "project_id";
UPDATE "shopify_image_upload_sessions" SET "product_id" = "project_id";
UPDATE "shopify_publication_executions" SET "product_id" = "project_id";

CREATE UNIQUE INDEX "shopify_variant_configurations_product_id_workspace_id_key" ON "shopify_variant_configurations"("product_id", "workspace_id");
CREATE UNIQUE INDEX "shopify_product_publications_product_id_workspace_id_key" ON "shopify_product_publications"("product_id", "workspace_id");
CREATE UNIQUE INDEX "shopify_metafield_configurations_product_id_workspace_id_key" ON "shopify_metafield_configurations"("product_id", "workspace_id");
CREATE UNIQUE INDEX "shopify_product_import_links_product_id_workspace_id_key" ON "shopify_product_import_links"("product_id", "workspace_id");
CREATE INDEX "shopify_change_reviews_product_id_workspace_id_generated_at_idx" ON "shopify_change_reviews"("product_id", "workspace_id", "generated_at");
CREATE INDEX "shopify_publishing_plans_product_id_workspace_id_created_at_idx" ON "shopify_publishing_plans"("product_id", "workspace_id", "created_at");
CREATE UNIQUE INDEX "shopify_image_configurations_product_id_workspace_id_key" ON "shopify_image_configurations"("product_id", "workspace_id");
CREATE INDEX "shopify_image_upload_sessions_product_id_workspace_id_user_id_idx" ON "shopify_image_upload_sessions"("product_id", "workspace_id", "user_id");
CREATE INDEX "shopify_publication_executions_product_id_workspace_id_created_at_idx" ON "shopify_publication_executions"("product_id", "workspace_id", "created_at");
DROP INDEX "shopify_publication_executions_project_id_execution_number_key";
CREATE UNIQUE INDEX "shopify_publication_executions_product_id_execution_number_key" ON "shopify_publication_executions"("product_id", "execution_number");

ALTER TABLE "shopify_variant_configurations" ADD CONSTRAINT "shopify_variant_configurations_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_product_publications" ADD CONSTRAINT "shopify_product_publications_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_metafield_configurations" ADD CONSTRAINT "shopify_metafield_configurations_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_product_import_links" ADD CONSTRAINT "shopify_product_import_links_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_change_reviews" ADD CONSTRAINT "shopify_change_reviews_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publishing_plans" ADD CONSTRAINT "shopify_publishing_plans_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_image_configurations" ADD CONSTRAINT "shopify_image_configurations_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_image_upload_sessions" ADD CONSTRAINT "shopify_image_upload_sessions_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publication_executions" ADD CONSTRAINT "shopify_publication_executions_product_id_workspace_id_fkey" FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
