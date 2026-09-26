# StockSense — Master Plan (8-Hour Odoo Hackathon)

> Modular Inventory Management System: products, receipts, deliveries, internal transfers,
> adjustments, and a stock ledger — centralized, real-time, easy to use.

---

## 0. Winning Strategy (read this first)

1. **One source of truth: the Stock Ledger.** Every stock change (receipt, delivery, transfer,
   adjustment) is a row in `stock_moves`. Per-location quantities (`stock_quants`) are only
   updated inside the same DB transaction that writes the ledger row. This is exactly how Odoo
   works and judges will recognize it.
2. **One "Operation" engine, four types.** Receipts, Deliveries, Internal Transfers and
   Adjustments share one table (`operations`) + one line table (`operation_lines`) + one
   `validate()` function. Build it once, get four features.
3. **Own backend + real relational DB.** Odoo hackathons typically penalise BaaS
   (Firebase/Supabase) and static JSON. Use PostgreSQL with a proper schema, constraints and
   transactions.
4. **Working end-to-end flow > many half features.** The demo script in §9 must work
   perfectly by hour 6. Everything after that is polish.
5. **Commit early, commit often, everyone commits.** Git history from all members is often
   part of the judging.

---

## 1. Tech Stack

| Layer      | Choice                                   | Why |
|------------|------------------------------------------|-----|
| Frontend   | React + Vite + Tailwind CSS + React Router | Fast to scaffold, easy tables/forms |
| UI kit     | shadcn/ui (or plain Tailwind) + lucide-react icons | Clean look for free |
| Data fetch | TanStack Query (or axios + hooks)        | Caching + refetch after validate = "real-time" feel |
| Backend    | Node.js + Express                        | Simple REST |
| DB         | PostgreSQL                               | Transactions, FK constraints, CHECKs |
| ORM        | Prisma (or `pg` + raw SQL)               | Schema-as-code, migrations, seed script |
| Auth       | bcrypt + JWT (httpOnly cookie or Bearer) | No external auth service |
| OTP email  | Nodemailer (Gmail app password / Ethereal); **fallback: log OTP to server console** | Never block the demo on SMTP |
| Validation | Zod (shared on FE + BE)                  | Clean error messages |

Alternative if the team is Python-strong: FastAPI + SQLAlchemy + PostgreSQL, same design.

---

## 2. Architecture

```
React SPA  ──REST/JSON──►  Express API  ──Prisma──►  PostgreSQL
   │                          │
   │                          ├─ auth/        (signup, login, OTP reset, me)
   │                          ├─ products/    (CRUD, categories, stock per location, reorder rules)
   │                          ├─ warehouses/  (warehouses + locations)
   │                          ├─ operations/  (receipts / deliveries / internal / adjustments)
   │                          │     └─ services/stockService.validate()  ← the core
   │                          ├─ moves/       (ledger / move history, read-only)
   │                          └─ dashboard/   (KPIs + filters)
```

Folder layout:

```
/server
  prisma/schema.prisma, seed.js
  src/routes/*.js  src/controllers/*.js  src/services/stockService.js
  src/middleware/auth.js  src/middleware/error.js  src/utils/validators.js
/client
  src/pages/{Login,Signup,ForgotPassword,Dashboard,Products,ProductForm,
             Operations,OperationForm,MoveHistory,Warehouses,Profile}.jsx
  src/components/{Sidebar,KpiCard,StatusBadge,DataTable,FilterBar,LineItemsEditor}.jsx
  src/api/*.js
```

---

## 3. Data Model

