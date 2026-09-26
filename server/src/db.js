import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.join(here, '..', 'stocksense.db');

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  login_id      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash   TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouses (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  code    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  address TEXT
);

-- internal = real shelves/rooms; vendor/customer/adjustment = virtual counterpart locations
CREATE TABLE IF NOT EXISTS locations (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT NOT NULL,
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'internal'
               CHECK (type IN ('internal','vendor','customer','adjustment')),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  sku         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  uom         TEXT NOT NULL DEFAULT 'Units',
  unit_cost   REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reorder_min REAL NOT NULL DEFAULT 0 CHECK (reorder_min >= 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- on-hand quantity per product per internal location (derived from the ledger, kept in sync transactionally)
CREATE TABLE IF NOT EXISTS quants (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity    REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS operations (
  id                 INTEGER PRIMARY KEY,
  reference          TEXT NOT NULL UNIQUE,
  type               TEXT NOT NULL CHECK (type IN ('receipt','delivery','internal','adjustment')),
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','waiting','ready','done','canceled')),
  warehouse_id       INTEGER NOT NULL REFERENCES warehouses(id),
  contact            TEXT,
  address            TEXT,
  source_location_id INTEGER NOT NULL REFERENCES locations(id),
  dest_location_id   INTEGER NOT NULL REFERENCES locations(id),
  scheduled_date     TEXT NOT NULL DEFAULT (date('now')),
  responsible_id     INTEGER REFERENCES users(id),
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  done_at            TEXT
);

CREATE TABLE IF NOT EXISTS operation_lines (
  id           INTEGER PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  quantity     REAL NOT NULL CHECK (quantity >= 0)
);

-- the stock ledger: append-only, one row per product movement
CREATE TABLE IF NOT EXISTS moves (
  id               INTEGER PRIMARY KEY,
  operation_id     INTEGER REFERENCES operations(id),
  product_id       INTEGER NOT NULL REFERENCES products(id),
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id   INTEGER NOT NULL REFERENCES locations(id),
  quantity         REAL NOT NULL CHECK (quantity > 0),
  user_id          INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ops_type_status ON operations(type, status);
CREATE INDEX IF NOT EXISTS idx_lines_op ON operation_lines(operation_id);
CREATE INDEX IF NOT EXISTS idx_moves_product ON moves(product_id);
`);

export const tx = (fn) => db.transaction(fn)();
