import { forwardRef } from 'react';
import type { Order } from '@/api/endpoints';
import dayjs from 'dayjs';

interface ReceiptProps {
  order: Order;
  storeName?: string;
}

function formatMoney(v: number) {
  return Number(v).toLocaleString('vi-VN') + '₫';
}

/**
 * Component hóa đơn điện tử — tối giản cho in nhiệt (thermal printer).
 * Sử dụng CSS @media print để ẩn mọi thứ ngoài receipt khi in.
 */
const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ order, storeName = 'CĂN TIN' }, ref) => {
  return (
    <div ref={ref} id="receipt-print-area" style={receiptStyle}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{storeName}</div>
        <div style={{ fontSize: 11, color: '#666' }}>Hóa đơn bán hàng</div>
      </div>

      <div style={{ fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Mã đơn:</span><span style={{ fontWeight: 600 }}>{order.code}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Thời gian:</span><span>{dayjs(order.createdAt).format('DD/MM/YYYY HH:mm:ss')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Người mua:</span><span>{order.customer?.fullName ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Thu ngân:</span><span>{order.cashier?.fullName ?? '—'}</span>
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #999', borderBottom: '1px dashed #999', padding: '6px 0', marginBottom: 8 }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontWeight: 600 }}>
              <th style={{ padding: '2px 0' }}>SP</th>
              <th style={{ padding: '2px 0', textAlign: 'center', width: 40 }}>SL</th>
              <th style={{ padding: '2px 0', textAlign: 'right', width: 70 }}>Giá</th>
              <th style={{ padding: '2px 0', textAlign: 'right', width: 80 }}>TT</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px dotted #eee' }}>
                <td style={{ padding: '3px 0' }}>
                  {item.product?.name ?? '—'}
                </td>
                <td style={{ padding: '3px 0', textAlign: 'center' }}>{Number(item.quantity)}</td>
                <td style={{ padding: '3px 0', textAlign: 'right' }}>{formatMoney(Number(item.unitPrice))}</td>
                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: 600 }}>
                  {formatMoney(Number(item.quantity) * Number(item.unitPrice))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
          <span>TỔNG CỘNG:</span>
          <span style={{ color: '#1677ff' }}>{formatMoney(Number(order.totalComputed))}</span>
        </div>
        {order.balanceBefore != null && order.balanceAfter != null && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: '#666' }}>
              <span>Số dư trước:</span><span>{formatMoney(Number(order.balanceBefore))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
              <span>Số dư sau:</span><span>{formatMoney(Number(order.balanceAfter))}</span>
            </div>
          </>
        )}
      </div>

      {order.note && (
        <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
          Ghi chú: {order.note}
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: '#666', marginTop: 12 }}>
        Cảm ơn quý khách!
      </div>
    </div>
  );
});

Receipt.displayName = 'Receipt';

const receiptStyle: React.CSSProperties = {
  width: 300,
  margin: '0 auto',
  padding: 12,
  fontFamily: 'monospace',
  background: '#fff',
  color: '#333',
};

export default Receipt;