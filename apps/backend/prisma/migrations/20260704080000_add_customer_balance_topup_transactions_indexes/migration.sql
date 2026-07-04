-- Add customer balance column (tài khoản căn tin)
ALTER TABLE "customers" ADD COLUMN "balance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Add order balance tracking columns
ALTER TABLE "orders" ADD COLUMN "balanceAfter" DECIMAL(14,2),
ADD COLUMN     "balanceBefore" DECIMAL(14,2),
ALTER COLUMN "paymentMethod" SET DEFAULT 'CASH';

-- CreateTable: topup_transactions (lịch sử nạp tiền)
CREATE TABLE "topup_transactions" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "receivedFrom" VARCHAR(150),
    "note" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topup_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topup_transactions_customerId_idx" ON "topup_transactions"("customerId");
CREATE INDEX "topup_transactions_createdAt_idx" ON "topup_transactions"("createdAt");
CREATE INDEX "inventory_transactions_productId_idx" ON "inventory_transactions"("productId");
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");
CREATE INDEX "inventory_transactions_createdAt_idx" ON "inventory_transactions"("createdAt");
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
CREATE INDEX "product_performance_report_items_reportId_idx" ON "product_performance_report_items"("reportId");
CREATE INDEX "products_parentProductId_idx" ON "products"("parentProductId");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topup_transactions" ADD CONSTRAINT "topup_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topup_transactions" ADD CONSTRAINT "topup_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;