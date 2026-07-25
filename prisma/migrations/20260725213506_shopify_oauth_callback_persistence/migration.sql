-- AlterEnum
ALTER TYPE "ShopifyStoreStatus" ADD VALUE 'CONNECTED';

-- AlterTable
ALTER TABLE "shopify_stores"
ADD COLUMN "shop_name" VARCHAR(255),
ADD COLUMN "requested_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "last_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "shopify_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shop_domain" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopify_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_stores_workspace_id_key" ON "shopify_stores"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_oauth_states_state_hash_key" ON "shopify_oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "shopify_oauth_states_user_id_workspace_id_idx" ON "shopify_oauth_states"("user_id", "workspace_id");

-- CreateIndex
CREATE INDEX "shopify_oauth_states_expires_at_idx" ON "shopify_oauth_states"("expires_at");

-- AddForeignKey
ALTER TABLE "shopify_oauth_states" ADD CONSTRAINT "shopify_oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_oauth_states" ADD CONSTRAINT "shopify_oauth_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
