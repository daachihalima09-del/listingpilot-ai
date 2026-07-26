-- CreateEnum
CREATE TYPE "ShopifyImageSourceType" AS ENUM ('REMOTE_URL', 'LOCAL_UPLOAD');
CREATE TYPE "ShopifyImageStatus" AS ENUM ('CONFIGURED', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'MISSING_REMOTE', 'INACTIVE');
CREATE TYPE "ShopifyImageUploadSessionStatus" AS ENUM ('PENDING', 'PROCESSING', 'CONSUMED');

-- CreateTable
CREATE TABLE "shopify_image_configurations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shopify_image_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_project_images" (
    "id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "source_type" "ShopifyImageSourceType" NOT NULL,
    "source_url" TEXT,
    "original_filename" VARCHAR(255),
    "mime_type" VARCHAR(50) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "alt_text" VARCHAR(512),
    "position" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "ShopifyImageStatus" NOT NULL DEFAULT 'CONFIGURED',
    "shopify_media_id" VARCHAR(20),
    "shopify_file_id" VARCHAR(20),
    "shopify_image_url" TEXT,
    "first_published_at" TIMESTAMP(3),
    "last_published_at" TIMESTAMP(3),
    "last_error_category" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shopify_project_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_image_upload_sessions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "alt_text" VARCHAR(512),
    "status" "ShopifyImageUploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shopify_image_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_image_configurations_project_id_workspace_id_key" ON "shopify_image_configurations"("project_id", "workspace_id");
CREATE INDEX "shopify_image_configurations_workspace_id_idx" ON "shopify_image_configurations"("workspace_id");
CREATE UNIQUE INDEX "shopify_project_images_shopify_file_id_key" ON "shopify_project_images"("shopify_file_id");
CREATE UNIQUE INDEX "shopify_project_images_configuration_id_position_key" ON "shopify_project_images"("configuration_id", "position");
CREATE UNIQUE INDEX "shopify_project_images_configuration_id_content_hash_key" ON "shopify_project_images"("configuration_id", "content_hash");
CREATE INDEX "shopify_project_images_configuration_id_active_position_idx" ON "shopify_project_images"("configuration_id", "active", "position");
CREATE INDEX "shopify_project_images_configuration_id_status_idx" ON "shopify_project_images"("configuration_id", "status");
CREATE INDEX "shopify_image_upload_sessions_project_id_workspace_id_user_id_idx" ON "shopify_image_upload_sessions"("project_id", "workspace_id", "user_id");
CREATE INDEX "shopify_image_upload_sessions_expires_at_status_idx" ON "shopify_image_upload_sessions"("expires_at", "status");

-- AddForeignKey
ALTER TABLE "shopify_image_configurations" ADD CONSTRAINT "shopify_image_configurations_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_project_images" ADD CONSTRAINT "shopify_project_images_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "shopify_image_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_image_upload_sessions" ADD CONSTRAINT "shopify_image_upload_sessions_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_image_upload_sessions" ADD CONSTRAINT "shopify_image_upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
