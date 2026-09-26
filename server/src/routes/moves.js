import { Router } from 'express';
import { db } from '../db.js';
import { LOC_LABEL } from '../services/stock.js';

const router = Router();

// Direction from the stock's point of view: into a warehouse, out of it, or shuffled inside.
const DIRECTION = `CASE
  WHEN s.type != 'internal' AND d.type = 'internal' THEN 'in'
  WHEN s.type = 'internal' AND d.type != 'internal' THEN 'out'
  ELSE 'internal' END`;

// Done moves come from the ledger; open operations contribute their planned lines.
const historyQuery = `
  SELECT * FROM (
    SELECT 'm' || m.id AS key, o.id AS operation_id, o.reference, o.type, o.contact, 'done' AS status,
      m.created_at AS date, m.quantity, p.id AS product_id, p.name AS product_name, p.sku, p.uom,
      ${LOC_LABEL('s')} AS from_label, ${LOC_LABEL('d')} AS to_label, ${DIRECTION} AS direction,
      o.warehouse_id, p.category_id
    FROM moves m
    JOIN operations o ON o.id = m.operation_id
    JOIN products p ON p.id = m.product_id
    JOIN locations s ON s.id = m.from_location_id
    JOIN locations d ON d.id = m.to_location_id
    UNION ALL
    SELECT 'l' || l.id, o.id, o.reference, o.type, o.contact, o.status,
      o.scheduled_date, l.quantity, p.id, p.name, p.sku, p.uom,
      ${LOC_LABEL('s')}, ${LOC_LABEL('d')}, ${DIRECTION}, o.warehouse_id, p.category_id
    FROM operation_lines l
    JOIN operations o ON o.id = l.operation_id
    JOIN products p ON p.id = l.product_id
    JOIN locations s ON s.id = o.source_location_id
    JOIN locations d ON d.id = o.dest_location_id
    WHERE o.status NOT IN ('done') AND o.type != 'adjustment'
  ) h`;

router.get('/', (req, res) => {
  const { q, status, type, product, warehouse, category, direction } = req.query;
  const conds = [];
  const params = {};
  if (q) { conds.push('(h.reference LIKE @q OR h.contact LIKE @q OR h.product_name LIKE @q OR h.sku LIKE @q)'); params.q = `%${q}%`; }
  if (status) { conds.push('h.status = @status'); params.status = status; }
  if (type) { conds.push('h.type = @type'); params.type = type; }
  if (direction) { conds.push('h.direction = @direction'); params.direction = direction; }
  if (product) { conds.push('h.product_id = @product'); params.product = Number(product); }
  if (warehouse) { conds.push('h.warehouse_id = @warehouse'); params.warehouse = Number(warehouse); }
  if (category) { conds.push('h.category_id = @category'); params.category = Number(category); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  res.json(db.prepare(`${historyQuery} ${where} ORDER BY h.date DESC, h.key DESC LIMIT 500`).all(params));
});

export default router;
