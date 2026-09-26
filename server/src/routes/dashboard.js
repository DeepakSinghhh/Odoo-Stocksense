import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const warehouse = Number(req.query.warehouse) || null;
  const category = Number(req.query.category) || null;
  const p = { warehouse, category };

  const opScope = `(@warehouse IS NULL OR o.warehouse_id = @warehouse)
    AND (@category IS NULL OR EXISTS (SELECT 1 FROM operation_lines l JOIN products pr ON pr.id = l.product_id
         WHERE l.operation_id = o.id AND pr.category_id = @category))`;

  const card = (type) => db.prepare(`SELECT
      SUM(o.status = 'ready') AS ready,
      SUM(o.status = 'waiting') AS waiting,
      SUM(o.status = 'draft') AS draft,
      SUM(o.status NOT IN ('done','canceled') AND o.scheduled_date < date('now')) AS late,
      SUM(o.status NOT IN ('done','canceled') AND o.scheduled_date > date('now')) AS upcoming,
      SUM(o.status NOT IN ('done','canceled')) AS open,
      SUM(o.status = 'done' AND date(o.done_at) = date('now')) AS done_today
    FROM operations o WHERE o.type = '${type}' AND ${opScope}`).get(p);

  const products = db.prepare(`SELECT p.id, p.name, p.sku, p.uom, p.reorder_min,
      COALESCE((SELECT SUM(q.quantity) FROM quants q JOIN locations l ON l.id = q.location_id
        WHERE q.product_id = p.id AND (@warehouse IS NULL OR l.warehouse_id = @warehouse)), 0) AS on_hand
    FROM products p WHERE (@category IS NULL OR p.category_id = @category)`).all(p);

  const low = products.filter((x) => x.on_hand > 0 && x.on_hand <= x.reorder_min);
  const out = products.filter((x) => x.on_hand <= 0);

  // Units in vs out per day for the last 14 days (ledger based).
  const flow = db.prepare(`WITH RECURSIVE days(d) AS (
      SELECT date('now', '-13 days') UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date('now'))
    SELECT days.d AS day,
      COALESCE(SUM(CASE WHEN s.type != 'internal' AND t.type = 'internal' THEN m.quantity END), 0) AS in_qty,
      COALESCE(SUM(CASE WHEN s.type = 'internal' AND t.type != 'internal' THEN m.quantity END), 0) AS out_qty
    FROM days
    LEFT JOIN moves m ON date(m.created_at) = days.d
      AND (@category IS NULL OR m.product_id IN (SELECT id FROM products WHERE category_id = @category))
    LEFT JOIN locations s ON s.id = m.from_location_id
    LEFT JOIN locations t ON t.id = m.to_location_id
    WHERE (@warehouse IS NULL OR m.id IS NULL OR s.warehouse_id = @warehouse OR t.warehouse_id = @warehouse)
    GROUP BY days.d ORDER BY days.d`).all(p);

  res.json({
    receipt: card('receipt'),
    delivery: card('delivery'),
    internal: card('internal'),
    kpis: {
      productsInStock: products.filter((x) => x.on_hand > 0).length,
      totalUnits: products.reduce((sum, x) => sum + Math.max(0, x.on_hand), 0),
      productCount: products.length,
      lowStock: low.length,
      outOfStock: out.length,
    },
    alerts: [...out.map((x) => ({ ...x, level: 'out' })), ...low.map((x) => ({ ...x, level: 'low' }))].slice(0, 8),
    flow,
  });
});

export default router;
