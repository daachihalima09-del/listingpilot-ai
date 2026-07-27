-- CreateEnum
CREATE TYPE "ShopifyLaunchIntentStatus" AS ENUM (
    'PENDING',
    'WORKSPACE_SELECTED',
    'OAUTH_STARTED',
    'COMPLETED',
    'EXPIRED'
);

-- CreateEnum
CREATE TYPE "ShopifyLaunchOrigin" AS ENUM (
    'DISTRIBUTION_INSTALL',
    'SHOPIFY_LAUNCH'
);

-- CreateTable
CREATE TABLE "shopify_launch_intents" (
    "id" UUID NOT NULL,
    "nonce_hash" CHAR(64) NOT NULL,
    "shop_domain" VARCHAR(255) NOT NULL,
    "origin" "ShopifyLaunchOrigin" NOT NULL,
    "status" "ShopifyLaunchIntentStatus" NOT NULL DEFAULT 'PENDING',
    "requested_workspace_id" UUID,
    "selected_by_user_id" UUID,
    "safe_return_path" VARCHAR(2048),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_launch_intents_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "shopify_oauth_states"
ADD COLUMN "launch_intent_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "shopify_launch_intents_nonce_hash_key"
ON "shopify_launch_intents"("nonce_hash");

-- CreateIndex
CREATE INDEX "shopify_launch_intents_shop_domain_status_idx"
ON "shopify_launch_intents"("shop_domain", "status");

-- CreateIndex
CREATE INDEX "shopify_launch_intents_expires_at_status_idx"
ON "shopify_launch_intents"("expires_at", "status");

-- CreateIndex
CREATE INDEX "shopify_launch_intents_requested_workspace_id_idx"
ON "shopify_launch_intents"("requested_workspace_id");

-- CreateIndex
CREATE INDEX "shopify_launch_intents_selected_by_user_id_idx"
ON "shopify_launch_intents"("selected_by_user_id");

-- CreateIndex
CREATE INDEX "shopify_oauth_states_launch_intent_id_idx"
ON "shopify_oauth_states"("launch_intent_id");

-- AddForeignKey
ALTER TABLE "shopify_launch_intents"
ADD CONSTRAINT "shopify_launch_intents_requested_workspace_id_fkey"
FOREIGN KEY ("requested_workspace_id") REFERENCES "workspaces"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_launch_intents"
ADD CONSTRAINT "shopify_launch_intents_selected_by_user_id_fkey"
FOREIGN KEY ("selected_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_oauth_states"
ADD CONSTRAINT "shopify_oauth_states_launch_intent_id_fkey"
FOREIGN KEY ("launch_intent_id") REFERENCES "shopify_launch_intents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
