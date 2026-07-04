import type { Order } from '@/api/endpoints';
import dayjs from 'dayjs';

function formatMoney(v: number) {
  return Number(v).toLocaleString('vi-VN') + '₫';
}

/**
 * Tạo HTML đầy đủ (kèm CSS inline) cho hoá đơn — dùng cho print và xuất PDF.
 * Nội dung giống component Receipt.tsx nhưng dạng string để truyền vào Electron.
 */
export function buildReceiptHTML(order: Order, storeName = 'CĂN TIN'): string {
  const itemsRows = (order.items ?? [])
    .map(
      (item) => `
      <tr>
        <td style="padding:3px 0">${item.product?.name ?? '—'}</td>
        <td style="padding:3px 0;text-align:center">${Number(item.quantity)}</td>
        <td style="padding:3px 0;text-align:right">${formatMoney(Number(item.unitPrice))}</td>
        <td style="padding:3px 0;text-align:right;font-weight:600">${formatMoney(Number(item.quantity) * Number(item.unitPrice))}</td>
      </tr>`,
    )
    .join('');

  const balanceRows =
    order.balanceBefore != null && order.balanceAfter != null
      ? `
      <div style="display:flex;justify-content:space-between;margin-top:4px;color:#666">
        <span>Số dư trước:</span><span>${formatMoney(Number(order.balanceBefore))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:#666">
        <span>Số dư sau:</span><span>${formatMoney(Number(order.balanceAfter))}</span>
      </div>`
      : '';

  const noteRow = order.note
    ? `<div style="font-size:10px;color:#666;margin-bottom:8px">Ghi chú: ${order.note}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 300px;
      margin: 0 auto;
      padding: 12px;
      color: #333;
      background: #fff;
    }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; padding: 2px 0; }
    .header { text-align: center; margin-bottom: 8px; }
    .header .store { font-size: 18px; font-weight: 700; }
    .header .sub { font-size: 11px; color: #666; }
    .info { font-size: 11px; margin-bottom: 8px; line-height: 1.6; }
    .info > div { display: flex; justify-content: space-between; }
    .items { border-top: 1px dashed #999; border-bottom: 1px dashed #999; padding: 6px 0; margin-bottom: 8px; }
    .total { font-size: 12px; margin-bottom: 8px; }
    .total .grand { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; }
    .footer { text-align: center; font-size: 11px; color: #666; margin-top: 12px; }
    @page { margin: 5mm; }
  </style>
</head>
<body>
  <div class="header">
    <div class="store">${storeName}</div>
    <div class="sub">Hóa đơn bán hàng</div>
  </div>
  <div class="info">
    <div><span>Mã đơn:</span><span style="font-weight:600">${order.code}</span></div>
    <div><span>Thời gian:</span><span>${dayjs(order.createdAt).format('DD/MM/YYYY HH:mm:ss')}</span></div>
    <div><span>Người mua:</span><span>${order.customer?.fullName ?? '—'}</span></div>
    <div><span>Thu ngân:</span><span>${order.cashier?.fullName ?? '—'}</span></div>
  </div>
  <div class="items">
    <table>
      <thead>
        <tr style="font-weight:600">
          <th style="padding:2px 0">SP</th>
          <th style="padding:2px 0;text-align:center;width:40px">SL</th>
          <th style="padding:2px 0;text-align:right;width:70px">Giá</th>
          <th style="padding:2px 0;text-align:right;width:80px">TT</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
  </div>
  <div class="total">
    <div class="grand">
      <span>TỔNG CỘNG:</span>
      <span style="color:#1677ff">${formatMoney(Number(order.totalComputed))}</span>
    </div>
    ${balanceRows}
  </div>
  ${noteRow}
  <div class="footer">Cảm ơn quý khách!</div>
</body>
</html>`;
}