```
users(id, name, email UNIQUE, password_hash, role['manager','staff'], created_at)
password_resets(id, user_id FK, otp_hash, expires_at, used BOOL)

warehouses(id, name, code UNIQUE, address)
locations(id, warehouse_id FK NULL, name, code, type['internal','vendor','customer','inventory_loss'])
   -- virtual locations: "Vendors", "Customers", "Inventory Adjustment" (warehouse_id NULL)

categories(id, name UNIQUE)
products(id, name, sku UNIQUE, category_id FK, uom, cost NULL, created_at)
reorder_rules(id, product_id FK, location_id FK NULL, min_qty, max_qty)

stock_quants(product_id FK, location_id FK, quantity NUMERIC, PRIMARY KEY(product_id, location_id))

operations(
  id, reference UNIQUE,              -- WH/IN/0001, WH/OUT/0001, WH/INT/0001, WH/ADJ/0001
  type ['receipt','delivery','internal','adjustment'],
  status ['draft','waiting','ready','done','canceled'],
  partner_name NULL,                 -- supplier or customer
  source_location_id FK, dest_location_id FK,
  scheduled_date, validated_at NULL, created_by FK, notes)

operation_lines(id, operation_id FK, product_id FK, quantity NUMERIC CHECK(quantity >= 0),
                counted_qty NULL)    -- counted_qty used by adjustments

stock_moves (THE LEDGER — append only)(
  id, operation_id FK NULL, product_id FK,
  from_location_id FK, to_location_id FK,
  quantity NUMERIC, created_at, user_id FK)
```

Why virtual locations: every move is simply **from → to**.

| Operation   | From                 | To                   |
|-------------|----------------------|----------------------|
| Receipt     | Vendors (virtual)    | WH/Stock             |
| Delivery    | WH/Stock             | Customers (virtual)  |
| Internal    | Rack A               | Rack B / Warehouse 2 |
| Adjustment  | Inventory Adj. (virtual) ↔ location (direction by sign of diff) | |

Quants are only kept for `internal` locations. "Total stock" = SUM(quants) over internal locations.

---

## 4. Core Logic — `validate(operationId)`

Runs in **one DB transaction** (`prisma.$transaction`):

```
op = load operation + lines (FOR UPDATE)
if op.status in ('done','canceled') → 400

for each line:
  if type == 'adjustment':
      current = quant(product, location).quantity
      diff = line.counted_qty - current
      if diff == 0: continue
      from,to = diff>0 ? (ADJ_VIRTUAL, location) : (location, ADJ_VIRTUAL)
      qty = abs(diff)
  else:
      from,to,qty = op.source, op.dest, line.quantity

  if from is internal:
      q = quant(product, from)
      if q.quantity < qty → throw "Insufficient stock for SKU X at LOC (have n, need m)"
      q.quantity -= qty
  if to is internal:
      upsert quant(product, to) += qty

  insert stock_moves(op, product, from, to, qty, user)

op.status = 'done'; op.validated_at = now()
```

Status flow (keep it simple but real):

```
Draft ──(Mark as Todo / Confirm)──► Waiting ──(stock available check)──► Ready ──(Validate)──► Done
   └──────────────────────────── Cancel ─────────────────────────────────────► Canceled
```

- Receipt: Draft → Ready → Done (no availability check needed).
- Delivery: Draft → `checkAvailability()` → Ready if all lines available, else Waiting.
  "Pick" and "Pack" can be two checkboxes/steps on the delivery form before Validate.
- Adjustment: Draft → Done (apply).

Low stock = product total qty ≤ reorder rule `min_qty` (or default threshold e.g. 10).
Out of stock = total qty == 0.

---

## 5. REST API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/auth/signup | create user |
| POST | /api/auth/login | JWT |
| POST | /api/auth/forgot-password | generate 6-digit OTP (hashed, 10-min expiry), email it |
| POST | /api/auth/reset-password | email + otp + new password |
| GET  | /api/auth/me · PUT /api/auth/me | profile |
| GET/POST/PUT/DELETE | /api/products | `?search=&category=&status=low|out` |
| GET | /api/products/:id/stock | qty per location |
| GET/POST | /api/categories | |
| GET/POST/PUT/DELETE | /api/reorder-rules | |
| GET/POST/PUT | /api/warehouses, /api/locations | settings |
| GET | /api/operations | `?type=&status=&warehouse=&category=&search=` |
| POST/PUT | /api/operations | create/edit draft with lines |
| POST | /api/operations/:id/confirm · /check-availability · /validate · /cancel | state transitions |
| GET | /api/moves | ledger, `?product=&location=&type=&from=&to=` |
| GET | /api/dashboard | KPIs + low-stock list + recent operations (accepts same filters) |

