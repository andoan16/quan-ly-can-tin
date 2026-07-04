-- Add prefix column to categories
ALTER TABLE "categories" ADD COLUMN "prefix" VARCHAR(10);

-- Populate prefix from existing code (first 2-4 chars uppercased)
UPDATE "categories" SET "prefix" = UPPER(LEFT("code", 4));

-- Make prefix unique and NOT NULL after data backfill
ALTER TABLE "categories" ALTER COLUMN "prefix" SET NOT NULL;
ALTER TABLE "categories" ADD CONSTRAINT "categories_prefix_key" UNIQUE ("prefix");