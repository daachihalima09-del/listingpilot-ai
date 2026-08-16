CREATE TYPE "ShopifyBulkPublishingBatchStatus" AS ENUM (
  'PREPARING', 'READY', 'EXECUTING', 'PARTIAL_SUCCESS', 'COMPLETED', 'FAILED'
);

CREATE TYPE "ShopifyBulkPublishingItemStatus" AS ENUM (
  'PREPARING', 'READY', 'BLOCKED', 'EXECUTING', 'COMPLETED', 'FAILED', 'STALE', 'PARTIAL'
);

CREATE TABLE "shopify_bulk_publishing_batches" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "status" "ShopifyBulkPublishingBatchStatus" NOT NULL DEFAULT 'PREPARING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "shopify_bulk_publishing_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shopify_bulk_publishing_items" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "publishing_plan_id" UUID,
  "status" "ShopifyBulkPublishingItemStatus" NOT NULL DEFAULT 'PREPARING',
  "intent" "ShopifyPublishingPlanMode" NOT NULL,
  "blockers" JSONB NOT NULL DEFAULT '[]',
  "result" JSONB,
  "safe_message" VARCHAR(500),
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopify_bulk_publishing_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_bulk_publishing_batches_id_workspace_id_key"
  ON "shopify_bulk_publishing_batches"("id", "workspace_id");
CREATE INDEX "shopify_bulk_publishing_batches_project_id_workspace_id_created_at_idx"
  ON "shopify_bulk_publishing_batches"("project_id", "workspace_id", "created_at");
CREATE INDEX "shopify_bulk_publishing_batches_workspace_id_status_created_at_idx"
  ON "shopify_bulk_publishing_batches"("workspace_id", "status", "created_at");
CREATE UNIQUE INDEX "shopify_bulk_publishing_items_publishing_plan_id_key"
  ON "shopify_bulk_publishing_items"("publishing_plan_id");
CREATE UNIQUE INDEX "shopify_bulk_publishing_items_batch_id_product_id_key"
  ON "shopify_bulk_publishing_items"("batch_id", "product_id");
CREATE INDEX "shopify_bulk_publishing_items_batch_id_status_idx"
  ON "shopify_bulk_publishing_items"("batch_id", "status");
CREATE INDEX "shopify_bulk_publishing_items_product_id_workspace_id_created_at_idx"
  ON "shopify_bulk_publishing_items"("product_id", "workspace_id", "created_at");

ALTER TABLE "shopify_bulk_publishing_batches"
  ADD CONSTRAINT "shopify_bulk_publishing_batches_project_id_workspace_id_fkey"
  FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_bulk_publishing_batches"
  ADD CONSTRAINT "shopify_bulk_publishing_batches_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_bulk_publishing_batches"
  ADD CONSTRAINT "shopify_bulk_publishing_batches_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shopify_bulk_publishing_items"
  ADD CONSTRAINT "shopify_bulk_publishing_items_batch_id_workspace_id_fkey"
  FOREIGN KEY ("batch_id", "workspace_id") REFERENCES "shopify_bulk_publishing_batches"("id", "workspace_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_bulk_publishing_items"
  ADD CONSTRAINT "shopify_bulk_publishing_items_product_id_workspace_id_fkey"
  FOREIGN KEY ("product_id", "workspace_id") REFERENCES "products"("id", "workspace_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_bulk_publishing_items"
  ADD CONSTRAINT "shopify_bulk_publishing_items_publishing_plan_id_fkey"
  FOREIGN KEY ("publishing_plan_id") REFERENCES "shopify_publishing_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
