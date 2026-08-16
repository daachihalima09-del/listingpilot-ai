CREATE TYPE "ProductSourceImageKind" AS ENUM ('JSON_LD', 'OPEN_GRAPH', 'GALLERY', 'SRCSET', 'IMAGE_ELEMENT');
CREATE TYPE "ProductSourceImageStatus" AS ENUM ('DETECTED', 'IMPORTED');

ALTER TABLE "shopify_project_images"
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "source_provenance" VARCHAR(50),
  ADD COLUMN "source_page_url" TEXT;

CREATE TABLE "product_source_images" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "source_page_url" TEXT NOT NULL,
  "image_url" TEXT NOT NULL,
  "url_hash" CHAR(64) NOT NULL,
  "source_kind" "ProductSourceImageKind" NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "alt_text" VARCHAR(512),
  "score" INTEGER NOT NULL,
  "status" "ProductSourceImageStatus" NOT NULL DEFAULT 'DETECTED',
  "imported_image_id" UUID,
  "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_source_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_source_images_imported_image_id_key" ON "product_source_images"("imported_image_id");
CREATE UNIQUE INDEX "product_source_images_product_id_workspace_id_url_hash_key" ON "product_source_images"("product_id", "workspace_id", "url_hash");
CREATE INDEX "product_source_images_product_id_workspace_id_status_score_idx" ON "product_source_images"("product_id", "workspace_id", "status", "score");

ALTER TABLE "product_source_images" ADD CONSTRAINT "product_source_images_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_source_images" ADD CONSTRAINT "product_source_images_project_id_workspace_id_fkey"
  FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_source_images" ADD CONSTRAINT "product_source_images_product_id_project_id_workspace_id_fkey"
  FOREIGN KEY ("product_id", "project_id", "workspace_id") REFERENCES "products"("id", "project_id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_source_images" ADD CONSTRAINT "product_source_images_imported_image_id_fkey"
  FOREIGN KEY ("imported_image_id") REFERENCES "shopify_project_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
