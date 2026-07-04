-- Sequence an toàn cho order code — tránh trùng khi cùng giây
CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1;