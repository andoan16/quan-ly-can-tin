-- CreateTable
CREATE TABLE "product_performance_reports" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "from" TIMESTAMPTZ(6),
    "to" TIMESTAMPTZ(6),
    "categoryId" UUID,
    "totalRevenue" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalProfit" DECIMAL(14,2) NOT NULL,
    "totalQuantity" DECIMAL(12,2) NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "productCount" INTEGER NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_performance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_performance_report_items" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productCode" VARCHAR(30) NOT NULL,
    "productName" VARCHAR(150) NOT NULL,
    "categoryName" VARCHAR(100),
    "unitName" VARCHAR(50),
    "totalQuantity" DECIMAL(12,2) NOT NULL,
    "totalRevenue" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalProfit" DECIMAL(14,2) NOT NULL,
    "profitMargin" DECIMAL(5,2) NOT NULL,
    "orderCount" INTEGER NOT NULL,

    CONSTRAINT "product_performance_report_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "product_performance_report_items" ADD CONSTRAINT "product_performance_report_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "product_performance_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
