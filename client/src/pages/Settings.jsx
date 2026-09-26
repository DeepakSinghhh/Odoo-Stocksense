import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ui/toast.jsx';
import { useApi, PageHead, Field, fmtQty } from '../ui/kit.jsx';
import * as Icon from '../ui/icons.jsx';

function useEditor(initial, save, reload) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const reset = () => { setForm(initial); setEditing(null); setErrors({}); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await save(form, editing);
      toast(editing ? 'Changes saved' : 'Created');
      reset();
      reload();
    } catch (err) { setErrors(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (path) => {
    try { await api.del(path); toast('Deleted', 'warn'); reset(); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return { form, setForm, editing, setEditing, errors, busy, submit, reset, remove };
}

export function Warehouses() {
  const { data, reload } = useApi('/warehouses');
  const ed = useEditor({ name: '', code: '', address: '' },
    (f, id) => (id ? api.put(`/warehouses/${id}`, f) : api.post('/warehouses', f)), reload);
  const set = (k) => (e) => ed.setForm({ ...ed.form, [k]: e.target.value });

  return (
    <>
      <PageHead title="Warehouse" note="the buildings your stock lives in" onNew={ed.reset} />
      <div className="settings">
        <form onSubmit={ed.submit} className="panel" style={{ padding: '22px 24px' }}>
          <p className="hand" style={{ margin: 0 }}>{ed.editing ? `editing ${ed.form.code}` : 'add a warehouse'}</p>
          <Field label="Name:" error={ed.errors.name}><input className="input" value={ed.form.name} onChange={set('name')} placeholder="Main Warehouse" /></Field>
          <Field label="Short Code:" error={ed.errors.code} hint="used in references, e.g. WH/IN/0001">
            <input className="input mono" value={ed.form.code} onChange={set('code')} placeholder="WH" maxLength={10} />
          </Field>
          <Field label="Address:" error={ed.errors.address}><textarea className="textarea input" rows={2} value={ed.form.address} onChange={set('address')} /></Field>
          <div className="row">
            <button className="btn primary" disabled={ed.busy}>{ed.editing ? 'Save changes' : 'Create warehouse'}</button>
            {ed.editing && <button type="button" className="btn ghost" onClick={ed.reset}>Discard</button>}
            {ed.editing && <button type="button" className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => ed.remove(`/warehouses/${ed.editing}`)}><Icon.Trash /></button>}
          </div>
        </form>
        <div className="wh-list">
          {(data || []).map((w) => (
            <div key={w.id} className={`wh-card ${ed.editing === w.id ? 'sel' : ''}`}
              onClick={() => { ed.setEditing(w.id); ed.setForm({ name: w.name, code: w.code, address: w.address || '' }); }}>
              <span className="code">{w.code}</span>
              <b>{w.name}</b>
              <span className="num muted right">{fmtQty(w.units)} units</span>
              <span className="addr">{w.address || 'no address'}</span>
              <span className="mono muted right" style={{ fontSize: 12 }}>{w.location_count} locations</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function Locations() {
  const { data, reload } = useApi('/locations');
  const warehouses = useApi('/warehouses').data || [];
  const ed = useEditor({ name: '', code: '', warehouseId: '' },
    (f, id) => {
      const body = { ...f, warehouseId: Number(f.warehouseId || warehouses[0]?.id) };
      return id ? api.put(`/locations/${id}`, body) : api.post('/locations', body);
    }, reload);
  const set = (k) => (e) => ed.setForm({ ...ed.form, [k]: e.target.value });

  return (
    <>
      <PageHead title="Locations" note="racks, rooms & floors inside each warehouse" onNew={ed.reset} />
      <div className="settings">
        <form onSubmit={ed.submit} className="panel" style={{ padding: '22px 24px' }}>
          <p className="hand" style={{ margin: 0 }}>{ed.editing ? `editing ${ed.form.code}` : 'add a location'}</p>
          <Field label="Name:" error={ed.errors.name}><input className="input" value={ed.form.name} onChange={set('name')} placeholder="Rack B" /></Field>
          <Field label="Short Code:" error={ed.errors.code}><input className="input mono" value={ed.form.code} onChange={set('code')} placeholder="RackB" maxLength={10} /></Field>
          <Field label="Warehouse:" error={ed.errors.warehouseId}>
            <select className="select" value={ed.form.warehouseId || warehouses[0]?.id || ''} onChange={set('warehouseId')}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </Field>
          <div className="row">
            <button className="btn primary" disabled={ed.busy}>{ed.editing ? 'Save changes' : 'Create location'}</button>
            {ed.editing && <button type="button" className="btn ghost" onClick={ed.reset}>Discard</button>}
            {ed.editing && <button type="button" className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => ed.remove(`/locations/${ed.editing}`)}><Icon.Trash /></button>}
          </div>
        </form>
        <div className="table-wrap" style={{ margin: 0 }}>
          <table className="ledger">
            <thead><tr><th>Location</th><th>Name</th><th>Warehouse</th><th className="right">Units</th></tr></thead>
            <tbody>
              {(data || []).map((l) => (
                <tr key={l.id} className="click" onClick={() => { ed.setEditing(l.id); ed.setForm({ name: l.name, code: l.code, warehouseId: l.warehouse_id }); }}>
                  <td className="ref">{l.label}</td>
                  <td>{l.name}</td>
                  <td className="muted">{l.warehouse_name}</td>
                  <td className="num right">{fmtQty(l.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
