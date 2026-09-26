import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi, PageHead, Tag, fmtDate, fmtQty, OP_TYPES, STATUSES, cap, typeFromSlug, Barcode } from '../ui/kit.jsx';

export function Kanban({ rows, onOpen, render }) {
  return (
    <div className="kanban">
      {STATUSES.map((s) => {
        const items = rows.filter((r) => r.status === s);
        return (
          <div className="lane" key={s}>
            <h4><Tag status={s} /><span className="count">{items.length}</span></h4>
            <div className="drop">
              {items.map((r) => (
                <article key={r.key ?? r.id} className={`shiptag ${s}`} onClick={() => onOpen(r)}>
                  {render(r)}
                </article>
              ))}
              {!items.length && <span className="hand" style={{ color: 'var(--faint)', fontSize: 18, textAlign: 'center', padding: '14px 0' }}>empty</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OperationsList() {
  const { slug } = useParams();
  const type = typeFromSlug(slug);
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('list');
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const late = params.get('late') || '';
  const { data, loading } = useApi(type ? '/operations' : null, { type, q, status, late });

  if (!type) return <Navigate to="/" replace />;
  const t = OP_TYPES[type];
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k === 'status') next.delete('late');
    if (k === 'late') next.delete('status');
    setParams(next, { replace: true });
  };
  const open = (o) => navigate(`/operations/${slug}/${o.id}`);
  const rows = data || [];

  return (
    <>
      <PageHead title={t.title} onNew={() => navigate(`/operations/${slug}/new`)}
        search={q} onSearch={(v) => setParam('q', v)} view={view} onView={setView} />

      <div className="filters">
        <span className="lbl">show</span>
        <button className={`chip ${!status && !late ? 'on' : ''}`} onClick={() => { setParam('status', ''); }}>All</button>
        {t.trail.concat('canceled').map((s) => (
          <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setParam('status', status === s ? '' : s)}>{cap(s)}</button>
        ))}
        <button className={`chip ${late ? 'on' : ''}`} onClick={() => setParam('late', late ? '' : '1')}>Late</button>
      </div>

      {view === 'list' ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr><th>Reference</th><th>From</th><th>To</th><th>Contact</th><th>Schedule date</th><th className="right">Qty</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="click" onClick={() => open(o)}>
                  <td className="ref">{o.reference}</td>
                  <td>{o.source_label}</td>
                  <td>{o.dest_label}</td>
                  <td className="contact">{o.contact || '—'}</td>
                  <td className="num" style={o.late ? { color: 'var(--out)' } : undefined}>{fmtDate(o.scheduled_date)}</td>
                  <td className="num right">{fmtQty(o.total_qty)}<span className="muted"> · {o.line_count}</span></td>
                  <td><Tag status={o.status} late={o.late} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="empty">
              <span className="hand">{q || status || late ? 'nothing matches — try another filter' : `no ${t.title.toLowerCase()} yet`}</span>
              <button className="btn" style={{ marginTop: 12 }} onClick={() => navigate(`/operations/${slug}/new`)}>Create the first one</button>
            </div>
          )}
        </div>
      ) : (
        <Kanban rows={rows} onOpen={open} render={(o) => (
          <>
            <div className="ref">{o.reference}</div>
            <div className="who">{o.contact || OP_TYPES[o.type].one}</div>
            <div className="meta"><span>{o.source_label} → {o.dest_label}</span></div>
            <div className="meta"><span style={o.late ? { color: 'var(--out)' } : undefined}>{fmtDate(o.scheduled_date)}</span><span>{fmtQty(o.total_qty)} units</span></div>
            <Barcode value={o.reference} />
          </>
        )} />
      )}
    </>
  );
}
