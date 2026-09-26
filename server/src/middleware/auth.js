import jwt from 'jsonwebtoken';
import { db } from '../db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'stocksense-dev-secret';

export const signToken = (user) =>
  jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue' });
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, login_id, name, email FROM users WHERE id = ?').get(sub);
    if (!user) return res.status(401).json({ error: 'Session expired, please sign in again' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}
