-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterTable: Convert role from VARCHAR to UserRole enum
-- First add the new enum column, copy data with CAST, then drop old column
ALTER TABLE "users" ADD COLUMN "role_new" "UserRole";
UPDATE "users" SET "role_new" = "role"::"UserRole";
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" RENAME COLUMN "role_new" TO "role";
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;

-- AlterTable: Convert paymentMethod from VARCHAR to PaymentMethod enum
-- First add the new enum column, copy data with CAST, then drop old column
ALTER TABLE "orders" ADD COLUMN "paymentMethod_new" "PaymentMethod";
UPDATE "orders" SET "paymentMethod_new" = "paymentMethod"::"PaymentMethod";
ALTER TABLE "orders" DROP COLUMN "paymentMethod";
ALTER TABLE "orders" RENAME COLUMN "paymentMethod_new" TO "paymentMethod";
ALTER TABLE "orders" ALTER COLUMN "paymentMethod" SET NOT NULL;