---

## 6. Screens (map to the mockup)

1. **Auth**: Login, Signup, Forgot Password (email → OTP → new password).
2. **Left sidebar**: Dashboard · Products · Operations (Receipts, Deliveries, Internal
   Transfers, Adjustments) · Move History · Settings (Warehouses/Locations) · Profile (My Profile, Logout).
3. **Dashboard**: 5 KPI cards (Total Products in Stock, Low/Out of Stock, Pending Receipts,
   Pending Deliveries, Internal Transfers Scheduled) → clicking a card opens the filtered list.
   Filter bar: document type, status, warehouse/location, category. Low-stock alert panel + recent operations table.
4. **Products**: searchable table (name, SKU, category, UoM, on hand, status badge),
   create/edit form (initial stock optional → creates an adjustment move), detail page with
   stock-per-location table and reorder rules.
5. **Operations list** (one component, filtered by type): reference, partner, from, to,
   scheduled date, status badge. Optional Kanban toggle by status (nice Odoo touch).
6. **Operation form**: header (partner, locations, date) + line items editor (product
   autocomplete by SKU/name, qty, available qty shown) + action buttons per status
   (Confirm, Check Availability, Validate, Cancel). Adjustment form shows *system qty* vs
   *counted qty* vs *difference*.
7. **Move History**: ledger table with +/− coloured quantities, filters, per-product view.
8. **Settings**: warehouses & locations CRUD.
9. **Profile**: name/email, change password, logout.

---

## 7. Priority Tiers

**P0 — must work (MVP, by hour 5)**
- Signup/Login/JWT, protected routes
- Products CRUD + categories + SKU search
- Warehouses/locations (seeded)
- Receipts, Deliveries, Internal Transfers, Adjustments with validate() + ledger
- Move History
- Dashboard KPIs

**P1 — should (by hour 6.5)**
- OTP password reset
- Dashboard dynamic filters
- Low stock alerts + reorder rules
- Delivery availability check / Waiting vs Ready, Pick/Pack steps
- Stock per location on product page

**P2 — wow factor (only if time)**
- Kanban view of operations by status
- Chart on dashboard (stock movements last 7 days — Recharts)
- Auto-refresh dashboard (polling 10 s or Socket.io)
- CSV export of ledger, print/PDF of delivery slip
- Role-based UI (manager vs staff), dark mode

---

## 8. 8-Hour Timeline (team of 4; solo/2-person notes below)

Roles: **A** = Backend core (DB, operations engine) · **B** = Backend auth + products + dashboard
API · **C** = Frontend shell, auth, dashboard · **D** = Frontend products + operations + ledger.

