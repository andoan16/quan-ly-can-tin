-- Thêm relation user → stock_counts
-- countedAt chuyển thành nullable (null = chưa hoàn thành), xóa default
ALTER TABLE "stock_counts" ALTER COLUMN "countedAt" DROP NOT NULL;
ALTER TABLE "stock_counts" ALTER COLUMN "countedAt" DROP DEFAULT;