import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi, Tag, fmtDate, fmtQty, OP_TYPES, STATUSES, cap } from '../ui/kit.jsx';

/* Split-flap numerals: each digit drops in like a departure board. */
function Flaps({ value, tone }) {
  const s = String(value ?? 0).padStart(2, '0');
  return (
    <div className="flaps" aria-label={String(value)}>
      {s.split('').map((c, i) => (
        <span key={`${s}-${i}`} className={`flap roll ${tone || ''}`}><span style={{ '--d': `${i * 0.08}s` }}>{c}</span></span>
      ))}
    </div>
  );
}

function OpCard({ type, data, primary, extra }) {
  const t = OP_TYPES[type];
  const base = `/operations/${t.slug}`;
  const navigate = useNavigate();
  return (
    <section className="opcard">
      <div>
        <h2>{type === 'receipt' ? 'Receipt' : 'Delivery'}</h2>
        <button className="big" onClick={() => navigate(`${base}?status=ready`)}>
          <b>{data.ready || 0}</b> {primary}
        </button>
      </div>
      <ul className="stats">
        <li className="late"><Link to={`${base}?late=1`}><b>{data.late || 0}</b> Late</Link></li>
        {extra && <li className="waiting"><Link to={`${base}?status=waiting`}><b>{data.waiting || 0}</b> Waiting</Link></li>}
        <li><Link to={base}><b>{data.upcoming || 0}</b> Operations</Link></li>
        <li><Link to={`${base}?status=draft`}><b>{data.draft || 0}</b> Draft</Link></li>
      </ul>
      <p className="foot hand" style={{ fontSize: 18, color: 'var(--muted)', margin: 0 }}>
        {data.late ? `${data.late} past schedule date — chase them first` : 'nothing overdue, nice'}
      </p>
      <span className="watermark">{t.code}</span>
    </section>
  );
}

