-- CreateEnum
CREATE TYPE "ShopifyChangeReviewStatus" AS ENUM ('OPEN', 'STALE', 'PUBLISHED');

-- CreateTable
CREATE TABLE "shopify_change_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shopify_store_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "shopify_product_gid" VARCHAR(255) NOT NULL,
    "status" "ShopifyChangeReviewStatus" NOT NULL DEFAULT 'OPEN',
    "comparison_json" JSONB NOT NULL,
    "decisions_json" JSONB NOT NULL DEFAULT '{}',
    "baseline_updated_at" TIMESTAMP(3) NOT NULL,
    "remote_updated_at" TIMESTAMP(3) NOT NULL,
    "remote_fingerprint" CHAR(64) NOT NULL,
    "project_version" INTEGER NOT NULL,
    "baseline_snapshot_hash" CHAR(64) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_change_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_change_reviews_id_workspace_id_key"
ON "shopify_change_reviews"("id", "workspace_id");
CREATE INDEX "shopify_change_reviews_project_id_workspace_id_generated_at_idx"
ON "shopify_change_reviews"("project_id", "workspace_id", "generated_at");
CREATE INDEX "shopify_change_reviews_workspace_id_status_generated_at_idx"
ON "shopify_change_reviews"("workspace_id", "status", "generated_at");
CREATE INDEX "shopify_change_reviews_shopify_store_id_shopify_product_gid_idx"
ON "shopify_change_reviews"("shopify_store_id", "shopify_product_gid");
CREATE INDEX "shopify_change_reviews_status_expires_at_idx"
ON "shopify_change_reviews"("status", "expires_at");
CREATE INDEX "shopify_change_reviews_id_version_idx"
ON "shopify_change_reviews"("id", "version");

ALTER TABLE "shopify_change_reviews"
ADD CONSTRAINT "shopify_change_reviews_project_id_workspace_id_fkey"
FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_change_reviews"
ADD CONSTRAINT "shopify_change_reviews_shopify_store_id_workspace_id_fkey"
FOREIGN KEY ("shopify_store_id", "workspace_id") REFERENCES "shopify_stores"("id", "workspace_id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_change_reviews"
ADD CONSTRAINT "shopify_change_reviews_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
