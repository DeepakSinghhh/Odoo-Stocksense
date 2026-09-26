import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { parse, fail } from '../middleware/error.js';
import { LOC_LABEL, quickAdjust } from '../services/stock.js';

const router = Router();
const id = z.coerce.number().int().positive();
const code = z.string().trim().min(1, 'Short code is required').max(10, 'Keep the short code under 10 characters')
  .regex(/^[A-Za-z0-9-]+$/, 'Short code can use letters, numbers and -');

/* ---------- Warehouses ---------- */

const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: code.transform((s) => s.toUpperCase()),
  address: z.string().trim().max(200).optional().default(''),
});

router.get('/warehouses', (req, res) => {
  res.json(db.prepare(`SELECT w.*,
      (SELECT COUNT(*) FROM locations l WHERE l.warehouse_id = w.id) AS location_count,
      (SELECT COALESCE(SUM(q.quantity), 0) FROM quants q JOIN locations l ON l.id = q.location_id
        WHERE l.warehouse_id = w.id) AS units
    FROM warehouses w ORDER BY w.id`).all());
});

router.post('/warehouses', (req, res) => {
  const d = parse(warehouseSchema, req.body);
  const created = tx(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO warehouses (name, code, address) VALUES (?, ?, ?)')
      .run(d.name, d.code, d.address);
    // Every warehouse starts with a main stock location.
    db.prepare(`INSERT INTO locations (name, code, warehouse_id) VALUES ('Stock', 'Stock', ?)`).run(lastInsertRowid);
    return db.prepare('SELECT * FROM warehouses WHERE id = ?').get(lastInsertRowid);
  });
  res.status(201).json(created);
});

router.put('/warehouses/:id', (req, res) => {
  const d = parse(warehouseSchema, req.body);
  const r = db.prepare('UPDATE warehouses SET name = ?, code = ?, address = ? WHERE id = ?')
    .run(d.name, d.code, d.address, parse(id, req.params.id));
  if (!r.changes) fail(404, 'Warehouse not found');
  res.json(db.prepare('SELECT * FROM warehouses WHERE id = ?').get(req.params.id));
});

router.delete('/warehouses/:id', (req, res) => {
  const wid = parse(id, req.params.id);
  if (db.prepare('SELECT 1 FROM operations WHERE warehouse_id = ? LIMIT 1').get(wid)) {
    fail(409, 'This warehouse has operations and cannot be deleted');
  }
  db.prepare('DELETE FROM warehouses WHERE id = ?').run(wid);
  res.status(204).end();
});

/* ---------- Locations ---------- */

const locationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code,
  warehouseId: id,
});

router.get('/locations', (req, res) => {
  const all = req.query.all === '1';
  res.json(db.prepare(`SELECT l.*, ${LOC_LABEL('l')} AS label, w.name AS warehouse_name, w.code AS warehouse_code,
      (SELECT COALESCE(SUM(quantity), 0) FROM quants q WHERE q.location_id = l.id) AS units
    FROM locations l LEFT JOIN warehouses w ON w.id = l.warehouse_id
    ${all ? '' : "WHERE l.type = 'internal'"} ORDER BY l.warehouse_id IS NULL, l.warehouse_id, l.id`).all());
});

router.post('/locations', (req, res) => {
  const d = parse(locationSchema, req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO locations (name, code, warehouse_id) VALUES (?, ?, ?)')
    .run(d.name, d.code, d.warehouseId);
  res.status(201).json(db.prepare('SELECT * FROM locations WHERE id = ?').get(lastInsertRowid));
});

router.put('/locations/:id', (req, res) => {
  const d = parse(locationSchema, req.body);
  const r = db.prepare(`UPDATE locations SET name = ?, code = ?, warehouse_id = ? WHERE id = ? AND type = 'internal'`)
    .run(d.name, d.code, d.warehouseId, parse(id, req.params.id));
  if (!r.changes) fail(404, 'Location not found');
  res.json(db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id));
});

router.delete('/locations/:id', (req, res) => {
  const lid = parse(id, req.params.id);
  const used = db.prepare(`SELECT 1 FROM moves WHERE from_location_id = @lid OR to_location_id = @lid
    UNION SELECT 1 FROM operations WHERE source_location_id = @lid OR dest_location_id = @lid LIMIT 1`).get({ lid });
  if (used) fail(409, 'This location has stock history and cannot be deleted');
  db.prepare(`DELETE FROM locations WHERE id = ? AND type = 'internal'`).run(lid);
  res.status(204).end();
});

/* ---------- Categories ---------- */

