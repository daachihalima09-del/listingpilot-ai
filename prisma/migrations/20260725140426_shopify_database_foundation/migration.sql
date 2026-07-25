-- CreateEnum
CREATE TYPE "ShopifyStoreStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISCONNECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "shopify_stores" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shop_domain" VARCHAR(255) NOT NULL,
    "access_token_encrypted" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ShopifyStoreStatus" NOT NULL DEFAULT 'PENDING',
    "installed_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_stores_shop_domain_key" ON "shopify_stores"("shop_domain");

-- CreateIndex
CREATE INDEX "shopify_stores_workspace_id_idx" ON "shopify_stores"("workspace_id");

-- CreateIndex
CREATE INDEX "shopify_stores_workspace_id_status_idx" ON "shopify_stores"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "shopify_stores_status_idx" ON "shopify_stores"("status");

-- AddForeignKey
ALTER TABLE "shopify_stores" ADD CONSTRAINT "shopify_stores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
