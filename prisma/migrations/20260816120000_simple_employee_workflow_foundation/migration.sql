ALTER TABLE "projects"
  ADD COLUMN "default_product_type" VARCHAR(255),
  ADD COLUMN "default_collection" VARCHAR(255);

ALTER TABLE "products"
  ADD COLUMN "product_type" VARCHAR(255),
  ADD COLUMN "collection" VARCHAR(255);
