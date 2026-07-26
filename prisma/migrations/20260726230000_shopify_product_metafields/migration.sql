-- CreateTable
CREATE TABLE "shopify_metafield_configurations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "schema_version" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_metafield_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_project_metafields" (
    "id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "catalog_key" VARCHAR(100) NOT NULL,
    "namespace" VARCHAR(255) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "serialized_value" TEXT,
    "value_hash" CHAR(64),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "shopify_metafield_id" VARCHAR(20),
    "first_published_at" TIMESTAMP(3),
    "last_published_at" TIMESTAMP(3),
    "last_published_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_project_metafields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_metafield_definition_links" (
    "id" UUID NOT NULL,
    "shopify_store_id" UUID NOT NULL,
    "catalog_key" VARCHAR(100) NOT NULL,
    "namespace" VARCHAR(255) NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "shopify_definition_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_metafield_definition_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_metafield_configurations_project_id_workspace_id_key" ON "shopify_metafield_configurations"("project_id", "workspace_id");
CREATE INDEX "shopify_metafield_configurations_workspace_id_idx" ON "shopify_metafield_configurations"("workspace_id");
CREATE UNIQUE INDEX "shopify_project_metafields_configuration_id_catalog_key_key" ON "shopify_project_metafields"("configuration_id", "catalog_key");
CREATE UNIQUE INDEX "shopify_project_metafields_configuration_id_namespace_key_key" ON "shopify_project_metafields"("configuration_id", "namespace", "key");
CREATE INDEX "shopify_project_metafields_configuration_id_enabled_idx" ON "shopify_project_metafields"("configuration_id", "enabled");
CREATE UNIQUE INDEX "shopify_metafield_definition_links_shopify_store_id_catalog_key_key" ON "shopify_metafield_definition_links"("shopify_store_id", "catalog_key");
CREATE UNIQUE INDEX "shopify_metafield_definition_links_shopify_store_id_namespace_key_key" ON "shopify_metafield_definition_links"("shopify_store_id", "namespace", "key");
CREATE INDEX "shopify_metafield_definition_links_shopify_store_id_idx" ON "shopify_metafield_definition_links"("shopify_store_id");

-- AddForeignKey
ALTER TABLE "shopify_metafield_configurations" ADD CONSTRAINT "shopify_metafield_configurations_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_project_metafields" ADD CONSTRAINT "shopify_project_metafields_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "shopify_metafield_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_metafield_definition_links" ADD CONSTRAINT "shopify_metafield_definition_links_shopify_store_id_fkey" FOREIGN KEY ("shopify_store_id") REFERENCES "shopify_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
