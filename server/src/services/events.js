import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.js';

// Server-Sent Events: every open StockSense tab gets a nudge when stock data changes.
const clients = new Set();
let seq = 0;

export function eventsHandler(req, res) {
  // EventSource can't set headers, so the token travels as a query param on this one route.
  try { jwt.verify(String(req.query.token || ''), JWT_SECRET); } catch { return res.status(401).end(); }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\nevent: hello\ndata: ${seq}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

export function broadcast(what) {
  seq += 1;
  const msg = `event: change\ndata: ${JSON.stringify({ seq, what, at: Date.now() })}\n\n`;
  for (const res of clients) res.write(msg);
}

// Any successful write to the API means someone else's screen may be stale.
export function broadcastWrites(req, res, next) {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400 && !req.originalUrl.startsWith('/api/auth')) {
        broadcast(req.originalUrl.split('?')[0].replace(/^\/api\//, '').split('/')[0]);
      }
    });
  }
  next();
}
