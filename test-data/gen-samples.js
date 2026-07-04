const XLSX = require('xlsx');

// ── Generate 200 customer rows ──────────────────────────
const surnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Lâm', 'Tăng', 'Đinh'];
const middleNames = ['Văn', 'Thị', 'Hữu', 'Minh', 'Quang', 'Thanh', 'Hoài', 'Phương', 'Thu', 'Mai', 'Anh', 'Ngọc', 'Bảo', 'Đức', 'Thế'];
const lastNames = ['An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hùng', 'Khanh', 'Lan', 'Long', 'Linh', 'Nam', 'Phúc', 'Quân', 'Quyên', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Tú', 'Vinh', 'Yến'];

const customers = [];
for (let i = 1; i <= 200; i++) {
  const surname = surnames[i % surnames.length];
  const middle = middleNames[(i * 3) % middleNames.length];
  const last = lastNames[(i * 7) % lastNames.length];
  const phone = '09' + String(10000000 + i * 137).slice(0, 8);
  customers.push({
    'mã': 'HS' + String(i).padStart(3, '0'),
    'họ tên': surname + ' ' + middle + ' ' + last,
    'sđt': phone,
    'hoạt động': i % 20 === 0 ? 'false' : 'true',
  });
}

const ws = XLSX.utils.json_to_sheet(customers);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Người mua');
XLSX.writeFile(wb, 'test-data/customers_200.xlsx');
console.log('customers_200.xlsx created with', customers.length, 'rows');

// ── Generate 200 product rows ───────────────────────────
const categories = [
  { prefix: 'BM', name: 'Bánh mì' },
  { prefix: 'TM', name: 'Thực phẩm' },
  { prefix: 'NUOC', name: 'Nước uống' },
  { prefix: 'KEO', name: 'Kẹo' },
  { prefix: 'SN', name: 'Snack' },
];
const units = [
  { code: 'GOI', name: 'Gói' },
  { code: 'CHAI', name: 'Chai' },
  { code: 'HOP', name: 'Hộp' },
  { code: 'CAI', name: 'Cái' },
];
const productNames = ['Mì tôm', 'Nước suối', 'Bánh quy', 'Kẹo cứng', 'Snack tôm', 'Cà phê', 'Trà xanh', 'Bánh mì', 'Sữa tươi', 'Kẹo dẻo', 'Nước ngọt', 'Bánh bao', 'Xúc xích', 'Phô mai', 'Socola'];

const products = [];
for (let i = 1; i <= 200; i++) {
  const cat = categories[i % categories.length];
  const unit = units[i % units.length];
  const basePrice = 3000 + (i * 137) % 50000;
  const costPrice = Math.round(basePrice * 0.7);
  products.push({
    'mã': 'SP' + String(i).padStart(4, '0'),
    'tên': productNames[i % productNames.length] + ' ' + i,
    'danh mục': cat.prefix,
    'đơn vị': unit.code,
    'giá bán': basePrice,
    'giá nhập': costPrice,
    'tồn kho': (i * 7) % 200,
    'hoạt động': i % 25 === 0 ? 'false' : 'true',
  });
}

const ws2 = XLSX.utils.json_to_sheet(products);
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws2, 'Sản phẩm');
XLSX.writeFile(wb2, 'test-data/products_200.xlsx');
console.log('products_200.xlsx created with', products.length, 'rows');