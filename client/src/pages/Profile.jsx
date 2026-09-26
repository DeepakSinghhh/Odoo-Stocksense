import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ui/toast.jsx';
import { PageHead, Field, Barcode } from '../ui/kit.jsx';

export default function Profile() {
  const { user, setUser, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: user.name, email: user.email });
  const [pw, setPw] = useState({ current: '', password: '' });
  const [errors, setErrors] = useState({});

  const save = async (e) => {
    e.preventDefault();
    setErrors({});
    try { setUser(await api.put('/auth/me', f)); toast('Profile saved'); } catch (err) { setErrors(err.fields || {}); toast(err.message, 'error'); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    setErrors({});
    try { await api.put('/auth/me/password', pw); setPw({ current: '', password: '' }); toast('Password changed'); } catch (err) { setErrors(err.fields || {}); toast(err.message, 'error'); }
  };

  return (
    <>
      <PageHead title="My Profile" />
      <div className="settings">
        <div className="panel" style={{ padding: 0, overflow: 'hidden', alignSelf: 'start' }}>
          <div className="hazard" />
          <div style={{ padding: '24px 26px' }}>
            <p className="mono muted" style={{ margin: 0, letterSpacing: '0.2em', fontSize: 12 }}>STAFF BADGE</p>
            <h2 className="stencil" style={{ fontSize: 40, margin: '6px 0 0' }}>{user.name}</h2>
            <p className="mono" style={{ color: 'var(--coral)', margin: '0 0 18px' }}>@{user.loginId}</p>
            <Barcode value={user.loginId} className="" />
            <p className="muted" style={{ margin: '12px 0 0' }}>{user.email}</p>
            <button className="btn" style={{ marginTop: 22 }} onClick={() => { signOut(); navigate('/login'); }}>Logout</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <form className="panel" onSubmit={save} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h3 style={{ margin: 0 }}>Details</h3>
            <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email" error={errors.email}><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Login Id" hint="login IDs can't be changed"><input className="input mono" readOnly value={user.loginId} /></Field>
            <button className="btn primary" style={{ alignSelf: 'start' }}>Save</button>
          </form>
          <form className="panel" onSubmit={changePw} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h3 style={{ margin: 0 }}>Change password</h3>
            <Field label="Current password" error={errors.current}><input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password" error={errors.password} hint="more than 8 chars, upper + lower case and a special character">
              <input className="input" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
            </Field>
            <button className="btn" style={{ alignSelf: 'start' }}>Update password</button>
          </form>
        </div>
      </div>
    </>
  );
}
