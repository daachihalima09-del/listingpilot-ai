-- Product is now the uniqueness boundary. Project foreign keys remain during
-- the compatibility phase, but no longer prevent sibling products from owning
-- independent Shopify configuration and linkage.
DROP INDEX "shopify_variant_configurations_project_id_workspace_id_key";
DROP INDEX "shopify_product_publications_project_id_workspace_id_key";
DROP INDEX "shopify_metafield_configurations_project_id_workspace_id_key";
DROP INDEX "shopify_product_import_links_project_id_key";
DROP INDEX "shopify_product_import_links_project_id_workspace_id_key";
DROP INDEX "shopify_image_configurations_project_id_workspace_id_key";
