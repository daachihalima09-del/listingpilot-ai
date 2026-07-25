-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectSourceType" AS ENUM ('RAW_SPECIFICATIONS', 'SUPPLIER_URL', 'PRODUCT_URL', 'UPLOADED_PDF');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "status_before_archive" "ProjectStatus",
    "source_type" "ProjectSourceType",
    "source_url" TEXT,
    "raw_input" TEXT,
    "analysis_data" JSONB,
    "generated_listing" JSONB,
    "seo_data" JSONB,
    "readiness_data" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_updated_at_idx" ON "projects"("workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "projects_archived_at_idx" ON "projects"("archived_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
