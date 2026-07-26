-- CreateEnum
CREATE TYPE "ShopifyPublicationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'UNCHANGED', 'PARTIAL', 'PENDING', 'FAILED', 'CANCELLED');
CREATE TYPE "ShopifyPublicationTriggerType" AS ENUM ('MANUAL_FULL', 'MANUAL_RETRY', 'REFRESH_PENDING');
CREATE TYPE "ShopifyPublicationStep" AS ENUM ('PRODUCT', 'VARIANTS', 'METAFIELDS', 'IMAGES');
CREATE TYPE "ShopifyPublicationStepStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'SUCCEEDED', 'UNCHANGED', 'SKIPPED', 'PENDING', 'PARTIAL', 'FAILED', 'BLOCKED');
CREATE UNIQUE INDEX "shopify_stores_id_workspace_id_key" ON "shopify_stores"("id", "workspace_id");
CREATE TABLE "shopify_publication_executions" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "workspace_id" UUID NOT NULL,
  "shopify_store_id" UUID NOT NULL, "requested_by_user_id" UUID NOT NULL,
  "status" "ShopifyPublicationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "trigger_type" "ShopifyPublicationTriggerType" NOT NULL, "execution_number" INTEGER NOT NULL,
  "active_lease_project_id" UUID, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3), "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopify_publication_executions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "shopify_publication_step_executions" (
  "id" UUID NOT NULL, "execution_id" UUID NOT NULL, "step" "ShopifyPublicationStep" NOT NULL,
  "status" "ShopifyPublicationStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "attempt_number" INTEGER NOT NULL DEFAULT 0, "started_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "retryable" BOOLEAN NOT NULL DEFAULT false, "blocking" BOOLEAN NOT NULL DEFAULT false,
  "safe_error_category" VARCHAR(100), "safe_message" VARCHAR(500), "result_summary" JSONB,
  "freshness_key" VARCHAR(200), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopify_publication_step_executions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shopify_publication_executions_active_lease_project_id_key" ON "shopify_publication_executions"("active_lease_project_id");
CREATE UNIQUE INDEX "shopify_publication_executions_project_id_execution_number_key" ON "shopify_publication_executions"("project_id", "execution_number");
CREATE INDEX "shopify_publication_executions_project_id_created_at_idx" ON "shopify_publication_executions"("project_id", "created_at");
CREATE INDEX "shopify_publication_executions_workspace_id_status_idx" ON "shopify_publication_executions"("workspace_id", "status");
CREATE INDEX "shopify_publication_executions_shopify_store_id_idx" ON "shopify_publication_executions"("shopify_store_id");
CREATE UNIQUE INDEX "shopify_publication_step_executions_execution_id_step_key" ON "shopify_publication_step_executions"("execution_id", "step");
CREATE INDEX "shopify_publication_step_executions_execution_id_status_idx" ON "shopify_publication_step_executions"("execution_id", "status");
ALTER TABLE "shopify_publication_executions" ADD CONSTRAINT "shopify_publication_executions_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publication_executions" ADD CONSTRAINT "shopify_publication_executions_shopify_store_id_workspace_id_fkey" FOREIGN KEY ("shopify_store_id", "workspace_id") REFERENCES "shopify_stores"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_publication_executions" ADD CONSTRAINT "shopify_publication_executions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shopify_publication_step_executions" ADD CONSTRAINT "shopify_publication_step_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "shopify_publication_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
