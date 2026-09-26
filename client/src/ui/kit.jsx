import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useLive } from '../live.jsx';
import * as Icon from './icons.jsx';

export const OP_TYPES = {
  receipt: { slug: 'receipts', title: 'Receipts', one: 'Receipt', code: 'IN', trail: ['draft', 'ready', 'done'], contactLabel: 'Receive From' },
  delivery: { slug: 'deliveries', title: 'Delivery', one: 'Delivery', code: 'OUT', trail: ['draft', 'waiting', 'ready', 'done'], contactLabel: 'Deliver To' },
  internal: { slug: 'internal', title: 'Internal Transfers', one: 'Internal Transfer', code: 'INT', trail: ['draft', 'waiting', 'ready', 'done'], contactLabel: 'Purpose' },
  adjustment: { slug: 'adjustments', title: 'Adjustments', one: 'Adjustment', code: 'ADJ', trail: ['draft', 'done'], contactLabel: 'Reason' },
};
export const typeFromSlug = (slug) => Object.keys(OP_TYPES).find((k) => OP_TYPES[k].slug === slug);
export const STATUSES = ['draft', 'waiting', 'ready', 'done', 'canceled'];
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : `${s.replace(' ', 'T')}Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtMoney = (n) => `${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Rs`;

/* Data fetching with refresh; keeps previous data during reloads so the UI doesn't flash. */
export function useApi(path, params) {
  const key = JSON.stringify([path, params]);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const { version } = useLive();
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api.get(path, params)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState((s) => ({ ...s, error, loading: false })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, version]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function Tag({ status, late }) {
  if (late) return <span className="tag late">Late</span>;
  return <span className={`tag ${status}`}>{status}</span>;
}

export function Trail({ steps, status }) {
  const at = steps.indexOf(status);
  return (
    <div className={`trail ${status === 'canceled' ? 'canceled' : ''}`} aria-label={`Status: ${status}`}>
      {status === 'canceled'
        ? <span className="now">Canceled</span>
        : steps.map((s, i) => (
          <span key={s} className={i === at ? 'now' : i < at ? 'past' : ''}>
            {cap(s)}{i < steps.length - 1 && <i>&nbsp;&nbsp;›</i>}
          </span>
        ))}
    </div>
  );
}

/* Deterministic barcode stripes from any string (decorative, Code-39 flavoured). */
export function Barcode({ value, className = 'barcode', color = 'currentColor' }) {
  const bars = useMemo(() => {
    let h = 7;
    const out = [];
    let x = 0;
    for (const ch of `*${value}*`) {
      h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      for (let i = 0; i < 5; i++) {
        const w = ((h >> (i * 3)) & 3) + 1;
        if (i % 2 === 0) out.push(<rect key={`${x}`} x={x} y="0" width={w} height="20" fill={color} />);
        x += w + 1;
      }
      x += 2;
    }
    return { out, x };
  }, [value, color]);
  return (
    <svg className={className} viewBox={`0 0 ${bars.x} 20`} preserveAspectRatio="none" width="100%" aria-hidden="true">{bars.out}</svg>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em className="err">{error}</em> : hint ? <em className="muted" style={{ fontSize: 12 }}>{hint}</em> : null}
    </label>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(760px, 100%)' } : undefined}>
        <header>
          <h2>{title}</h2>
          <button className="iconbtn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close"><Icon.X /></button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/* [NEW] Title ............ 🔍 ☰ ▦ — the header strip every wireframe list uses. */
export function PageHead({ title, note, onNew, newLabel = 'New', search, onSearch, view, onView, children, searchHint }) {
  const [open, setOpen] = useState(Boolean(search));
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <div className="pagehead">
      {onNew && <button className="btn new" onClick={onNew}>{newLabel}</button>}
      <h1>{title}{note && <small>{note}</small>}</h1>
      <div className="tools">
        {children}
        {onSearch && (open ? (
          <div className="search">
            <Icon.Search />
            <input ref={ref} value={search} placeholder={searchHint || 'Search reference or contact'}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (onSearch(''), setOpen(false))}
              onBlur={() => !search && setOpen(false)} />
            {search && <button className="iconbtn" style={{ width: 22, height: 22, border: 0 }} onClick={() => onSearch('')} aria-label="Clear search"><Icon.X /></button>}
          </div>
        ) : (
          <button className="iconbtn" onClick={() => setOpen(true)} aria-label="Search" title="Search"><Icon.Search /></button>
        ))}
        {onView && (
          <>
            <button className={`iconbtn ${view === 'list' ? 'on' : ''}`} onClick={() => onView('list')} aria-label="List view" title="List view"><Icon.List /></button>
            <button className={`iconbtn ${view === 'kanban' ? 'on' : ''}`} onClick={() => onView('kanban')} aria-label="Kanban view" title="Kanban by status"><Icon.Kanban /></button>
          </>
        )}
      </div>
    </div>
  );
}

/* Searchable product picker: type SKU or name. */
export function ProductPicker({ products, value, onChange, autoFocus, placeholder = 'Type SKU or product name', showFree }) {
  const current = products.find((p) => p.id === value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)).slice(0, 30);
  }, [q, products]);
  const pick = (p) => { onChange(p); setQ(''); setOpen(false); };
  return (
    <div className="combo">
      <input className="input" autoFocus={autoFocus} placeholder={placeholder}
        value={open ? q : current ? `[${current.sku}] ${current.name}` : ''}
        onFocus={() => { setOpen(true); setHi(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && matches[hi]) { e.preventDefault(); pick(matches[hi]); }
        }} />
      {open && (
        <div className="combo-list">
          {matches.length === 0 && <div className="muted" style={{ padding: 10 }}>No product matches “{q}”</div>}
          {matches.map((p, i) => (
            <button type="button" key={p.id} className={i === hi ? 'hi' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="sku">[{p.sku}]</span> {p.name}
              <span className="qty">{fmtQty(showFree ? p.free : p.on_hand)} {p.uom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useClickAway(onAway) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onAway();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onAway]);
  return ref;
}
