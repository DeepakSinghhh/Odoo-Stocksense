import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { parse, fail } from '../middleware/error.js';
import { sendOtpMail, mailConfigured } from '../services/mailer.js';

const router = Router();

const password = z.string()
  .min(9, 'Password must be more than 8 characters')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character');

const signupSchema = z.object({
  loginId: z.string().trim()
    .min(6, 'Login ID must be 6–12 characters')
    .max(12, 'Login ID must be 6–12 characters')
    .regex(/^[A-Za-z0-9_.]+$/, 'Login ID can use letters, numbers, _ and .'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  name: z.string().trim().max(60).optional(),
  password,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
});

const publicUser = (u) => ({ id: u.id, loginId: u.login_id, name: u.name, email: u.email });

router.post('/signup', (req, res) => {
  const data = parse(signupSchema, req.body);
  if (db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(data.loginId)) {
    fail(409, 'Login ID is already taken', { loginId: 'Login ID is already taken' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) {
    fail(409, 'Email is already registered', { email: 'Email is already registered' });
  }
  const hash = bcrypt.hashSync(data.password, 10);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (login_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
  ).run(data.loginId, data.name || data.loginId, data.email, hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { loginId, password: pw } = parse(z.object({
    loginId: z.string().trim().min(1, 'Enter your Login ID'),
    password: z.string().min(1, 'Enter your password'),
  }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE login_id = ?').get(loginId);
  if (!user || !bcrypt.compareSync(pw, user.password_hash)) {
    fail(401, 'Invalid Login Id or Password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) fail(404, 'No account uses that email. Check the spelling or sign up first.', { email: 'No account uses that email' });
  const otp = String(crypto.randomInt(100000, 1000000));
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
  db.prepare(`INSERT INTO password_resets (user_id, otp_hash, expires_at)
              VALUES (?, ?, datetime('now', '+10 minutes'))`).run(user.id, bcrypt.hashSync(otp, 8));
  const delivered = await sendOtpMail(user.email, otp);
  const response = {
    delivered,
    message: delivered ? `Code sent to ${user.email}. Check your inbox (and spam).`
      : mailConfigured ? "Couldn't send the email right now." : "Email isn't set up on this server.",
  };
  // Without email we surface the code so the flow stays usable (set OTP_FALLBACK=off to disable).
  if (!delivered && process.env.OTP_FALLBACK !== 'off') response.devOtp = otp;
  res.json(response);
});

router.post('/reset-password', (req, res) => {
  const data = parse(z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP is 6 digits'),
    password,
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'], message: 'Passwords do not match',
  }), req.body);

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email);
  const reset = user && db.prepare(`SELECT * FROM password_resets
    WHERE user_id = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(user.id);
  if (!reset || reset.attempts >= 5) fail(400, 'OTP expired, request a new one');
  if (!bcrypt.compareSync(data.otp, reset.otp_hash)) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(reset.id);
    fail(400, 'Incorrect OTP', { otp: 'Incorrect OTP' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(data.password, 10), user.id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  res.json({ message: 'Password updated. Sign in with your new password.' });
});

router.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)));

router.put('/me', requireAuth, (req, res) => {
  const data = parse(z.object({
    name: z.string().trim().min(1, 'Name is required').max(60),
    email: z.string().trim().toLowerCase().email('Enter a valid email'),
  }), req.body);
  const clash = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(data.email, req.user.id);
  if (clash) fail(409, 'Email is already registered', { email: 'Email is already registered' });
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(data.name, data.email, req.user.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

router.put('/me/password', requireAuth, (req, res) => {
  const data = parse(z.object({ current: z.string().min(1, 'Enter your current password'), password }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(data.current, user.password_hash)) {
    fail(400, 'Current password is incorrect', { current: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(data.password, 10), user.id);
  res.json({ message: 'Password changed' });
});

router.get('/users', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, login_id AS loginId, name FROM users ORDER BY name').all());
});

export default router;
