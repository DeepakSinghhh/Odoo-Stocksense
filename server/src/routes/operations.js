import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db.js';
import { parse, fail } from '../middleware/error.js';
import {
  LOC_LABEL, nextReference, defaultLocations, availability,
  confirm, checkAvailability, validate, cancel, onHand,
} from '../services/stock.js';

const router = Router();
const id = z.coerce.number().int().positive();
const TYPES = ['receipt', 'delivery', 'internal', 'adjustment'];

const listQuery = `
  SELECT o.*, ${LOC_LABEL('s')} AS source_label, ${LOC_LABEL('d')} AS dest_label,
    w.name AS warehouse_name, w.code AS warehouse_code, u.name AS responsible_name,
    (SELECT COUNT(*) FROM operation_lines l WHERE l.operation_id = o.id) AS line_count,
    (SELECT COALESCE(SUM(l.quantity), 0) FROM operation_lines l WHERE l.operation_id = o.id) AS total_qty,
    CASE WHEN o.status NOT IN ('done','canceled') AND o.scheduled_date < date('now') THEN 1 ELSE 0 END AS late
  FROM operations o
  JOIN locations s ON s.id = o.source_location_id
  JOIN locations d ON d.id = o.dest_location_id
  JOIN warehouses w ON w.id = o.warehouse_id
  LEFT JOIN users u ON u.id = o.responsible_id`;

