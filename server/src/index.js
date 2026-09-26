import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/masters.js';
import operationRoutes from './routes/operations.js';
import moveRoutes from './routes/moves.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, masterRoutes);
app.use('/api/operations', requireAuth, operationRoutes);
app.use('/api/moves', requireAuth, moveRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client in production (npm run build in /client).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`StockSense API on http://localhost:${port}`));
