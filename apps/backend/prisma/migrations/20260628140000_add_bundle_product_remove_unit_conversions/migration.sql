-- DropForeignKey
ALTER TABLE "unit_conversions" DROP CONSTRAINT "unit_conversions_fromUnitId_fkey";

-- DropForeignKey
ALTER TABLE "unit_conversions" DROP CONSTRAINT "unit_conversions_productId_fkey";

-- DropForeignKey
ALTER TABLE "unit_conversions" DROP CONSTRAINT "unit_conversions_toUnitId_fkey";

-- AlterTable
ALTER TABLE "products" ADD COLUMN "bundleUnitId" UUID,
ADD COLUMN "factor" DECIMAL(12,4),
ADD COLUMN "parentProductId" UUID;

-- DropTable
DROP TABLE "unit_conversions";

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_bundleUnitId_fkey" FOREIGN KEY ("bundleUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;