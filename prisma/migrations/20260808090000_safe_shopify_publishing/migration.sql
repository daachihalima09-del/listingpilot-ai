CREATE TYPE "ShopifyPublishingPlanMode" AS ENUM ('UPDATE_EXISTING', 'CREATE_NEW', 'BLOCKED');
CREATE TYPE "ShopifyPublishingPlanStatus" AS ENUM ('OPEN', 'STALE', 'EXECUTING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "shopify_publishing_plans" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "shopify_store_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "mode" "ShopifyPublishingPlanMode" NOT NULL,
  "status" "ShopifyPublishingPlanStatus" NOT NULL DEFAULT 'OPEN',
  "shopify_product_gid" VARCHAR(255),
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "plan_version" INTEGER NOT NULL DEFAULT 1,
  "project_version" INTEGER NOT NULL,
  "draft_fingerprint" CHAR(64) NOT NULL,
  "remote_fingerprint" CHAR(64),
  "remote_updated_at" TIMESTAMP(3),
  "plan_fingerprint" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "review_selection" JSONB NOT NULL DEFAULT '{}',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "execution_key" VARCHAR(100),
  "executed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopify_publishing_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_publishing_plans_execution_key_key" ON "shopify_publishing_plans"("execution_key");
CREATE UNIQUE INDEX "shopify_publishing_plans_id_workspace_id_key" ON "shopify_publishing_plans"("id", "workspace_id");
CREATE INDEX "shopify_publishing_plans_project_id_workspace_id_created_at_idx" ON "shopify_publishing_plans"("project_id", "workspace_id", "created_at");
CREATE INDEX "shopify_publishing_plans_workspace_id_status_created_at_idx" ON "shopify_publishing_plans"("workspace_id", "status", "created_at");
CREATE INDEX "shopify_publishing_plans_shopify_store_id_shopify_product_gid_idx" ON "shopify_publishing_plans"("shopify_store_id", "shopify_product_gid");
CREATE INDEX "shopify_publishing_plans_status_expires_at_idx" ON "shopify_publishing_plans"("status", "expires_at");

ALTER TABLE "shopify_publishing_plans" ADD CONSTRAINT "shopify_publishing_plans_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publishing_plans" ADD CONSTRAINT "shopify_publishing_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publishing_plans" ADD CONSTRAINT "shopify_publishing_plans_shopify_store_id_workspace_id_fkey" FOREIGN KEY ("shopify_store_id", "workspace_id") REFERENCES "shopify_stores"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publishing_plans" ADD CONSTRAINT "shopify_publishing_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
