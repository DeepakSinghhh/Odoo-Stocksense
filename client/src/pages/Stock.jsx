import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../ui/toast.jsx';
import { useApi, PageHead, Field, Modal, fmtQty, fmtMoney } from '../ui/kit.jsx';
import * as Icon from '../ui/icons.jsx';

const blank = { name: '', sku: '', categoryId: '', uom: 'Units', unitCost: '', reorderMin: '', initialQty: '', locationId: '' };

function ProductModal({ product, categories, locations, onClose, onSaved, reloadCategories }) {
  const toast = useToast();
  const editing = Boolean(product);
  const [f, setF] = useState(editing ? {
    name: product.name, sku: product.sku, categoryId: product.category_id || '', uom: product.uom,
    unitCost: product.unit_cost, reorderMin: product.reorder_min,
  } : { ...blank, locationId: locations[0]?.id || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const addCategory = async () => {
    try {
      const c = await api.post('/categories', { name: newCat });
      await reloadCategories();
      setF((x) => ({ ...x, categoryId: c.id }));
      setNewCat(null);
    } catch (e) { toast(e.message, 'error'); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete [${product.sku}] ${product.name}? This cannot be undone.`)) return;
    try {
      await api.del(`/products/${product.id}`);
      toast(`[${product.sku}] ${product.name} deleted`, 'warn');
      onSaved();
    } catch (err) { toast(err.message, 'error'); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      ...f,
      categoryId: f.categoryId ? Number(f.categoryId) : null,
      unitCost: Number(f.unitCost) || 0,
      reorderMin: Number(f.reorderMin) || 0,
      initialQty: Number(f.initialQty) || 0,
      locationId: f.locationId ? Number(f.locationId) : undefined,
    };
    try {
      const saved = editing ? await api.put(`/products/${product.id}`, body) : await api.post('/products', body);
      toast(`[${saved.sku}] ${saved.name} ${editing ? 'updated' : 'created'}`);
      onSaved();
    } catch (err) { setErrors(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit product' : 'New product'} onClose={onClose}
      footer={<>
        {editing && <button className="btn danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={remove}><Icon.Trash /> Delete</button>}
        <button className="btn ghost" onClick={onClose}>Discard</button>
        <button className="btn primary" form="pform" disabled={busy}>Save</button>
      </>}>
      <form id="pform" onSubmit={submit} className="grid-2" style={{ gap: '18px 28px' }}>
        <Field label="Product name" error={errors.name}><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="SKU / Code" error={errors.sku}><input className="input mono" value={f.sku} onChange={set('sku')} placeholder="DESK001" /></Field>
        <Field label="Category" error={errors.categoryId}>
          {newCat === null ? (
            <select className="select" value={f.categoryId} onChange={(e) => (e.target.value === '+' ? setNewCat('') : set('categoryId')(e))}>
              <option value="">Uncategorised</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="+">+ New category…</option>
            </select>
          ) : (
            <div className="row">
              <input className="input" autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} />
              <button type="button" className="btn small" onClick={addCategory}>Add</button>
            </div>
          )}
        </Field>
        <Field label="Unit of measure" error={errors.uom}>
          <input className="input" list="uoms" value={f.uom} onChange={set('uom')} />
          <datalist id="uoms">{['Units', 'kg', 'Litres', 'Metres', 'Boxes', 'Sheets', 'Rolls'].map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Per unit cost (Rs)" error={errors.unitCost}><input className="input num" type="number" min="0" step="any" value={f.unitCost} onChange={set('unitCost')} /></Field>
        <Field label="Reorder at (low stock level)" error={errors.reorderMin}><input className="input num" type="number" min="0" step="any" value={f.reorderMin} onChange={set('reorderMin')} /></Field>
        {!editing && (
          <>
            <Field label="Initial stock (optional)" error={errors.initialQty}><input className="input num" type="number" min="0" step="any" value={f.initialQty} onChange={set('initialQty')} /></Field>
            <Field label="Into location">
              <select className="select" value={f.locationId} onChange={set('locationId')}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </Field>
          </>
        )}
      </form>
    </Modal>
  );
}

function ProductDrawer({ id, onClose, onEdit, onCounted }) {
  const { data: p, reload } = useApi(`/products/${id}`);
  const toast = useToast();
  const navigate = useNavigate();
  const [count, setCount] = useState(null);

  const apply = async () => {
    try {
      const r = await api.post(`/products/${id}/count`, { locationId: count.locationId, counted: Number(count.value) });
      toast(`Stock count logged as ${r.reference}`, 'ok', 'Stock updated');
      setCount(null);
      reload();
      onCounted();
    } catch (e) { toast(e.message, 'error'); }
  };

  if (!p) return null;
  const max = Math.max(1, ...p.locations.map((l) => l.on_hand));
  return (
    <Modal title={p.name} onClose={onClose} wide
      footer={<>
        <button className="btn ghost" onClick={() => navigate(`/moves?product=${p.id}`)}>View moves</button>
        <button className="btn" onClick={onEdit}><Icon.Pencil /> Edit product</button>
      </>}>
      <div className="row wrap" style={{ gap: 26 }}>
        <div><span className="muted">SKU</span><div className="mono" style={{ color: 'var(--coral)', fontSize: 16 }}>{p.sku}</div></div>
        <div><span className="muted">Category</span><div>{p.category || '—'}</div></div>
        <div><span className="muted">On hand</span><div className="num" style={{ fontSize: 18 }}>{fmtQty(p.on_hand)} {p.uom}</div></div>
        <div><span className="muted">Free to use</span><div className="num" style={{ fontSize: 18 }}>{fmtQty(p.free)}</div></div>
        <div><span className="muted">Incoming</span><div className="num" style={{ fontSize: 18 }}>{fmtQty(p.incoming)}</div></div>
        <div><span className="muted">Reorder at</span><div className="num" style={{ fontSize: 18 }}>{fmtQty(p.reorder_min)}</div></div>
      </div>
      <div>
        <p className="hand" style={{ margin: '0 0 10px' }}>where it sits — click a count to correct it</p>
        <div className="loc-bars">
          {p.locations.map((l) => (
            <div className="loc-bar" key={l.id}>
              <span className="mono">{l.label}</span>
              <span className="track"><i style={{ width: `${(l.on_hand / max) * 100}%` }} /></span>
              {count?.locationId === l.id ? (
                <span className="cell-edit">
                  <input className="input" autoFocus type="number" min="0" value={count.value}
                    onChange={(e) => setCount({ ...count, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setCount(null); }} />
                  <button className="btn small primary" onClick={apply}>Set</button>
                </span>
              ) : (
                <button className="btn ghost small num" style={{ justifySelf: 'end' }} title="Record a physical count"
                  onClick={() => setCount({ locationId: l.id, value: l.on_hand })}>{fmtQty(l.on_hand)}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function Stock() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const { data, reload, loading } = useApi('/products', { q, status, category, warehouse });
  const cats = useApi('/categories');
  const warehouses = useApi('/warehouses').data || [];
  const locations = useApi('/locations').data || [];
  const [modal, setModal] = useState(null);     // 'new' | product
  const [drawer, setDrawer] = useState(null);
  const [edit, setEdit] = useState(null);       // inline on-hand edit {id, value, locationId}
  const toast = useToast();

  // Deep links like /products?q=SKU open the product straight away (once per query).
  const autoOpened = useRef('');
  useEffect(() => {
    if (q && data?.length === 1 && autoOpened.current !== q) { autoOpened.current = q; setDrawer(data[0].id); }
  }, [q, data]);

  const setParam = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    setParams(n, { replace: true });
  };

  const applyInline = async () => {
    try {
      const r = await api.post(`/products/${edit.id}/count`, { locationId: Number(edit.locationId), counted: Number(edit.value) });
      toast(`Counted & logged as ${r.reference}`, 'ok', 'Stock updated');
      setEdit(null);
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  const rows = data || [];
  return (
    <>
      <PageHead title="Stock" note="products & what's on the shelves" onNew={() => setModal('new')}
        search={q} onSearch={(v) => setParam('q', v)} searchHint="Search SKU or product" />

      <div className="filters">
        <span className="lbl">show</span>
        {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => setParam('status', v)}>{l}</button>
        ))}
        <select className={`chipsel ${category ? 'set' : ''}`} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">Category: all</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={`chipsel ${warehouse ? 'set' : ''}`} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} aria-label="Warehouse">
          <option value="">Warehouse: all</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr><th>Product</th><th>Category</th><th className="right">Per unit cost</th><th className="right">On hand</th><th className="right">Free to use</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="click" onClick={() => edit?.id !== p.id && setDrawer(p.id)}>
                <td>
                  <div className="stock-name"><span className="sku">{p.sku}</span><span>{p.name}</span></div>
                </td>
                <td className="muted">{p.category || '—'}</td>
                <td className="num right">{fmtMoney(p.unit_cost)}</td>
                <td className="num right" onClick={(e) => e.stopPropagation()}>
                  {edit?.id === p.id ? (
                    <span className="cell-edit">
                      <select className="select" style={{ width: 130 }} value={edit.locationId} onChange={(e) => setEdit({ ...edit, locationId: e.target.value })}>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                      </select>
                      <input className="input" autoFocus type="number" min="0" value={edit.value}
                        onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyInline(); if (e.key === 'Escape') setEdit(null); }} />
                      <button className="btn small primary" onClick={applyInline}>Set</button>
                      <button className="btn small ghost" onClick={() => setEdit(null)}>✕</button>
                    </span>
                  ) : (
                    <>
                      {fmtQty(p.on_hand)} <span className="muted">{p.uom}</span>
                      <button className="pencil" title="Update stock (physical count)" aria-label={`Update stock for ${p.name}`}
                        onClick={() => setEdit({ id: p.id, value: '', locationId: locations[0]?.id })}><Icon.Pencil /></button>
                    </>
                  )}
                </td>
                <td className="num right">{fmtQty(p.free)}</td>
                <td className="right">{p.stock_status !== 'ok' && <span className={`lvl ${p.stock_status}`}>{p.stock_status === 'out' ? 'OUT' : 'LOW'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !rows.length && <div className="empty"><span className="hand">no products here</span></div>}
      </div>
      <p className="hand" style={{ padding: '14px 0 0', color: 'var(--muted)', fontSize: 19 }}>
        ✎ hover a row and hit the pencil to update stock — every correction is logged as an adjustment
      </p>

      {modal && (
        <ProductModal product={modal === 'new' ? null : modal} categories={cats.data || []} locations={locations}
          reloadCategories={cats.reload} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {drawer && !modal && (
        <ProductDrawer id={drawer} onClose={() => setDrawer(null)} onCounted={reload}
          onEdit={() => { setModal(rows.find((r) => r.id === drawer)); setDrawer(null); }} />
      )}
    </>
  );
}