router.get('/', (req, res) => {
  const { type, status, warehouse, category, q, late } = req.query;
  const conds = [];
  const params = {};
  if (type) { conds.push('o.type = @type'); params.type = type; }
  if (status) { conds.push('o.status = @status'); params.status = status; }
  if (warehouse) { conds.push('o.warehouse_id = @warehouse'); params.warehouse = Number(warehouse); }
  if (category) {
    conds.push(`EXISTS (SELECT 1 FROM operation_lines l JOIN products p ON p.id = l.product_id
      WHERE l.operation_id = o.id AND p.category_id = @category)`);
    params.category = Number(category);
  }
  if (q) { conds.push('(o.reference LIKE @q OR o.contact LIKE @q)'); params.q = `%${q}%`; }
  if (late === '1') conds.push(`o.status NOT IN ('done','canceled') AND o.scheduled_date < date('now')`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  res.json(db.prepare(`${listQuery} ${where} ORDER BY o.id DESC`).all(params));
});

// Blank form values for "New"; the reference is only reserved on save.
router.get('/defaults', (req, res) => {
  const type = parse(z.enum(TYPES), req.query.type);
  const warehouseId = Number(req.query.warehouse) || db.prepare('SELECT id FROM warehouses ORDER BY id LIMIT 1').get()?.id;
  if (!warehouseId) fail(422, 'Create a warehouse first');
  const { source, dest } = defaultLocations(warehouseId, type);
  res.json({
    type, warehouseId, sourceLocationId: source, destLocationId: dest,
    reference: nextReference(warehouseId, type),
    responsibleId: req.user.id,
    scheduledDate: new Date().toISOString().slice(0, 10),
  });
});

function detail(opId) {
  const op = db.prepare(`${listQuery} WHERE o.id = ?`).get(opId);
  if (!op) fail(404, 'Operation not found');
  const lines = db.prepare(`SELECT l.*, p.name AS product_name, p.sku, p.uom
    FROM operation_lines l JOIN products p ON p.id = l.product_id WHERE l.operation_id = ? ORDER BY l.id`).all(opId);
  const avail = availability({ ...op, lines });
  op.lines = lines.map((l) => ({
    ...l,
    on_hand: onHand(l.product_id, op.source_location_id),
    free: Number.isFinite(avail[l.product_id].free) ? avail[l.product_id].free : null,
    short: ['done', 'canceled'].includes(op.status) ? 0 : avail[l.product_id].short,
  }));
  return op;
}

router.get('/:id', (req, res) => res.json(detail(parse(id, req.params.id))));

const opSchema = z.object({
  type: z.enum(TYPES),
  warehouseId: id,
  contact: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  sourceLocationId: id,
  destLocationId: id,
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a schedule date'),
  responsibleId: id.nullable().optional(),
  notes: z.string().max(500).optional().default(''),
  lines: z.array(z.object({
    productId: id,
    quantity: z.coerce.number().min(0, 'Quantity cannot be negative'),
  })).default([]),
});

function checkLocations(d) {
  const loc = (lid) => db.prepare('SELECT * FROM locations WHERE id = ?').get(lid);
  const s = loc(d.sourceLocationId);
  const t = loc(d.destLocationId);
  if (!s || !t) fail(422, 'Unknown location');
  if (d.type !== 'receipt' && s.type !== 'internal') fail(422, 'Source must be a warehouse location', { sourceLocationId: 'Pick a warehouse location' });
  if (['receipt', 'internal'].includes(d.type) && t.type !== 'internal') fail(422, 'Destination must be a warehouse location', { destLocationId: 'Pick a warehouse location' });
  if (d.type === 'internal' && s.id === t.id) fail(422, 'Source and destination must differ', { destLocationId: 'Pick a different location' });
  for (const l of d.lines) {
    if (d.type !== 'adjustment' && l.quantity <= 0) fail(422, 'Quantities must be greater than zero');
  }
}

const writeLines = (opId, lines) => {
  db.prepare('DELETE FROM operation_lines WHERE operation_id = ?').run(opId);
  const ins = db.prepare('INSERT INTO operation_lines (operation_id, product_id, quantity) VALUES (?, ?, ?)');
  for (const l of lines) ins.run(opId, l.productId, l.quantity);
};

router.post('/', (req, res) => {
  const d = parse(opSchema, req.body);
  checkLocations(d);
  const opId = tx(() => {
    const { lastInsertRowid } = db.prepare(`INSERT INTO operations
      (reference, type, warehouse_id, contact, address, source_location_id, dest_location_id,
       scheduled_date, responsible_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(nextReference(d.warehouseId, d.type), d.type, d.warehouseId, d.contact, d.address,
        d.sourceLocationId, d.destLocationId, d.scheduledDate, d.responsibleId ?? req.user.id, d.notes);
    writeLines(lastInsertRowid, d.lines);
    return lastInsertRowid;
  });
  res.status(201).json(detail(opId));
});

router.put('/:id', (req, res) => {
  const opId = parse(id, req.params.id);
  const d = parse(opSchema, req.body);
  checkLocations(d);
  tx(() => {
    const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(opId);
    if (!op) fail(404, 'Operation not found');
    if (['done', 'canceled'].includes(op.status)) fail(409, `A ${op.status} operation is locked`);
    db.prepare(`UPDATE operations SET contact = ?, address = ?, source_location_id = ?, dest_location_id = ?,
      scheduled_date = ?, responsible_id = ?, notes = ? WHERE id = ?`)
      .run(d.contact, d.address, d.sourceLocationId, d.destLocationId, d.scheduledDate,
        d.responsibleId ?? null, d.notes, opId);
    writeLines(opId, d.lines);
    // Edited lines may change what is reservable; re-evaluate outgoing operations.
    if (op.status !== 'draft' && op.type !== 'receipt') checkAvailability(opId);
  });
  res.json(detail(opId));
});

const action = (fn) => (req, res) => {
  const opId = parse(id, req.params.id);
  fn(opId, req.user.id);
  res.json(detail(opId));
};

router.post('/:id/confirm', action(confirm));
router.post('/:id/check', action(checkAvailability));
router.post('/:id/validate', action(validate));
router.post('/:id/cancel', action(cancel));

router.delete('/:id', (req, res) => {
  const opId = parse(id, req.params.id);
  const op = db.prepare('SELECT status FROM operations WHERE id = ?').get(opId);
  if (!op) fail(404, 'Operation not found');
  if (op.status !== 'draft') fail(409, 'Only drafts can be deleted — cancel it instead');
  db.prepare('DELETE FROM operations WHERE id = ?').run(opId);
  res.status(204).end();
});

export default router;
