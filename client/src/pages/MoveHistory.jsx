import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, PageHead, Tag, fmtDate, fmtQty, OP_TYPES, cap } from '../ui/kit.jsx';
import { Kanban } from './OperationsList.jsx';
import * as Icon from '../ui/icons.jsx';

const SIGN = { in: '+', out: '−', internal: '' };
const DIR_ICON = { in: Icon.ArrowIn, out: Icon.ArrowOut, internal: Icon.Swap };

export default function MoveHistory() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('list');
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const direction = params.get('direction') || '';
  const product = params.get('product') || '';
  const status = params.get('status') || '';
  const { data, loading } = useApi('/moves', { q, direction, product, status });
  const rows = data || [];

  const setParam = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };
  const open = (m) => navigate(`/operations/${OP_TYPES[m.type].slug}/${m.operation_id}`);
  const totals = rows.filter((m) => m.status === 'done').reduce((t, m) => ({ ...t, [m.direction]: (t[m.direction] || 0) + m.quantity }), {});

  return (
    <>
      <PageHead title="Move History" onNew={() => navigate('/operations/internal/new')}
        search={q} onSearch={(v) => setParam('q', v)} searchHint="Search reference, contact or SKU"
        view={view} onView={setView} />

      <div className="filters">
        <span className="lbl">show</span>
        {[['', 'All moves'], ['in', 'In'], ['out', 'Out'], ['internal', 'Internal']].map(([v, l]) => (
          <button key={v} className={`chip ${direction === v ? 'on' : ''}`} onClick={() => setParam('direction', v)}>{l}</button>
        ))}
        <select className={`chipsel ${status ? 'set' : ''}`} value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="">Status: all</option>
          {['done', 'ready', 'waiting', 'draft', 'canceled'].map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        {product && <button className="chip on" onClick={() => setParam('product', '')}>{rows[0]?.sku || 'product'} ✕</button>}
        <span className="grow" />
        <span className="mono in">+{fmtQty(totals.in)} in</span>
        <span className="mono out">−{fmtQty(totals.out)} out</span>
      </div>

      {view === 'list' ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>Reference</th><th>Date</th><th>Contact</th><th>Product</th><th>From</th><th>To</th><th className="right">Quantity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const D = DIR_ICON[m.direction];
                return (
                  <tr key={m.key} className={`click ${m.direction}-row`} onClick={() => open(m)}>
                    <td className="ref">{m.reference}</td>
                    <td className="num">{fmtDate(m.date)}</td>
                    <td className="contact">{m.contact || '—'}</td>
                    <td><span className="mono" style={{ color: 'var(--coral)' }}>[{m.sku}]</span> {m.product_name}</td>
                    <td>{m.from_label}</td>
                    <td>{m.to_label}</td>
                    <td className="num right q">
                      <D width="13" style={{ verticalAlign: -2, marginRight: 6, opacity: 0.8 }} />
                      {SIGN[m.direction]}{fmtQty(m.quantity)} <span className="muted">{m.uom}</span>
                    </td>
                    <td><Tag status={m.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !rows.length && <div className="empty"><span className="hand">no moves recorded yet</span></div>}
        </div>
      ) : (
        <Kanban rows={rows} onOpen={open} render={(m) => (
          <>
            <div className="ref">{m.reference}</div>
            <div className="who">[{m.sku}] {m.product_name}</div>
            <div className="meta"><span>{m.from_label} → {m.to_label}</span></div>
            <div className="meta">
              <span>{fmtDate(m.date)}</span>
              <span className={m.direction === 'in' ? 'in' : m.direction === 'out' ? 'out' : ''}>{SIGN[m.direction]}{fmtQty(m.quantity)} {m.uom}</span>
            </div>
          </>
        )} />
      )}
    </>
  );
}
