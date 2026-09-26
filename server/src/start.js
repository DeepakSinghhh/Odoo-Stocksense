// Production entry: on a brand-new host (no database yet) seed the demo data, then start the API.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.join(here, '..', 'stocksense.db');

if (!fs.existsSync(file) || process.env.RESEED_ON_START === 'true') {
  console.log('[start] no database found, seeding demo data…');
  await import('./seed.js');
}
await import('./index.js');
