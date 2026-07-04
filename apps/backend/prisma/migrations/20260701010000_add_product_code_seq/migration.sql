-- Sequence cho product code an toàn — tránh race condition khi 2 user tạo sản phẩm cùng lúc
CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;