router.get('/categories', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
    FROM categories c ORDER BY c.name`).all());
});

router.post('/categories', (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1, 'Name is required').max(40) }), req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  res.status(201).json({ id: lastInsertRowid, name });
});

/* ---------- Products & stock ---------- */

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  sku: z.string().trim().min(2, 'SKU is required').max(20)
    .regex(/^[A-Za-z0-9-_]+$/, 'SKU can use letters, numbers, - and _').transform((s) => s.toUpperCase()),
  categoryId: id.nullable().optional(),
  uom: z.string().trim().min(1, 'Unit of measure is required').max(12),
  unitCost: z.coerce.number().min(0, 'Cost cannot be negative').default(0),
  reorderMin: z.coerce.number().min(0, 'Cannot be negative').default(0),
});

// On hand and free-to-use per product, optionally scoped to a warehouse.
const productQuery = (where = '', whFilter = '') => `
  SELECT p.*, c.name AS category,
    COALESCE((SELECT SUM(q.quantity) FROM quants q JOIN locations l ON l.id = q.location_id
      WHERE q.product_id = p.id ${whFilter}), 0) AS on_hand,
    COALESCE((SELECT SUM(ol.quantity) FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id
      JOIN locations l ON l.id = o.source_location_id
      WHERE ol.product_id = p.id AND o.status = 'ready' AND o.type IN ('delivery','internal') ${whFilter}), 0) AS reserved,
    COALESCE((SELECT SUM(ol.quantity) FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id
      WHERE ol.product_id = p.id AND o.type = 'receipt' AND o.status IN ('draft','ready')), 0) AS incoming
  FROM products p LEFT JOIN categories c ON c.id = p.category_id ${where}`;

const withStatus = (p) => ({
  ...p,
  free: p.on_hand - p.reserved,
  stock_status: p.on_hand <= 0 ? 'out' : p.on_hand <= p.reorder_min ? 'low' : 'ok',
});

router.get('/products', (req, res) => {
  const { q, category, status, warehouse } = req.query;
  const conds = [];
  const params = {};
  if (q) { conds.push('(p.name LIKE @q OR p.sku LIKE @q)'); params.q = `%${q}%`; }
  if (category) { conds.push('p.category_id = @category'); params.category = Number(category); }
  const whFilter = warehouse ? 'AND l.warehouse_id = @warehouse' : '';
  if (warehouse) params.warehouse = Number(warehouse);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  let rows = db.prepare(`${productQuery(where, whFilter)} ORDER BY p.name`).all(params).map(withStatus);
  if (status) rows = rows.filter((p) => p.stock_status === status);
  res.json(rows);
});

router.get('/products/:id', (req, res) => {
  const pid = parse(id, req.params.id);
  const p = db.prepare(productQuery('WHERE p.id = @id')).get({ id: pid });
  if (!p) fail(404, 'Product not found');
  const locations = db.prepare(`SELECT l.id, ${LOC_LABEL('l')} AS label, w.name AS warehouse,
      COALESCE(q.quantity, 0) AS on_hand
    FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
    LEFT JOIN quants q ON q.location_id = l.id AND q.product_id = ?
    WHERE l.type = 'internal' ORDER BY w.id, l.id`).all(pid);
  res.json({ ...withStatus(p), locations });
});

router.post('/products', (req, res) => {
  const d = parse(productSchema.extend({
    initialQty: z.coerce.number().min(0, 'Cannot be negative').optional().default(0),
    locationId: id.optional(),
  }), req.body);
  const pid = tx(() => {
    const { lastInsertRowid } = db.prepare(`INSERT INTO products (name, sku, category_id, uom, unit_cost, reorder_min)
      VALUES (?, ?, ?, ?, ?, ?)`).run(d.name, d.sku, d.categoryId ?? null, d.uom, d.unitCost, d.reorderMin);
    if (d.initialQty > 0) {
      const loc = d.locationId ?? db.prepare(`SELECT id FROM locations WHERE type = 'internal' ORDER BY id LIMIT 1`).get()?.id;
      if (!loc) fail(422, 'Create a warehouse before adding stock');
      quickAdjust({ productId: lastInsertRowid, locationId: loc, counted: d.initialQty, userId: req.user.id });
    }
    return lastInsertRowid;
  });
  res.status(201).json(withStatus(db.prepare(productQuery('WHERE p.id = @id')).get({ id: pid })));
});

router.put('/products/:id', (req, res) => {
  const pid = parse(id, req.params.id);
  const d = parse(productSchema, req.body);
  const r = db.prepare(`UPDATE products SET name = ?, sku = ?, category_id = ?, uom = ?, unit_cost = ?, reorder_min = ?
    WHERE id = ?`).run(d.name, d.sku, d.categoryId ?? null, d.uom, d.unitCost, d.reorderMin, pid);
  if (!r.changes) fail(404, 'Product not found');
  res.json(withStatus(db.prepare(productQuery('WHERE p.id = @id')).get({ id: pid })));
});

router.delete('/products/:id', (req, res) => {
  const pid = parse(id, req.params.id);
  if (db.prepare('SELECT 1 FROM operation_lines WHERE product_id = ? LIMIT 1').get(pid)) {
    fail(409, 'This product appears in operations and cannot be deleted');
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(pid);
  res.status(204).end();
});

// "Update the stock from here": record a physical count for one location.
router.post('/products/:id/count', (req, res) => {
  const pid = parse(id, req.params.id);
  const d = parse(z.object({
    locationId: id,
    counted: z.coerce.number().min(0, 'Counted quantity cannot be negative'),
  }), req.body);
  if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid)) fail(404, 'Product not found');
  const op = quickAdjust({ productId: pid, locationId: d.locationId, counted: d.counted, userId: req.user.id });
  res.json({ reference: op.reference });
});

export default router;
