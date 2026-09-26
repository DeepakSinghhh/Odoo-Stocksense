import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ui/toast.jsx';
import { Field } from '../ui/kit.jsx';
import { Wordmark } from '../ui/icons.jsx';

const TICKER = [
  ['WH/IN/0041', '+50', 'DESK001', 'Vendor → WH/Stock1', 'in'],
  ['WH/INT/0017', '100', 'STL-ROD', 'WH/Stock1 → WH/Prod', ''],
  ['WH/OUT/0032', '−20', 'STL-FRM', 'WH/Stock1 → Customer', 'out'],
  ['WH/ADJ/0006', '−3', 'STL-ROD', 'WH/Prod → Inventory Loss', 'out'],
  ['CD/IN/0009', '+240', 'CTN-5P', 'Vendor → CD/Stock', 'in'],
];

function AuthShell({ title, sub, children }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="hazard" style={{ margin: '-48px -48px 0' }} />
        <div className="crate-text"><span>Every</span><span>Unit.</span><span>Logged.</span></div>
        <div>
          <p className="hand" style={{ fontSize: 26, margin: '0 0 14px' }}>the ledger never sleeps →</p>
          <div className="ticker">
            {TICKER.map(([ref, q, sku, path, dir]) => (
              <div key={ref}><span style={{ color: 'var(--coral)' }}>{ref}</span><span className={dir}>{q}</span><span>{sku}</span><span>{path}</span></div>
            ))}
          </div>
        </div>
      </aside>
      <section className="auth-side">
        <div className="auth-card">
          <div className="hazard" />
          <div className="logo"><Wordmark /></div>
          <h1>{title}</h1>
          <p className="sub muted">{sub}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ loginId: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.loginId || !form.password) { setError('Enter your Login ID and password'); return; }
    setBusy(true);
    try {
      signIn(await api.post('/auth/login', form));
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" sub="Clock in to the inventory floor">
      <form onSubmit={submit} noValidate>
        {error && <div className="formerr" role="alert">{error}</div>}
        <Field label="Login Id">
          <input className="input boxed" autoFocus autoComplete="username" value={form.loginId}
            onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className="input boxed" type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
      </form>
      <div className="auth-links"><Link to="/forgot">Forget Password ?</Link> &nbsp;|&nbsp; <Link to="/signup">Sign Up</Link></div>
      <p className="devnote" style={{ marginTop: 18, fontSize: 18, color: 'var(--muted)' }}>demo: admin01 / Admin@1234</p>
    </AuthShell>
  );
}

const pwRules = [
  ['More than 8 characters', (p) => p.length > 8],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A special character', (p) => /[^A-Za-z0-9]/.test(p)],
];

function PasswordRules({ value }) {
  return (
    <ul className="rules">
      {pwRules.map(([label, ok]) => <li key={label} className={ok(value) ? 'ok' : ''}>{label}</li>)}
    </ul>
  );
}

function validateSignup(f) {
  const e = {};
  if (!/^[A-Za-z0-9_.]{6,12}$/.test(f.loginId)) e.loginId = 'Login ID must be 6–12 characters (letters, numbers, _ .)';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email';
  const bad = pwRules.find(([, ok]) => !ok(f.password));
  if (bad) e.password = `Password needs: ${bad[0].toLowerCase()}`;
  if (f.password !== f.confirmPassword) e.confirmPassword = 'Passwords do not match';
  return e;
}

export function Signup() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ loginId: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const local = validateSignup(form);
    setErrors(local);
    setError('');
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      signIn(await api.post('/auth/signup', form));
      toast('Account created — welcome aboard.');
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(err.fields);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign up" sub="Get a badge for the warehouse">
      <form onSubmit={submit} noValidate>
        {error && !Object.keys(errors).length && <div className="formerr" role="alert">{error}</div>}
        <Field label="Enter Login Id" error={errors.loginId}>
          <input className={`input boxed ${errors.loginId ? 'bad' : ''}`} autoFocus value={form.loginId} onChange={set('loginId')} maxLength={12} />
        </Field>
        <Field label="Enter Email Id" error={errors.email}>
          <input className={`input boxed ${errors.email ? 'bad' : ''}`} type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Enter Password" error={errors.password}>
          <input className={`input boxed ${errors.password ? 'bad' : ''}`} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <PasswordRules value={form.password} />
        <Field label="Re-Enter Password" error={errors.confirmPassword}>
          <input className={`input boxed ${errors.confirmPassword ? 'bad' : ''}`} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />
        </Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <div className="auth-links">Already have a badge? <Link to="/login">Sign In</Link></div>
    </AuthShell>
  );
}

// Six independent boxes; `value` is an array so clearing one box never shifts the others.
function OtpBoxes({ value, onChange }) {
  const refs = useRef([]);
  const setAt = (i, d) => onChange(value.map((x, j) => (j === i ? d : x)));
  return (
    <div className="otp" onPaste={(e) => {
      const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (t) { e.preventDefault(); onChange([...t.padEnd(6, ' ')].map((c) => c.trim())); refs.current[Math.min(t.length, 5)]?.focus(); }
    }}>
      {value.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" maxLength={2} aria-label={`OTP digit ${i + 1}`}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            setAt(i, v);
            if (v) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
          }} />
      ))}
    </div>
  );
}

export function Forgot() {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [form, setForm] = useState({ otp: Array(6).fill(''), password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e?.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email'); return; }
    setBusy(true);
    try {
      const r = await api.post('/auth/forgot-password', { email });
      setDevOtp(r.devOtp || '');
      setStep(2);
      toast(r.message, 'ok', 'OTP sent');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError('');
    setErrors({});
    const otp = form.otp.join('');
    if (!/^\d{6}$/.test(otp)) { setErrors({ otp: 'Enter the 6-digit code' }); return; }
    if (form.password !== form.confirmPassword) { setErrors({ confirmPassword: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      const r = await api.post('/auth/reset-password', { email, ...form, otp });
      toast(r.message, 'ok', 'Password reset');
      navigate('/login');
    } catch (err) { setErrors(err.fields); setError(err.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Reset password" sub={step === 1 ? 'We’ll send a one-time code to your email' : `Code sent to ${email}`}>
      {step === 1 ? (
        <form onSubmit={request} noValidate>
          {error && <div className="formerr" role="alert">{error}</div>}
          <Field label="Email Id">
            <input className="input boxed" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate>
          {error && <div className="formerr" role="alert">{error}</div>}
          {devOtp && <p className="devnote">no mail server — your code is {devOtp}</p>}
          <Field label="One-time code" error={errors?.otp}>
            <OtpBoxes value={form.otp} onChange={(otp) => setForm({ ...form, otp })} />
          </Field>
          <Field label="New Password" error={errors?.password}>
            <input className="input boxed" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <PasswordRules value={form.password} />
          <Field label="Re-Enter Password" error={errors?.confirmPassword}>
            <input className="input boxed" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          </Field>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
          <button type="button" className="btn ghost small" onClick={request} disabled={busy}>Resend code</button>
        </form>
      )}
      <div className="auth-links"><Link to="/login">Back to Sign In</Link></div>
    </AuthShell>
  );
}
