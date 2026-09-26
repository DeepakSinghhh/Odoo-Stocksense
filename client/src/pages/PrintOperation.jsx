import { useParams } from 'react-router-dom';
import { useApi, fmtDate, fmtQty, OP_TYPES, Barcode } from '../ui/kit.jsx';

export default function PrintOperation() {
  const { id } = useParams();
  const { data: op, error } = useApi(`/operations/${id}`);
  if (error) return <div className="loader">{error.message}</div>;
  if (!op) return <div className="loader">Preparing the slip</div>;
  const title = { receipt: 'Goods Receipt', delivery: 'Delivery Slip', internal: 'Transfer Note', adjustment: 'Stock Count' }[op.type];
  const total = op.lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="print-page">
      <div className="noprint">
        <button className="btn" style={{ color: '#1b1714' }} onClick={() => window.print()}>Print</button>
        <button className="btn ghost" style={{ color: '#1b1714' }} onClick={() => window.close()}>Close</button>
      </div>
      <div className="sheet">
        {op.status === 'done' && <span className="stamp">{op.type === 'receipt' ? 'Received' : op.type === 'delivery' ? 'Delivered' : 'Done'}</span>}
        <p style={{ margin: 0, fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '0.2em' }}>STOCKSENSE · {op.warehouse_name.toUpperCase()}</p>
        <h1>{title}</h1>
        <div style={{ width: 260, marginTop: 10 }}>
          <Barcode value={op.reference} color="#1b1714" className="" />
          <div style={{ fontFamily: 'var(--f-mono)', letterSpacing: '0.3em', fontSize: 13 }}>{op.reference}</div>
        </div>
        <div className="meta">
          <div><b>{OP_TYPES[op.type].contactLabel}</b>{op.contact || '—'}</div>
          <div><b>Schedule date</b>{fmtDate(op.scheduled_date)}</div>
          <div><b>From</b>{op.source_label}</div>
          <div><b>To</b>{op.dest_label}</div>
          {op.address && <div><b>Delivery address</b>{op.address}</div>}
          <div><b>Responsible</b>{op.responsible_name || '—'}</div>
          <div><b>Validated</b>{op.done_at ? fmtDate(op.done_at) : 'not yet'}</div>
        </div>
        <table>
          <thead><tr><th>#</th><th>SKU</th><th>Product</th><th style={{ textAlign: 'right' }}>Quantity</th><th>UoM</th></tr></thead>
          <tbody>
            {op.lines.map((l, i) => (
              <tr key={l.id}><td>{i + 1}</td><td style={{ fontFamily: 'var(--f-mono)' }}>{l.sku}</td><td>{l.product_name}</td><td style={{ textAlign: 'right' }}>{fmtQty(l.quantity)}</td><td>{l.uom}</td></tr>
            ))}
            <tr><td /><td /><td style={{ fontWeight: 700 }}>Total</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtQty(total)}</td><td /></tr>
          </tbody>
        </table>
        <div className="sign"><div>Prepared by</div><div>{op.type === 'delivery' ? 'Received by (customer)' : 'Checked by'}</div></div>
      </div>
    </div>
  );
}
