-- AddForeignKey
ALTER TABLE "product_performance_reports" ADD CONSTRAINT "product_performance_reports_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
