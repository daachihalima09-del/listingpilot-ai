-- CreateTable
CREATE TABLE "shopify_variant_configurations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_variant_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_project_options" (
    "id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_project_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_project_option_values" (
    "id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_project_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopify_project_variants" (
    "id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "shopify_variant_id" VARCHAR(20),
    "combination_key" VARCHAR(1024) NOT NULL,
    "option_values" JSONB NOT NULL,
    "price" VARCHAR(32) NOT NULL,
    "compare_at_price" VARCHAR(32),
    "sku" VARCHAR(255),
    "barcode" VARCHAR(255),
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_published_at" TIMESTAMP(3),
    "last_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_project_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_variant_configurations_project_id_workspace_id_key" ON "shopify_variant_configurations"("project_id", "workspace_id");

-- CreateIndex
CREATE INDEX "shopify_variant_configurations_workspace_id_idx" ON "shopify_variant_configurations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_project_options_configuration_id_position_key" ON "shopify_project_options"("configuration_id", "position");

-- CreateIndex
CREATE INDEX "shopify_project_options_configuration_id_idx" ON "shopify_project_options"("configuration_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_project_option_values_option_id_position_key" ON "shopify_project_option_values"("option_id", "position");

-- CreateIndex
CREATE INDEX "shopify_project_option_values_option_id_idx" ON "shopify_project_option_values"("option_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_project_variants_shopify_variant_id_key" ON "shopify_project_variants"("shopify_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopify_project_variants_configuration_id_combination_key_key" ON "shopify_project_variants"("configuration_id", "combination_key");

-- CreateIndex
CREATE INDEX "shopify_project_variants_configuration_id_active_position_idx" ON "shopify_project_variants"("configuration_id", "active", "position");

-- AddForeignKey
ALTER TABLE "shopify_variant_configurations" ADD CONSTRAINT "shopify_variant_configurations_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_project_options" ADD CONSTRAINT "shopify_project_options_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "shopify_variant_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_project_option_values" ADD CONSTRAINT "shopify_project_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "shopify_project_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopify_project_variants" ADD CONSTRAINT "shopify_project_variants_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "shopify_variant_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