| Time | A | B | C | D |
|------|---|---|---|---|
| **0:00–0:30** | *All together*: read mockup, freeze schema (§3) & API (§5), create repo, scaffold `/server` + `/client`, `.env.example` | | | |
| 0:30–1:30 | Prisma schema, migration, **seed script** (users, 2 warehouses, locations, virtual locations, categories, 15 products, some stock) | Express setup, error middleware, auth (signup/login/JWT/me) | Vite + Tailwind + router, layout + sidebar, Login/Signup pages wired | Reusable DataTable, StatusBadge, FilterBar, form inputs |
| 1:30–3:00 | Operations CRUD + lines, reference generator, **validate()** with transaction + ledger | Products/categories/locations/warehouses CRUD, search & filters | Dashboard page w/ KPI cards (mock data → real) | Products list/form/detail |
| 3:00–4:30 | confirm/check-availability/cancel, adjustments logic, moves API | Dashboard KPI API + filters, OTP reset (console fallback first) | Forgot password flow, Profile page, Settings (warehouses/locations) | Operations list + Operation form with line editor, action buttons |
| 4:30–5:30 | **Integration**: run full demo flow (§9) end to end, fix bugs | Reorder rules + low-stock query | Dashboard filters, low stock alert panel | Move History page, adjustment form (system vs counted) |
| 5:30–6:30 | Edge cases: negative stock, double validate, validation errors | Nodemailer real email, input validation (Zod) on all routes | UI polish, toasts, loading/empty states, responsive | Pick/Pack steps, Kanban (P2) |
| 6:30–7:30 | **Feature freeze.** Bug bash together, re-seed clean demo data, README + screenshots | | | |
| 7:30–8:00 | Record demo video / rehearse pitch, final commit & push | | | |

**Solo / 2 people:** skip Kanban, charts, real email (console OTP), and build the Operation
form once generic by `type`. Order: schema+seed → auth → products → operations+validate →
ledger → dashboard → OTP → filters → polish.

**Hard checkpoints**
- 1:30 — DB seeded, login works.
- 3:00 — A receipt can be validated via API (Postman/curl) and stock increases.
- 5:00 — Full demo flow works in the UI.
- 6:30 — Feature freeze. No new features after this.

---

## 9. Demo Script (maps to problem statement example)

1. Sign up → log in → land on Dashboard (show KPIs).
2. Forgot password → OTP → reset (show email/console).
3. Products → create "Steel" (SKU STL-001, kg) with no stock. Show category, reorder rule min 20.
4. **Receipt** from "Tata Steel": 100 kg Steel → Validate → stock **+100** at WH/Stock.
5. **Internal transfer** WH/Stock → Production Rack 100 kg → totals unchanged, location changed (product stock-per-location view).
6. **Delivery** 20 Steel Frames to customer → Check availability → Pick → Pack → Validate → **−20**.
   Try delivering more than available → friendly error (shows data integrity).
7. **Adjustment** Steel at Production Rack: system 100, counted 97 → **−3** logged.
8. **Move History** → every step visible in the ledger with +/−.
9. Dashboard → KPIs changed, low-stock alert triggers, filters by type/status/warehouse/category.

---

## 10. Quality Checklist (what judges look at)

- [ ] Proper relational schema, FKs, unique SKU, CHECK constraints, transactions
- [ ] Input validation on backend AND frontend with clear messages
- [ ] No negative stock possible; no double-validation
- [ ] Passwords hashed, OTP hashed + expiring, JWT-protected routes
- [ ] Clean folder structure, reusable components, no hard-coded data in UI
- [ ] Consistent UI, loading/empty/error states, toasts
- [ ] Meaningful commits from every member, `.env.example`, README with setup + screenshots
- [ ] Seed script so judges can run it in 2 commands

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SMTP fails during demo | OTP also logged to console / shown in dev mode |
| Schema changes mid-way break teammates | Freeze schema at 0:30; one person owns migrations |
| Integration hell at the end | Integrate at 4:30, not 7:00; share API contract early |
| Scope creep | P0 → P1 → P2 strictly; feature freeze 6:30 |
| DB setup issues on machines | Docker `postgres` one-liner or hosted free Postgres (Neon) as backup |

---

## 12. Kickoff Commands

```bash
# server
mkdir server && cd server && npm init -y
npm i express cors dotenv bcrypt jsonwebtoken zod nodemailer @prisma/client
npm i -D prisma nodemon && npx prisma init

# client
npm create vite@latest client -- --template react
cd client && npm i react-router-dom axios @tanstack/react-query lucide-react react-hot-toast recharts
npm i -D tailwindcss @tailwindcss/vite

# db
docker run -d --name stocksense-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```
