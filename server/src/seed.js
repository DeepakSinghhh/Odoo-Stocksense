// Resets the database and fills it with a believable few weeks of warehouse activity.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.join(here, '..', 'stocksense.db');
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });

const { db } = await import('./db.js');
const { nextReference, confirm, validate, checkAvailability } = await import('./services/stock.js');

const one = (sql, ...a) => db.prepare(sql).get(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a).lastInsertRowid;
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/* people */
const admin = run('INSERT INTO users (login_id, name, email, password_hash) VALUES (?,?,?,?)',
  'admin01', 'Asha Menon', 'admin@stocksense.local', bcrypt.hashSync('Admin@1234', 10));
const staff = run('INSERT INTO users (login_id, name, email, password_hash) VALUES (?,?,?,?)',
  'ravi.k', 'Ravi Kumar', 'ravi@stocksense.local', bcrypt.hashSync('Ravi@12345', 10));

/* places */
const WH = run('INSERT INTO warehouses (name, code, address) VALUES (?,?,?)', 'Main Warehouse', 'WH', 'Plot 14, GIDC Estate, Gandhinagar');
const WH2 = run('INSERT INTO warehouses (name, code, address) VALUES (?,?,?)', 'City Depot', 'CD', '22 Ring Road, Ahmedabad');
const loc = (name, code, wh) => run('INSERT INTO locations (name, code, warehouse_id) VALUES (?,?,?)', name, code, wh);
const L = {
  stock1: loc('Stock 1', 'Stock1', WH),
  stock2: loc('Stock 2', 'Stock2', WH),
  rackA: loc('Rack A', 'RackA', WH),
  prod: loc('Production Floor', 'Prod', WH),
  depot: loc('Depot Stock', 'Stock', WH2),
};
const V = {
  vendor: run(`INSERT INTO locations (name, code, type) VALUES ('Vendor', 'Vendor', 'vendor')`),
  customer: run(`INSERT INTO locations (name, code, type) VALUES ('Customer', 'Customer', 'customer')`),
  adjust: run(`INSERT INTO locations (name, code, type) VALUES ('Inventory Loss', 'Adjust', 'adjustment')`),
};

/* catalogue */
const cat = Object.fromEntries(['Furniture', 'Raw Material', 'Hardware', 'Packaging', 'Electrical']
  .map((n) => [n, run('INSERT INTO categories (name) VALUES (?)', n)]));
const product = (name, sku, category, uom, cost, min) =>
  run('INSERT INTO products (name, sku, category_id, uom, unit_cost, reorder_min) VALUES (?,?,?,?,?,?)',
    name, sku, cat[category], uom, cost, min);
const P = {
  desk: product('Desk', 'DESK001', 'Furniture', 'Units', 3000, 10),
  table: product('Table', 'TABLE001', 'Furniture', 'Units', 3000, 8),
  chair: product('Office Chair', 'CHAIR01', 'Furniture', 'Units', 1850, 15),
  shelf: product('Steel Shelf Unit', 'SHELF-5T', 'Furniture', 'Units', 4200, 4),
  rod: product('Steel Rods', 'STL-ROD', 'Raw Material', 'kg', 72, 150),
  frame: product('Steel Frame', 'STL-FRM', 'Raw Material', 'Units', 640, 20),
  ply: product('Plywood Sheet 18mm', 'PLY-18', 'Raw Material', 'Sheets', 1350, 25),
  screw: product('Wood Screws (box of 200)', 'SCR-200', 'Hardware', 'Boxes', 180, 30),
  hinge: product('Soft-close Hinge', 'HNG-SC', 'Hardware', 'Units', 95, 60),
  carton: product('Carton 5-ply', 'CTN-5P', 'Packaging', 'Units', 38, 200),
  wrap: product('Stretch Wrap Roll', 'WRAP-500', 'Packaging', 'Rolls', 420, 10),
  led: product('LED Desk Lamp', 'LED-DL2', 'Electrical', 'Units', 1100, 12),
};

/* operations, played through the real stock engine so the ledger is honest */
function op(type, { wh = WH, contact = '', address = '', from, to, when = 0, lines, who = admin }) {
  const id = run(`INSERT INTO operations (reference, type, warehouse_id, contact, address, source_location_id,
    dest_location_id, scheduled_date, responsible_id) VALUES (?,?,?,?,?,?,?,?,?)`,
  nextReference(wh, type), type, wh, contact, address, from, to, day(when), who);
  for (const [p, q] of lines) run('INSERT INTO operation_lines (operation_id, product_id, quantity) VALUES (?,?,?)', id, p, q);
  return id;
}
function done(id, offset, who = admin) {
  const { type } = one('SELECT type FROM operations WHERE id = ?', id);
  if (type !== 'adjustment') confirm(id);
  validate(id, who);
  const stamp = `${day(offset)} ${String(9 + (id % 8)).padStart(2, '0')}:${String((id * 7) % 60).padStart(2, '0')}:00`;
  db.prepare('UPDATE operations SET done_at = ?, created_at = ? WHERE id = ?').run(stamp, stamp, id);
  db.prepare('UPDATE moves SET created_at = ? WHERE operation_id = ?').run(stamp, id);
}

