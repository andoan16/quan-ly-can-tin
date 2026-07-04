-- Enum OrderStatus
CREATE TYPE "OrderStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- Thêm cột status (mặc định COMPLETED)
ALTER TABLE "orders" ADD COLUMN "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED';

-- Thêm cột cho thông tin hủy đơn
ALTER TABLE "orders" ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);
ALTER TABLE "orders" ADD COLUMN "cancelledBy" UUID;
ALTER TABLE "orders" ADD COLUMN "cancelReason" VARCHAR(500);

-- Index cho status
CREATE INDEX "orders_status_idx" ON "orders"("status");