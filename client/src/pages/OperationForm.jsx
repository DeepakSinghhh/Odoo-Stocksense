import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../ui/toast.jsx';
import { useLive } from '../live.jsx';
import { useApi, Field, Trail, OP_TYPES, typeFromSlug, fmtQty, ProductPicker } from '../ui/kit.jsx';
import * as Icon from '../ui/icons.jsx';

const toForm = (op) => ({
  warehouseId: op.warehouse_id ?? op.warehouseId,
  contact: op.contact || '',
  address: op.address || '',
  sourceLocationId: op.source_location_id ?? op.sourceLocationId,
  destLocationId: op.dest_location_id ?? op.destLocationId,
  scheduledDate: op.scheduled_date ?? op.scheduledDate,
  responsibleId: op.responsible_id ?? op.responsibleId ?? '',
  notes: op.notes || '',
  lines: (op.lines || []).map((l) => ({ key: l.id, productId: l.product_id, quantity: l.quantity })),
});

export default function OperationForm() {
  const { slug, id } = useParams();
  const type = typeFromSlug(slug);
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();

  const [op, setOp] = useState(null);           // server record (null while new)
  const [form, setForm] = useState(null);
  const [reference, setReference] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const warehouses = useApi('/warehouses').data || [];
  const locations = useApi('/locations').data || [];
  const users = useApi('/auth/users').data || [];
  const products = useApi(form ? '/products' : null, { warehouse: form?.warehouseId }).data || [];

  // Load the record, or blank defaults for "New".
  useEffect(() => {
    let live = true;
    setErrors({});
    setDirty(false);
    const load = isNew ? api.get('/operations/defaults', { type }) : api.get(`/operations/${id}`);
    load.then((r) => {
      if (!live) return;
      setOp(isNew ? null : r);
      setReference(r.reference);
      setForm(toForm(r));
    }).catch((e) => { toast(e.message, 'error'); navigate(`/operations/${slug}`); });
    return () => { live = false; };
  }, [id, isNew, type, slug, navigate, toast]);

  // Someone else validated/edited this document: pull the fresh copy unless we have unsaved edits.
  const { version } = useLive();
  useEffect(() => {
    if (isNew || dirty || busy || !version) return;
    api.get(`/operations/${id}`).then((r) => {
      if (op && op.status !== r.status) toast(`${r.reference} is now ${r.status}`, 'warn', 'Updated live');
      setOp(r);
      setForm(toForm(r));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const status = op?.status || 'draft';
  const locked = ['done', 'canceled'].includes(status);
  const t = type && OP_TYPES[type];

  const byProduct = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const serverLine = (productId) => op?.lines.find((l) => l.product_id === productId);

  if (!type) return <Navigate to="/" replace />;
  if (!form) return <div className="loader">Pulling the file</div>;

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setLine = (i, patch) => set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const whLocations = locations.filter((l) => l.warehouse_id === Number(form.warehouseId));

  const changeWarehouse = async (warehouseId) => {
    const d = await api.get('/operations/defaults', { type, warehouse: warehouseId });
    setReference(d.reference);
    set({ warehouseId: d.warehouseId, sourceLocationId: d.sourceLocationId, destLocationId: d.destLocationId });
  };

  const payload = () => ({
    type,
    ...form,
    responsibleId: form.responsibleId ? Number(form.responsibleId) : null,
    sourceLocationId: Number(form.sourceLocationId),
    destLocationId: Number(form.destLocationId),
    lines: form.lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) || 0 })),
  });

  // Saves when needed and returns the record id.
  const save = async () => {
    setErrors({});
    const body = payload();
    if (!body.lines.length && type !== 'adjustment') throw Object.assign(new Error('Add at least one product'), { fields: {} });
    const saved = isNew ? await api.post('/operations', body) : dirty ? await api.put(`/operations/${op.id}`, body) : op;
    setOp(saved);
    setForm(toForm(saved));
    setReference(saved.reference);
    setDirty(false);
    if (isNew) navigate(`/operations/${slug}/${saved.id}`, { replace: true });
    return saved;
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { setErrors(e.fields || {}); toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const doSave = () => run(async () => { await save(); toast(`${reference} saved`); });

  const act = (action) => run(async () => {
    const saved = await save();
    const r = await api.post(`/operations/${saved.id}/${action}`);
    setOp(r);
    setForm(toForm(r));
    const shortLines = r.lines.filter((l) => l.short > 0);
    if (r.status === 'waiting') {
      toast(`${shortLines.map((l) => `[${l.sku}] short by ${fmtQty(l.short)}`).join(', ')} — marked Waiting`, 'warn', 'Not enough stock');
    } else if (r.status === 'ready') toast(`${r.reference} is ready to ${type === 'receipt' ? 'receive' : 'ship'}`);
    else if (r.status === 'done') toast(`${r.reference} validated — stock updated`, 'ok', 'Done');
    else if (r.status === 'canceled') toast(`${r.reference} canceled`, 'warn');
  });

  const primary = (() => {
    if (locked) return null;
    if (type === 'adjustment') return { label: 'Apply', action: 'validate' };
    if (status === 'draft') return { label: 'To Do', action: 'confirm' };
    if (status === 'waiting') return { label: 'Check Availability', action: 'check' };
    return { label: 'Validate', action: 'validate' };
  })();

  const needsFree = type === 'delivery' || type === 'internal';
  const lineShort = (l) => {
    if (!needsFree || locked || !l.productId) return 0;
    const s = serverLine(l.productId);
    if (s && !dirty) return s.short;
    const p = byProduct[l.productId];
    return p ? Math.max(0, Number(l.quantity || 0) - p.free) : 0;
  };
  const anyShort = form.lines.some((l) => lineShort(l) > 0);

  const locSelect = (key, label, list) => (
    <Field label={label} error={errors[key]}>
      <select className="select" disabled={locked} value={form[key] ?? ''} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {list.map((l) => <option key={l.id} value={l.id}>{l.label} — {l.name}</option>)}
      </select>
    </Field>
  );

  return (
    <>
      <div className="pagehead">
        <button className="btn new" onClick={() => navigate(`/operations/${slug}/new`)}>New</button>
        <h1>{t.one}</h1>
        <div className="tools">
          <button className="btn ghost small" onClick={() => navigate(`/operations/${slug}`)}>← All {t.title.toLowerCase()}</button>
        </div>
      </div>

      <div className="actionbar">
        {primary && <button className="btn primary" disabled={busy} onClick={() => act(primary.action)}>{primary.label}</button>}
        {!locked && (isNew || dirty) && <button className="btn" disabled={busy} onClick={doSave}>Save</button>}
        <button className="btn" disabled={status !== 'done'} title={status === 'done' ? 'Print' : 'Printable once it is Done'}
          onClick={() => window.open(`/print/${op.id}`, '_blank')}><Icon.Printer /> Print</button>
        {!isNew && !locked && <button className="btn danger" disabled={busy} onClick={() => act('cancel')}>Cancel</button>}
        <div className="grow" />
        <Trail steps={t.trail} status={status} />
      </div>

      <div className="doc">
        <div className="docref">
          {reference}
          {locked && <span className={`stamp ${status}`}>{status}</span>}
          {isNew && <span className="hand" style={{ fontSize: 20, color: 'var(--muted)', fontFamily: 'var(--f-hand)' }}>reserved on save</span>}
        </div>

        <div className="grid-2">
          <Field label={t.contactLabel} error={errors.contact}>
            <input className="input" disabled={locked} value={form.contact} placeholder={type === 'receipt' ? 'Vendor name' : type === 'delivery' ? 'Customer name' : ''}
              onChange={(e) => set({ contact: e.target.value })} />
          </Field>
          <Field label="Schedule Date" error={errors.scheduledDate}>
            <input className="input" type="date" disabled={locked} value={form.scheduledDate} onChange={(e) => set({ scheduledDate: e.target.value })} />
          </Field>
          {type === 'delivery' && (
            <Field label="Delivery Address" error={errors.address}>
              <input className="input" disabled={locked} value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          )}
          <Field label="Responsible" hint={isNew ? 'auto-filled with you' : undefined}>
            <select className="select" disabled={locked} value={form.responsibleId || ''} onChange={(e) => set({ responsibleId: e.target.value })}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} (@{u.loginId})</option>)}
            </select>
          </Field>
          <Field label="Operation type" hint={!isNew ? 'fixed once saved' : undefined}>
            <select className="select" disabled={!isNew} value={form.warehouseId} onChange={(e) => changeWarehouse(e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}: {t.title === 'Delivery' ? 'Delivery Orders' : t.title}</option>)}
            </select>
          </Field>
          {type === 'receipt' && locSelect('destLocationId', 'Receive Into', whLocations)}
          {type === 'delivery' && locSelect('sourceLocationId', 'Ship From', whLocations)}
          {type === 'internal' && locSelect('sourceLocationId', 'From Location', whLocations)}
          {type === 'internal' && locSelect('destLocationId', 'To Location', locations)}
          {type === 'adjustment' && locSelect('sourceLocationId', 'Counted Location', whLocations)}
        </div>
      </div>

      <div className="section-title">
        Products
        {anyShort && <span className="tag late" style={{ marginLeft: 'auto' }}>Some lines are short on stock</span>}
      </div>
      <div className="table-wrap">
        <table className="ledger lines">
          <thead>
            <tr>
              <th>Product</th>
              {needsFree && <th className="right">Free to use</th>}
              {type === 'adjustment' && <th className="right">System qty</th>}
              <th className="right">{type === 'adjustment' ? 'Counted' : 'Quantity'}</th>
              {type === 'adjustment' && <th className="right">Difference</th>}
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {form.lines.map((l, i) => {
              const p = byProduct[l.productId];
              const short = lineShort(l);
              const s = serverLine(l.productId);
              const system = s?.on_hand ?? 0;
              const diff = Number(l.quantity || 0) - system;
              return (
                <tr key={l.key} className={short ? 'short' : ''}>
                  <td style={{ minWidth: 280 }}>
                    {locked ? (
                      <span><span className="mono" style={{ color: 'var(--coral)' }}>[{s?.sku}]</span> {s?.product_name}</span>
                    ) : (
                      <ProductPicker products={products} value={l.productId} autoFocus={!l.productId} showFree={needsFree}
                        onChange={(prod) => setLine(i, { productId: prod.id })} />
                    )}
                    {short > 0 && <span className="shortnote">Not in stock — short by {fmtQty(short)} {p?.uom}</span>}
                  </td>
                  {needsFree && <td className="num right">{p ? fmtQty(!dirty && s ? s.free : p.free) : '—'}</td>}
                  {type === 'adjustment' && <td className="num right">{s ? fmtQty(system) : <span className="muted">on save</span>}</td>}
                  <td className="q right">
                    {locked ? <span className="num">{fmtQty(l.quantity)} <span className="muted">{s?.uom}</span></span> : (
                      <input className="input qty-input" type="number" min="0" step="any" value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    )}
                  </td>
                  {type === 'adjustment' && (
                    <td className={`num right ${diff > 0 ? 'in' : diff < 0 ? 'out' : ''}`}>
                      {s && !dirty ? (diff > 0 ? '+' : '') + fmtQty(diff) : '—'}
                    </td>
                  )}
                  <td>
                    {!locked && (
                      <button className="iconbtn" style={{ width: 30, height: 30, border: 0 }} aria-label="Remove line"
                        onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })}><Icon.Trash /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!locked && (
        <button className="addline" onClick={() => set({ lines: [...form.lines, { key: `n${Date.now()}`, productId: null, quantity: 1 }] })}>
          <Icon.Plus width="16" /> New Product
        </button>
      )}
      {!form.lines.length && <p className="hand" style={{ padding: '0 26px' }}>add the products for this {t.one.toLowerCase()} ↑</p>}
    </>
  );
}