/* 14-day stock flow: units in above the line, units out below it. */
function FlowChart({ flow }) {
  const [hover, setHover] = useState(null);
  const W = 560; const H = 170; const mid = 86; const pad = 4;
  const max = Math.max(1, ...flow.map((d) => Math.max(d.in_qty, d.out_qty)));
  const bw = (W - pad * 2) / flow.length;
  const scale = (v) => (v / max) * (mid - 14);
  return (
    <div className="chart-wrap">
      <svg className="flow" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label="Units received and shipped per day over the last 14 days" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--faint)" strokeWidth="1" />
        {flow.map((d, i) => {
          const x = pad + i * bw;
          const w = Math.max(4, bw - 8);
          const hin = scale(d.in_qty); const hout = scale(d.out_qty);
          return (
            <g key={d.day} onMouseEnter={() => setHover({ i, d })}>
              <rect x={x} y="0" width={bw} height={H} fill={hover?.i === i ? 'var(--coral-ghost)' : 'transparent'} />
              {d.in_qty > 0 && <rect x={x + 4} y={mid - 1 - hin} width={w} height={hin} rx="3" fill="var(--c-in)" />}
              {d.out_qty > 0 && <rect x={x + 4} y={mid + 1} width={w} height={hout} rx="3" fill="var(--c-out)" />}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: `${((pad + hover.i * bw + bw / 2) / W) * 100}%`, top: 10 }}>
          <b>{fmtDate(hover.d.day)}</b>
          <div><i style={{ background: 'var(--c-in)' }} />In {fmtQty(hover.d.in_qty)}</div>
          <div><i style={{ background: 'var(--c-out)' }} />Out {fmtQty(hover.d.out_qty)}</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span className="mono muted">{fmtDate(flow[0]?.day)}</span>
        <div className="legend">
          <span><i style={{ background: 'var(--c-in)' }} />Units in</span>
          <span><i style={{ background: 'var(--c-out)' }} />Units out</span>
        </div>
        <span className="mono muted">today</span>
      </div>
    </div>
  );
}

function ChipSelect({ value, onChange, label, options }) {
  return (
    <select className={`chipsel ${value ? 'set' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: all</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default function Dashboard() {
  const [f, setF] = useState({ type: '', status: '', warehouse: '', category: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const scope = { warehouse: f.warehouse, category: f.category };
  const { data } = useApi('/dashboard', scope);
  const ops = useApi('/operations', f);
  const warehouses = useApi('/warehouses').data || [];
  const categories = useApi('/categories').data || [];
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!data) return <div className="loader">Counting the shelves</div>;
  const k = data.kpis;

  return (
    <>
      <div className="pagehead">
        <h1>Dashboard<small>{today}</small></h1>
      </div>

      <div className="filters">
        <span className="lbl">filter by</span>
        <ChipSelect label="Document" value={f.type} onChange={set('type')}
          options={Object.entries(OP_TYPES).map(([v, t]) => [v, t.title])} />
        <ChipSelect label="Status" value={f.status} onChange={set('status')} options={STATUSES.map((s) => [s, cap(s)])} />
        <ChipSelect label="Warehouse" value={f.warehouse} onChange={set('warehouse')} options={warehouses.map((w) => [w.id, w.name])} />
        <ChipSelect label="Category" value={f.category} onChange={set('category')} options={categories.map((c) => [c.id, c.name])} />
        {Object.values(f).some(Boolean) && <button className="btn ghost small" onClick={() => setF({ type: '', status: '', warehouse: '', category: '' })}>Clear</button>}
      </div>

      <div className="dash-cards">
        <OpCard type="receipt" data={data.receipt} primary="to receive" />
        <OpCard type="delivery" data={data.delivery} primary="to deliver" extra />
      </div>

      <div className="board">
        <Link to="/products"><label>Products in stock</label><Flaps value={k.productsInStock} /></Link>
        <Link to="/products?status=low"><label>Low stock</label><Flaps value={k.lowStock} tone={k.lowStock ? 'warn' : ''} /></Link>
        <Link to="/products?status=out"><label>Out of stock</label><Flaps value={k.outOfStock} tone={k.outOfStock ? 'alarm' : ''} /></Link>
        <Link to="/operations/receipts"><label>Pending receipts</label><Flaps value={data.receipt.open} /></Link>
        <Link to="/operations/deliveries"><label>Pending deliveries</label><Flaps value={data.delivery.open} /></Link>
        <Link to="/operations/internal"><label>Transfers scheduled</label><Flaps value={data.internal.open} /></Link>
      </div>

      <div className="dash-lower">
        <section className="panel">
          <h3>Stock flow · 14 days <span className="hand">{fmtQty(k.totalUnits)} units on the shelves</span></h3>
          <FlowChart flow={data.flow} />
        </section>
        <section className="panel">
          <h3>Reorder alerts <span className="hand">{data.alerts.length ? 'restock these' : 'all shelves healthy'}</span></h3>
          {data.alerts.length === 0 && <p className="muted">No product is under its reorder level.</p>}
          {data.alerts.map((a) => (
            <Link to={`/products?q=${encodeURIComponent(a.sku)}`} key={a.id} className={`alert-row ${a.level}`}>
              <span className={`lvl ${a.level}`}>{a.level === 'out' ? 'OUT' : 'LOW'}</span>
              <span className="grow"><span className="mono" style={{ color: 'var(--coral)' }}>[{a.sku}]</span> {a.name}</span>
              <span className="meter"><i style={{ width: `${Math.min(100, (a.on_hand / Math.max(1, a.reorder_min)) * 100)}%` }} /></span>
              <span className="num" style={{ minWidth: 70, textAlign: 'right' }}>{fmtQty(a.on_hand)} / {fmtQty(a.reorder_min)}</span>
            </Link>
          ))}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 26, padding: '16px 0 0' }}>
        <h3 style={{ padding: '0 20px' }}>Operations <span className="hand">{ops.data ? `${ops.data.length} matching` : ''}</span></h3>
        <div className="table-wrap" style={{ margin: 0 }}>
          <table className="ledger">
            <thead><tr><th>Reference</th><th>Type</th><th>From</th><th>To</th><th>Contact</th><th>Schedule date</th><th>Status</th></tr></thead>
            <tbody>
              {(ops.data || []).slice(0, 10).map((o) => (
                <tr key={o.id} className="click" onClick={() => navigate(`/operations/${OP_TYPES[o.type].slug}/${o.id}`)}>
                  <td className="ref">{o.reference}</td>
                  <td>{OP_TYPES[o.type].one}</td>
                  <td>{o.source_label}</td>
                  <td>{o.dest_label}</td>
                  <td className="contact">{o.contact || '—'}</td>
                  <td className="num">{fmtDate(o.scheduled_date)}</td>
                  <td><Tag status={o.status} late={o.late} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {ops.data?.length === 0 && <div className="empty"><span className="hand">nothing matches these filters</span></div>}
        </div>
      </section>
    </>
  );
}
