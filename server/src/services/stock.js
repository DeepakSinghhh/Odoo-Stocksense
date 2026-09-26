import { db, tx } from '../db.js';
import { fail } from '../middleware/error.js';

export const TYPE_CODE = { receipt: 'IN', delivery: 'OUT', internal: 'INT', adjustment: 'ADJ' };

// Warehouse-qualified label such as "WH/Stock1"; virtual locations fall back to their name.
export const LOC_LABEL = (alias) =>
  `COALESCE((SELECT w.code FROM warehouses w WHERE w.id = ${alias}.warehouse_id) || '/' || ${alias}.code, ${alias}.name)`;

const isInternal = (locationId) =>
  db.prepare('SELECT type FROM locations WHERE id = ?').get(locationId)?.type === 'internal';

export const onHand = (productId, locationId) =>
  db.prepare('SELECT quantity FROM quants WHERE product_id = ? AND location_id = ?')
    .get(productId, locationId)?.quantity ?? 0;

// Quantity promised to outgoing operations that are already Ready (i.e. reserved).
export const reserved = (productId, locationId, excludeOpId = 0) =>
  db.prepare(`SELECT COALESCE(SUM(l.quantity), 0) AS q
    FROM operation_lines l JOIN operations o ON o.id = l.operation_id
    WHERE l.product_id = ? AND o.source_location_id = ? AND o.status = 'ready'
      AND o.type IN ('delivery','internal') AND o.id != ?`).get(productId, locationId, excludeOpId).q;

export const freeQty = (productId, locationId, excludeOpId) =>
  onHand(productId, locationId) - reserved(productId, locationId, excludeOpId);

