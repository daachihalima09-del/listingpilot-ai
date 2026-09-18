-- Additive operation ledger for durable, workspace-scoped AI cost protection.
CREATE TYPE "AiUsageOperationType" AS ENUM (
  'PRODUCT_ANALYSIS',
  'LISTING_GENERATION',
  'SECTION_REGENERATION'
);

CREATE TYPE "AiUsageOperationStatus" AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "ai_usage_operations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "project_id" UUID,
  "product_id" UUID,
  "operation_type" "AiUsageOperationType" NOT NULL,
  "request_key" CHAR(64) NOT NULL,
  "active_key" CHAR(64),
  "status" "AiUsageOperationStatus" NOT NULL DEFAULT 'RUNNING',
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "provider_started_at" TIMESTAMP(3),
  "provider_request_id" VARCHAR(255),
  "error_code" VARCHAR(100),
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_usage_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_rate_limit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID,
  "subject_hash" CHAR(64) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_usage_operations_active_key_key"
  ON "ai_usage_operations"("active_key");
CREATE UNIQUE INDEX "ai_usage_operations_workspace_id_request_key_key"
  ON "ai_usage_operations"("workspace_id", "request_key");
CREATE INDEX "ai_usage_operations_workspace_id_created_at_idx"
  ON "ai_usage_operations"("workspace_id", "created_at");
CREATE INDEX "ai_usage_operations_workspace_id_status_lease_expires_at_idx"
  ON "ai_usage_operations"("workspace_id", "status", "lease_expires_at");
CREATE INDEX "ai_usage_operations_product_id_workspace_id_created_at_idx"
  ON "ai_usage_operations"("product_id", "workspace_id", "created_at");
CREATE INDEX "ai_usage_operations_operation_type_created_at_idx"
  ON "ai_usage_operations"("operation_type", "created_at");
CREATE INDEX "ai_rate_limit_events_action_subject_hash_created_at_idx"
  ON "ai_rate_limit_events"("action", "subject_hash", "created_at");
CREATE INDEX "ai_rate_limit_events_workspace_id_action_created_at_idx"
  ON "ai_rate_limit_events"("workspace_id", "action", "created_at");

ALTER TABLE "ai_usage_operations"
  ADD CONSTRAINT "ai_usage_operations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_operations"
  ADD CONSTRAINT "ai_usage_operations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_usage_operations"
  ADD CONSTRAINT "ai_usage_operations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_usage_operations"
  ADD CONSTRAINT "ai_usage_operations_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_rate_limit_events"
  ADD CONSTRAINT "ai_rate_limit_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
