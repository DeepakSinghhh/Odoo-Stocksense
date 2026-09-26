import { useCallback, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useClickAway, OP_TYPES } from './kit.jsx';
import * as Icon from './icons.jsx';

const THEME_KEY = 'stocksense.theme';
export const applyTheme = (t) => {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
};
export const savedTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'night'; } catch { return 'night'; } };

function Dropdown({ label, active, children, right }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickAway(close);
  return (
    <div className="nav-item" ref={ref}>
      <button className={`nav-link ${active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} <Icon.Caret className="caret" />
      </button>
      {open && <div className={`menu ${right ? 'right' : ''}`} onClick={close}>{children}</div>}
    </div>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useClickAway(closeMenu);
  const [theme, setTheme] = useState(savedTheme());

  const toggleTheme = () => {
    const next = theme === 'day' ? 'night' : 'day';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="frame">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="StockSense home"><Icon.Crate /> STOCK<b>SENSE</b></Link>
        <nav className="nav">
          <NavLink to="/" end className="nav-link">Dashboard</NavLink>
          <Dropdown label="Operations" active={pathname.startsWith('/operations')}>
            {Object.entries(OP_TYPES).map(([k, t]) => (
              <NavLink key={k} to={`/operations/${t.slug}`}>{t.title === 'Delivery' ? 'Delivery Orders' : t.title}<span className="code">{t.code}</span></NavLink>
            ))}
          </Dropdown>
          <NavLink to="/products" className="nav-link">Products</NavLink>
          <NavLink to="/moves" className="nav-link">Move History</NavLink>
          <Dropdown label="Settings" active={pathname.startsWith('/settings')}>
            <NavLink to="/settings/warehouses">Warehouse</NavLink>
            <NavLink to="/settings/locations">Locations</NavLink>
          </Dropdown>
        </nav>
        <div className="nav-item" ref={menuRef}>
          <button className="avatar" onClick={() => setMenu((m) => !m)} aria-label="Profile menu" aria-expanded={menu}>
            {(user?.name || user?.loginId || '?')[0].toUpperCase()}
          </button>
          {menu && (
            <div className="menu right" onClick={closeMenu}>
              <div className="who"><b>{user?.name}</b><span className="mono muted">@{user?.loginId}</span></div>
              <hr />
              <NavLink to="/profile">My Profile</NavLink>
              <button onClick={toggleTheme}>{theme === 'day' ? 'Switch to night shift' : 'Switch to day shift'}</button>
              <hr />
              <button onClick={() => { signOut(); navigate('/login'); }}>Logout</button>
            </div>
          )}
        </div>
      </header>
      <main className="page"><Outlet /></main>
    </div>
  );
}