const receipt = (contact, lines, when, extra = {}) =>
  op('receipt', { contact, from: V.vendor, to: L.stock1, when, lines, ...extra });
const delivery = (contact, address, lines, when, extra = {}) =>
  op('delivery', { contact, address, from: L.stock1, to: V.customer, when, lines, ...extra });

// History (done)
done(receipt('Azure Interior', [[P.desk, 50], [P.table, 50], [P.chair, 40]], -13), -13);
done(receipt('Tata Steel', [[P.rod, 600], [P.frame, 80]], -12), -12);
done(receipt('Greenply Industries', [[P.ply, 60], [P.hinge, 300], [P.screw, 80]], -11), -11, staff);
done(receipt('PackRight Supplies', [[P.carton, 900], [P.wrap, 24]], -10), -10);
done(op('internal', { from: L.stock1, to: L.prod, when: -9, lines: [[P.rod, 250], [P.ply, 20]], contact: 'Production' }), -9, staff);
done(delivery('Deco Addict', '7 MG Road, Pune', [[P.desk, 6], [P.chair, 12]], -8), -8);
done(receipt('Lumen Works', [[P.led, 30], [P.shelf, 10]], -8), -8);
done(delivery('Wood Corner', '41 Park Street, Kolkata', [[P.table, 10], [P.carton, 120]], -7), -7, staff);
done(op('internal', { from: L.stock1, to: L.rackA, when: -6, lines: [[P.hinge, 120], [P.screw, 30]], contact: 'Re-shelving' }), -6, staff);
done(delivery('Gemini Furniture', '5 Residency Rd, Bengaluru', [[P.frame, 20], [P.shelf, 4]], -5), -5);
done(op('adjustment', { from: L.prod, to: V.adjust, when: -4, lines: [[P.rod, 247]], contact: 'Damaged rods' }), -4, staff);
done(receipt('Azure Interior', [[P.desk, 20]], -4), -4);
done(delivery('Ready Mat', '12 Link Rd, Mumbai', [[P.desk, 14], [P.led, 18], [P.wrap, 6]], -3), -3);
done(op('internal', { wh: WH, from: L.stock1, to: L.stock2, when: -2, lines: [[P.chair, 10], [P.carton, 200]], contact: 'Overflow' }), -2, staff);
done(delivery('The Jackson Group', 'Sector 62, Noida', [[P.chair, 12], [P.ply, 32]], -1), -1);
done(receipt('Tata Steel', [[P.rod, 120]], -1, { to: L.depot, wh: WH2 }), -1);
done(delivery('Deco Addict', '7 MG Road, Pune', [[P.led, 9], [P.hinge, 150]], 0), 0, staff);

// Open work for the dashboard
confirm(receipt('Azure Interior', [[P.desk, 6]], -2));                        // late, ready
confirm(receipt('Greenply Industries', [[P.ply, 40], [P.screw, 50]], 0));
confirm(receipt('Lumen Works', [[P.led, 25]], 2));
confirm(receipt('PackRight Supplies', [[P.carton, 500]], 4));
receipt('Tata Steel', [[P.rod, 300], [P.frame, 40]], 5);                        // draft
receipt('Hettich India', [[P.hinge, 200]], 6);                                 // draft

confirm(delivery('Azure Interior', '19 Anna Salai, Chennai', [[P.desk, 6]], -1));   // late, ready
confirm(delivery('Wood Corner', '41 Park Street, Kolkata', [[P.table, 5], [P.chair, 4]], 0));
confirm(delivery('Gemini Furniture', '5 Residency Rd, Bengaluru', [[P.shelf, 9]], 1));   // waiting: short on shelves
confirm(delivery('Ready Mat', '12 Link Rd, Mumbai', [[P.frame, 70]], 2));                // waiting: short on frames
confirm(delivery('The Jackson Group', 'Sector 62, Noida', [[P.carton, 150]], 3));
delivery('Deco Addict', '7 MG Road, Pune', [[P.led, 3]], 4);                             // draft

confirm(op('internal', { from: L.stock1, to: L.prod, when: 1, lines: [[P.frame, 10]], contact: 'Production' }));
op('internal', { from: L.stock1, to: L.depot, wh: WH, when: 3, lines: [[P.desk, 5]], contact: 'Depot top-up' });

for (const { id } of db.prepare(`SELECT id FROM operations WHERE status = 'waiting'`).all()) checkAvailability(id);

const count = (t) => one(`SELECT COUNT(*) AS n FROM ${t}`).n;
console.log(`Seeded ${count('products')} products, ${count('operations')} operations, ${count('moves')} ledger moves.`);
console.log('Sign in with  admin01 / Admin@1234   (or ravi.k / Ravi@12345)');