export function nextReference(warehouseId, type) {
  const wh = db.prepare('SELECT code FROM warehouses WHERE id = ?').get(warehouseId);
  if (!wh) fail(422, 'Unknown warehouse');
  const prefix = `${wh.code}/${TYPE_CODE[type]}/`;
  const last = db.prepare(`SELECT reference FROM operations WHERE reference LIKE ? || '%'
    ORDER BY CAST(substr(reference, length(?) + 1) AS INTEGER) DESC LIMIT 1`).get(prefix, prefix);
  const n = last ? parseInt(last.reference.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(4, '0');
}

const getOp = (id) => {
  const op = db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
  if (!op) fail(404, 'Operation not found');
  op.lines = db.prepare('SELECT * FROM operation_lines WHERE operation_id = ?').all(id);
  return op;
};

// Per-product demand vs free stock at the source location.
export function availability(op) {
  const needs = new Map();
  for (const l of op.lines) needs.set(l.product_id, (needs.get(l.product_id) || 0) + l.quantity);
  const result = {};
  for (const [productId, need] of needs) {
    const free = op.type === 'receipt' ? Infinity : freeQty(productId, op.source_location_id, op.id);
    result[productId] = { need, free, short: Math.max(0, need - free) };
  }
  return result;
}

const allAvailable = (op) => Object.values(availability(op)).every((a) => a.short === 0);

function move(op, productId, from, to, qty, userId) {
  if (qty <= 0) return;
  if (isInternal(from)) {
    const have = onHand(productId, from);
    if (have < qty) {
      const p = db.prepare('SELECT sku, name FROM products WHERE id = ?').get(productId);
      fail(409, `Not enough [${p.sku}] ${p.name}: ${have} on hand, ${qty} needed`);
    }
    db.prepare('UPDATE quants SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?')
      .run(qty, productId, from);
  }
  if (isInternal(to)) {
    db.prepare(`INSERT INTO quants (product_id, location_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = quantity + excluded.quantity`)
      .run(productId, to, qty);
  }
  db.prepare(`INSERT INTO moves (operation_id, product_id, from_location_id, to_location_id, quantity, user_id)
    VALUES (?, ?, ?, ?, ?, ?)`).run(op.id, productId, from, to, qty, userId);
}

const setStatus = (id, status) =>
  db.prepare(`UPDATE operations SET status = ?, done_at = CASE WHEN ? = 'done' THEN datetime('now') END
    WHERE id = ?`).run(status, status, id);

/** "To Do": Draft → Ready (receipts) or Ready/Waiting depending on stock (deliveries, transfers). */
export const confirm = (id) => tx(() => {
  const op = getOp(id);
  if (op.status !== 'draft') fail(409, 'Only draft operations can be confirmed');
  if (!op.lines.length) fail(422, 'Add at least one product line');
  if (op.type === 'adjustment') fail(409, 'Adjustments are applied directly');
  setStatus(id, op.type === 'receipt' || allAvailable(op) ? 'ready' : 'waiting');
  return getOp(id);
});

export const checkAvailability = (id) => tx(() => {
  const op = getOp(id);
  if (!['waiting', 'ready'].includes(op.status)) fail(409, 'Nothing to check in this state');
  setStatus(id, allAvailable(op) ? 'ready' : 'waiting');
  return getOp(id);
});

/** Validate: writes ledger rows and moves the quantities. Everything or nothing. */
export const validate = (id, userId) => tx(() => {
  const op = getOp(id);
  if (op.status === 'done') fail(409, 'Already validated');
  if (op.status === 'canceled') fail(409, 'Canceled operations cannot be validated');
  if (!op.lines.length) fail(422, 'Add at least one product line');

  if (op.type === 'adjustment') {
    // Lines carry the counted quantity; the ledger records the difference.
    for (const l of op.lines) {
      const diff = l.quantity - onHand(l.product_id, op.source_location_id);
      if (diff > 0) move(op, l.product_id, op.dest_location_id, op.source_location_id, diff, userId);
      if (diff < 0) move(op, l.product_id, op.source_location_id, op.dest_location_id, -diff, userId);
    }
  } else {
    if (op.status !== 'ready') {
      fail(409, op.status === 'waiting' ? 'Waiting for stock — check availability first' : 'Mark it as To Do first');
    }
    for (const l of op.lines) move(op, l.product_id, op.source_location_id, op.dest_location_id, l.quantity, userId);
  }
  setStatus(id, 'done');
  return getOp(id);
});

export const cancel = (id) => tx(() => {
  const op = getOp(id);
  if (['done', 'canceled'].includes(op.status)) fail(409, `A ${op.status} operation cannot be canceled`);
  setStatus(id, 'canceled');
  return getOp(id);
});

// Default locations for a new operation of a type in a warehouse.
export function defaultLocations(warehouseId, type) {
  const stock = db.prepare(`SELECT id FROM locations WHERE warehouse_id = ? AND type = 'internal'
    ORDER BY id LIMIT 1`).get(warehouseId)?.id;
  const virtual = (t) => db.prepare('SELECT id FROM locations WHERE type = ? ORDER BY id LIMIT 1').get(t)?.id;
  switch (type) {
    case 'receipt': return { source: virtual('vendor'), dest: stock };
    case 'delivery': return { source: stock, dest: virtual('customer') };
    case 'adjustment': return { source: stock, dest: virtual('adjustment') };
    default: return { source: stock, dest: stock };
  }
}

/** One-shot count used by the Stock page: creates and applies an adjustment. */
export const quickAdjust = ({ productId, locationId, counted, userId }) => tx(() => {
  const loc = db.prepare('SELECT * FROM locations WHERE id = ? AND type = ?').get(locationId, 'internal');
  if (!loc) fail(422, 'Pick a warehouse location');
  const { dest } = defaultLocations(loc.warehouse_id, 'adjustment');
  const { lastInsertRowid } = db.prepare(`INSERT INTO operations
    (reference, type, warehouse_id, source_location_id, dest_location_id, responsible_id, contact)
    VALUES (?, 'adjustment', ?, ?, ?, ?, 'Stock count')`)
    .run(nextReference(loc.warehouse_id, 'adjustment'), loc.warehouse_id, locationId, dest, userId);
  db.prepare('INSERT INTO operation_lines (operation_id, product_id, quantity) VALUES (?, ?, ?)')
    .run(lastInsertRowid, productId, counted);
  return validate(lastInsertRowid, userId);
});
