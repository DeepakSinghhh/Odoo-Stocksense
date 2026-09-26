# StockSense

**A modular inventory management system that replaces registers and spreadsheets with one live stock ledger.**

### 🔗 Live demo: **https://stocksense-flto.onrender.com**
Sign in with **`admin01` / `Admin@1234`** (second user: `ravi.k` / `Ravi@12345`) or sign up your own account.
Open it in two windows side by side to watch changes appear live.

![Dashboard](docs/guide/07-dashboard.png)

---

## Contents

1. [Features at a glance](#features-at-a-glance)
2. [User guide (step by step, with screenshots)](#user-guide)
   - [Sign in, sign up, reset password](#1-sign-in-sign-up-reset-password)
   - [Getting around](#2-getting-around)
   - [Dashboard](#3-dashboard)
   - [Receipts: receive goods](#4-receipts--receive-goods-from-a-vendor)
   - [Deliveries: ship goods](#5-deliveries--ship-goods-to-a-customer)
   - [Internal transfers](#6-internal-transfers--move-stock-between-locations)
   - [Adjustments: fix a count](#7-adjustments--fix-a-mismatch-after-a-physical-count)
   - [Cancel or delete an operation](#8-cancel-or-delete-an-operation)
   - [Products & stock: add, update, edit, delete](#9-products--stock)
   - [Move history](#10-move-history-the-stock-ledger)
   - [Settings: warehouses & locations](#11-settings--warehouses--locations)
   - [Profile, theme, logout](#12-profile-theme-logout)
   - [Real-time updates](#13-real-time-updates)
3. [Status & button reference](#status--button-reference)
4. [Rules the system enforces](#rules-the-system-enforces)
5. [5-minute demo script](#5-minute-demo-script)
6. [Run it locally](#run-it-locally)
7. [Deploy](#deploy)
8. [How it works](#how-it-works)
9. [Tech stack & project structure](#tech-stack--project-structure)
10. [Testing](#testing)

---

## Features at a glance

| Area | What you can do |
|---|---|
| **Authentication** | Sign up (login ID 6–12 chars, unique email, strong password), sign in, OTP password reset, logout |
| **Dashboard** | Receipt & Delivery cards (to receive / to deliver, late, waiting), 6 live KPIs, 14-day stock flow chart, reorder alerts, filters by document type, status, warehouse, category |
| **Receipts** | Receive goods from vendors: Draft → Ready → Done, stock increases automatically, printable goods receipt |
| **Deliveries** | Ship to customers: Draft → Waiting → Ready → Done, out-of-stock lines turn red, stock decreases automatically, printable delivery slip |
| **Internal transfers** | Move stock between racks, floors or warehouses: totals unchanged, locations updated |
| **Adjustments** | Enter a physical count and the system logs the difference |
| **Products & stock** | Create, edit and delete products (SKU, category, UoM, cost, reorder level, initial stock), update stock inline, per-location breakdown, low / out-of-stock filters, SKU search |
| **Move history** | Every movement, one row per product, in green / out red, search, filters, Kanban |
| **Settings** | Add, edit and delete warehouses and locations |
| **Real-time** | Every open screen updates instantly when anyone changes data, with no refresh |
| **Extras** | List & Kanban views everywhere, printable slips with barcodes, day/night theme, multi-warehouse references (`WH/IN/0001`, `CD/OUT/0003`) |

---

## User guide

### 1. Sign in, sign up, reset password

**Sign in:** enter your **Login Id** and **Password** and click **Sign in**.
A wrong login shows *"Invalid Login Id or Password"*.

| Sign in | Wrong password |
|---|---|
| ![Login](docs/guide/01-login.png) | ![Login error](docs/guide/02-login-error.png) |

**Sign up:** click **Sign Up** on the login screen and fill in Login Id, Email, Password and Re-Enter Password.
The rules are checked as you type and again on the server:
- Login ID: **6–12 characters**, must be unique
- Email: valid and not already registered
- Password: **more than 8 characters**, with a **lowercase**, an **uppercase** and a **special character**
- Both passwords must match

| Invalid input is flagged | Valid sign-up |
|---|---|
| ![Signup validation](docs/guide/03-signup-validation.png) | ![Signup valid](docs/guide/04-signup-valid.png) |

**Forgot password:**
1. On the login screen click **Forget Password ?**
2. Enter your email and click **Send OTP**.
3. Enter the 6-digit code (valid for 10 minutes, 5 attempts), type a new password twice and click **Reset password**.
4. Sign in with the new password. The old password and the used code stop working.

> If no mail server is configured, the code is shown on the reset screen (the yellow note) and printed in the
> server console, so the flow always works in a demo. Add `SMTP_*` settings to send it by email.

| Step 1: request the code | Step 2: enter code + new password |
|---|---|
| ![Forgot email](docs/guide/05-forgot-email.png) | ![Forgot OTP](docs/guide/06-forgot-otp.png) |

### 2. Getting around

The top bar follows the wireframe: **Dashboard · Operations · Products · Move History · Settings**, with the
profile button (your initial) on the right. The green **LIVE** dot means real-time updates are connected.

| Operations menu | Settings menu | Profile menu |
|---|---|---|
| ![Operations menu](docs/guide/09-menu-operations.png) | ![Settings menu](docs/guide/10-menu-settings.png) | ![Profile menu](docs/guide/11-menu-profile.png) |

### 3. Dashboard

The landing page after sign-in (see the screenshot at the top of this file).

- **Receipt card:** the big **"N to receive"** button opens the receipts that are Ready. Next to it: **Late**
  (scheduled date has passed), **Operations** (scheduled for later) and **Draft**.
- **Delivery card:** **"N to deliver"**, plus **Late**, **Waiting** (not enough stock) and **Operations**.
- **KPI board:** products in stock, low stock, out of stock, pending receipts, pending deliveries, transfers
  scheduled. Click any tile to open that list.
- **Stock flow · 14 days:** units in (blue, above the line) vs units out (red, below). Hover a day for the numbers.
- **Reorder alerts:** products at or below their reorder level.
- **Filters:** narrow everything by **Document** type, **Status**, **Warehouse** and **Category**. **Clear** resets them.

![Dashboard filtered to waiting deliveries](docs/guide/08-dashboard-filters.png)

### 4. Receipts: receive goods from a vendor

**Find receipts:** Operations → Receipts. The list shows Reference, From, To, Contact, Schedule date and Status.
- 🔍 **Search** by reference or contact
- ☰ / ▦ switch between **List** and **Kanban** (grouped by status)
- The chips (All / Draft / Ready / Done / Canceled / Late) filter by status

| List | Search "Azure" | Kanban by status |
|---|---|---|
| ![Receipts list](docs/guide/12-receipts-list.png) | ![Receipts search](docs/guide/13-receipts-search.png) | ![Receipts kanban](docs/guide/14-receipts-kanban.png) |

**Create and validate a receipt:**
1. Click **New**. The reference is generated automatically as `<Warehouse>/IN/<number>` (e.g. `WH/IN/0013`),
   **Responsible** is filled in with you, and the schedule date is today.
2. Fill **Receive From** (the vendor). Optionally change the date, **Operation type** (which warehouse) and
   **Receive Into** (which location).
3. Click **New Product**, type a SKU or name and pick the product, then enter the **Quantity**. Add more lines
   the same way; the 🗑 icon removes a line.
4. Click **To Do**. The status moves **Draft → Ready**.
5. Click **Validate**. The status moves **Ready → Done**, stock increases, and a *done* stamp appears. The receipt is now locked.
6. Click **Print** to open a printable goods receipt.

| 1. New receipt | 3. Pick a product | 3. Draft with a line |
|---|---|---|
| ![New receipt](docs/guide/15-receipt-new-empty.png) | ![Product picker](docs/guide/16-receipt-product-picker.png) | ![Receipt draft](docs/guide/17-receipt-draft.png) |

| 4. After To Do: Ready | 5. After Validate: Done | 6. Printed receipt |
|---|---|---|
| ![Receipt ready](docs/guide/18-receipt-ready.png) | ![Receipt done](docs/guide/19-receipt-done.png) | ![Receipt print](docs/guide/20-receipt-print.png) |

### 5. Deliveries: ship goods to a customer

Operations → Delivery Orders shows the same list, search and Kanban as receipts.

![Deliveries list](docs/guide/21-deliveries-list.png)

**Create and validate a delivery:**
1. Click **New** (reference `WH/OUT/<number>`). Fill **Deliver To**, **Delivery Address**, **Schedule Date**,
   **Operation type** and **Ship From**.
2. Add products and quantities. If a quantity is more than the **free to use** stock, the line turns **red**
   with *"Not in stock — short by N"*.
3. Click **To Do**. If everything is in stock it goes to **Ready**; if not, it goes to **Waiting** and a
   *"Not enough stock"* alert appears.
4. When stock arrives (or you reduce the quantity), click **Check Availability**. It moves to **Ready**.
   Ready deliveries **reserve** their stock so nobody else can promise it.
5. Click **Validate**. It moves to **Done** and stock decreases.
6. Click **Print** for the delivery slip, with a signature line for the customer.

| 2. Red line: not enough stock | 3. Waiting + alert | 4. Ready after fixing qty |
|---|---|---|
| ![Delivery short](docs/guide/22-delivery-short-line.png) | ![Delivery waiting](docs/guide/23-delivery-waiting.png) | ![Delivery ready](docs/guide/24-delivery-ready.png) |

| 5. Done | 6. Delivery slip |
|---|---|
| ![Delivery done](docs/guide/25-delivery-done.png) | ![Delivery slip](docs/guide/26-delivery-slip.png) |

### 6. Internal transfers: move stock between locations

Operations → Internal Transfers → **New** (reference `WH/INT/<number>`).
1. Enter a **Purpose**, choose **From Location** and **To Location** (they must differ; the destination can be
   in another warehouse).
2. Add products and quantities, then **To Do → Validate**.
3. Total stock stays the same; only the location changes. Check it on the product's per-location breakdown.

| Draft: Stock1 → Production Floor | Done |
|---|---|
| ![Transfer draft](docs/guide/27-transfer-draft.png) | ![Transfer done](docs/guide/28-transfer-done.png) |

### 7. Adjustments: fix a mismatch after a physical count

Operations → Adjustments → **New** (reference `WH/ADJ/<number>`).
1. Enter a **Reason** (e.g. *Damaged in handling*) and the **Counted Location**.
2. Add the product and type what you **counted**.
3. Click **Apply**. The system compares your count with the **System qty** and logs only the **Difference**.
   Below, 347 kg were expected and 344 kg counted, so −3 kg goes to *Inventory Loss*.

| Enter the count | Applied: difference −3 logged |
|---|---|
| ![Adjustment draft](docs/guide/29-adjustment-draft.png) | ![Adjustment done](docs/guide/30-adjustment-done.png) |

> Quick alternative: update stock straight from the **Products** page (see [section 9](#9-products--stock)).
> That also creates an adjustment behind the scenes.

### 8. Cancel or delete an operation

- **Cancel:** any operation that is not Done can be canceled with **Cancel**. It is kept for the record, marked
  *canceled*, and releases any reserved stock.
- **Delete:** a **Draft** that was saved but never confirmed can be removed with the 🗑 button next to Cancel.
- **Done** operations can't be canceled or deleted. They are part of the ledger. To correct them, create an
  adjustment or a new operation.

| Draft with 🗑 delete + Cancel | Canceled | Draft deleted (gone from the list) |
|---|---|---|
| ![Draft with delete](docs/guide/31-draft-with-delete.png) | ![Canceled](docs/guide/32-canceled.png) | ![Draft deleted](docs/guide/33-draft-deleted.png) |

### 9. Products & stock

**Products** shows every product with **per unit cost**, **on hand** and **free to use** (on hand minus stock
reserved by Ready deliveries/transfers). *LOW* / *OUT* tags flag products under their reorder level.

![Stock page](docs/guide/34-stock.png)

**Update stock (physical count):** hover a row and click the ✎ pencil next to *On hand*, pick the location,
type the counted quantity and click **Set**. The change is logged as an adjustment (e.g. `WH/ADJ/0002`).

| Enter the count | Updated + logged |
|---|---|
| ![Inline update](docs/guide/35-stock-update-inline.png) | ![Updated](docs/guide/36-stock-updated.png) |

**Add a product:** click **New**, fill in:
- **Product name** and **SKU / Code** (unique)
- **Category** (choose **+ New category…** to create one on the spot) and **Unit of measure**
- **Per unit cost** and **Reorder at** (low-stock level)
- **Initial stock** and **Into location** (optional)

Then click **Save**.

**View details:** click any row to see SKU, category, on hand, free to use, incoming and reorder level, plus a
**per-location** bar chart. Click a location's number to correct its count. **View moves** jumps to its history.

**Edit a product:** in the details window click **Edit product**, change fields and click **Save**.

**Delete a product:** in the edit window click **🗑 Delete** and confirm. A product that already appears in
operations can't be deleted, because its history must stay intact.

| Add a product | Product details (per location) | Edit product |
|---|---|---|
| ![New product](docs/guide/37-product-new.png) | ![Product detail](docs/guide/38-product-detail.png) | ![Product edit](docs/guide/39-product-edit.png) |

| Delete button (edit window) | Deleted | Low-stock filter |
|---|---|---|
| ![Delete product](docs/guide/40-product-delete-button.png) | ![Deleted](docs/guide/41-product-deleted.png) | ![Low stock](docs/guide/42-stock-low-filter.png) |

**Find products:** 🔍 searches SKU or name. The chips filter **Low stock** / **Out of stock**, and the
dropdowns filter by **Category** and **Warehouse**.

### 10. Move history: the stock ledger

Every movement from one location to another, **one row per product** (a reference with 3 products shows 3 rows).
**Incoming moves are green, outgoing moves red**, internal moves neutral. Done moves come from the ledger;
open operations show their planned moves with their status.

- 🔍 search by reference, contact, product or SKU
- Chips: **All moves / In / Out / Internal**, plus a status dropdown; totals in/out appear on the right
- ▦ **Kanban** groups moves by status
- **New** starts a new internal transfer

| Ledger | Search a reference (2 products → 2 rows) |
|---|---|
| ![Move history](docs/guide/43-move-history.png) | ![Move search](docs/guide/44-move-history-search.png) |

| Only outgoing | Kanban |
|---|---|
| ![Out moves](docs/guide/45-move-history-out.png) | ![Moves kanban](docs/guide/46-move-history-kanban.png) |

### 11. Settings: warehouses & locations

**Add a warehouse:** Settings → Warehouse. Fill **Name**, **Short Code** (used in every reference, e.g.
`NH/IN/0001`) and **Address**, then click **Create warehouse**. Each new warehouse automatically gets a *Stock* location.

**Edit / delete a warehouse:** click its card, change fields and click **Save changes**, or click 🗑 to delete.
Warehouses with operations can't be deleted.

| Add a warehouse | Edit / delete a warehouse |
|---|---|
| ![New warehouse](docs/guide/47-warehouse-new.png) | ![Edit warehouse](docs/guide/48-warehouse-edit-delete.png) |

**Add a location** (rack, room, floor): Settings → Locations. Fill **Name**, **Short Code** and **Warehouse**,
then click **Create location**. It appears as `NH/RackB`.

**Edit / delete a location:** click its row, then **Save changes** or 🗑. Locations with stock history can't be deleted.

| Add a location | Edit / delete | Deleted |
|---|---|---|
| ![New location](docs/guide/49-location-new.png) | ![Edit location](docs/guide/50-location-edit-delete.png) | ![Location deleted](docs/guide/51-location-deleted.png) |

### 12. Profile, theme, logout

Click your initial (top right):
- **My Profile:** change your name and email, or change your password (current password required)
- **Switch to day shift / night shift:** light or dark theme (remembered per browser)
- **Logout**

| My Profile | Day-shift theme |
|---|---|
| ![Profile](docs/guide/52-profile.png) | ![Day theme](docs/guide/53-day-theme.png) |

### 13. Real-time updates

Every open StockSense screen updates by itself when **anyone** changes data. No refresh needed.
- The dashboard numbers flip, and lists, stock numbers and move history reload.
- If someone else validates or cancels the operation you have open, it refreshes and shows an *"Updated live"*
  notification. Your unsaved edits are never overwritten.
- The **LIVE** dot blinks on every update (amber means reconnecting).

Below: Ravi validates a receipt of 50 LED lamps (right), and Asha's Stock page (left) shows **53** instead of 3
without anyone touching it.

![Real-time between two users](docs/guide/54-realtime-two-users.png)

---

## Status & button reference

| Status | Meaning | Buttons you'll see |
|---|---|---|
| **Draft** | Just created, editable | **To Do** (Apply for adjustments), Save, Cancel, 🗑 Delete |
| **Waiting** | Delivery/transfer is short on stock | **Check Availability**, Cancel |
| **Ready** | Ready to receive / ship; deliveries reserve their stock | **Validate**, Cancel |
| **Done** | Stock has moved and the record is locked | **Print** |
| **Canceled** | Stopped; kept for the record | — |
| **Late** (tag) | Not done and the schedule date has passed | — |

| Operation | Status flow | Stock effect |
|---|---|---|
| Receipt | Draft → Ready → Done | Vendor → warehouse location: **+qty** |
| Delivery | Draft → Waiting / Ready → Done | Warehouse location → customer: **−qty** |
| Internal transfer | Draft → Waiting / Ready → Done | Location A → location B: total unchanged |
| Adjustment | Draft → Done | Logs **counted − system** to or from *Inventory Loss* |

## Rules the system enforces

- Stock can never go negative. A delivery or transfer can't be validated beyond what's on hand.
- An operation can't be validated twice, and Done / Canceled operations are locked.
- Receipts and deliveries need at least one product with quantity > 0.
- An internal transfer's source and destination must be different.
- SKUs, login IDs, emails and warehouse short codes are unique.
- Products, warehouses and locations that already have history can't be deleted.
- Every stock change (receipt, delivery, transfer, adjustment, inline update) is written to the ledger in one
  database transaction: all of it happens or none of it does.
- Passwords are hashed (bcrypt); OTPs are hashed, expire after 10 minutes, allow 5 attempts and are single-use;
  every API call requires a valid session token.

## 5-minute demo script

Follows the example in the problem statement:
1. **Sign in** as `admin01` and show the dashboard cards, KPIs and chart.
2. **Receive** 100 kg Steel Rods from *Tata Steel*: New receipt → To Do → Validate → stock **+100**. Print it.
3. **Move** them to production: internal transfer WH/Stock1 → WH/Prod. Total unchanged, location updated.
4. **Deliver** Steel Frames: first type too many, so the line turns red and the order waits; reduce it,
   Check Availability → Validate → stock **−20**. Print the slip.
5. **Adjust** damaged items: count 3 kg less at WH/Prod → **−3** logged.
6. Open **Move History**: every step is there (green in, red out).
7. **Real-time:** open a second window signed in as `ravi.k`, validate something there, and watch the first window update.

---

## Run it locally

Needs **Node 20+**.

```bash
git clone https://github.com/DeepakSinghhh/Odoo-Stocksense
cd Odoo-Stocksense
npm run setup      # installs server + client and seeds two weeks of demo activity
npm run dev        # API on :4000, web app on http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run setup` | Install everything and create the demo database |
| `npm run dev` | Run API + web app with live reload |
| `npm run seed` | Reset the database to the demo data |
| `npm run build && npm start` | Production mode, single process on http://localhost:4000 |

Demo accounts: **`admin01` / `Admin@1234`** and **`ravi.k` / `Ravi@12345`**.



## How it works

```
            ┌──────────── operations (one table, four types) ────────────┐
 Vendor ──receipt──►  WH/Stock1 ──internal──► WH/Prod ──delivery──► Customer
                          │                                    ▲
                          └────── adjustment ◄──► Inventory Loss (virtual)
```

- **Every movement is `from → to`.** Vendors, customers and inventory loss are *virtual* locations, so a receipt,
  a delivery, a transfer and a count all have the same shape and share one engine (`server/src/services/stock.js`).
- **The ledger is the truth.** `validate()` runs in a single SQLite transaction: it checks stock, updates the
  per-location quantities (`quants`) and appends rows to the append-only `moves` ledger.
- **Free to use = on hand − reserved.** Ready deliveries and transfers reserve their quantities; *To Do* sends a
  delivery to **Ready** if covered, else **Waiting**, and *Check Availability* re-evaluates it.
- **References** follow `<Warehouse code>/<IN|OUT|INT|ADJ>/<0001>`, numbered per warehouse and type.
- **Real-time:** after every successful write the server broadcasts a Server-Sent Event; each open tab re-fetches
  what it's showing.

### Data model

| Table | Holds |
|---|---|
| `users`, `password_resets` | Accounts (bcrypt hashes), hashed one-time codes with expiry & attempt count |
| `warehouses`, `locations` | Warehouses and their internal locations, plus virtual Vendor / Customer / Inventory Loss |
| `categories`, `products` | Catalogue: SKU (unique), category, unit of measure, unit cost, reorder level |
| `operations`, `operation_lines` | Receipts, deliveries, transfers, adjustments and their product lines |
| `quants` | On-hand quantity per product per location (never negative: CHECK constraint) |
| `moves` | The stock ledger: one row per product movement, append-only |

### API

| Method & path | Purpose |
|---|---|
| `POST /api/auth/signup` · `/login` · `/forgot-password` · `/reset-password` | Authentication |
| `GET/PUT /api/auth/me`, `PUT /api/auth/me/password` | Profile |
| `GET/POST/PUT/DELETE /api/products` · `POST /api/products/:id/count` | Products, stock counts |
| `GET/POST /api/categories` | Categories |
| `GET/POST/PUT/DELETE /api/warehouses` · `/api/locations` | Settings |
| `GET/POST/PUT/DELETE /api/operations` | Operations (filter by type, status, warehouse, category, search, late) |
| `POST /api/operations/:id/confirm` · `/check` · `/validate` · `/cancel` | Status changes |
| `GET /api/moves` | Move history |
| `GET /api/dashboard` | Cards, KPIs, flow chart, alerts |
| `GET /api/events` | Real-time stream (Server-Sent Events) |

## Tech stack & project structure

| | |
|---|---|
| Frontend | React 19 + Vite, React Router, hand-written CSS design system (no UI kit), self-hosted fonts |
| Backend | Node + Express 5, Zod validation, JWT auth, bcrypt, Nodemailer, Server-Sent Events |
| Database | SQLite via better-sqlite3: foreign keys, CHECK constraints, indexes, transactions |
| Hosting | Render blueprint (`render.yaml`) or any Docker host (`Dockerfile`) |

```
server/src
  db.js                 schema
  services/stock.js     the engine: references, availability, confirm/check/validate/cancel, stock counts
  services/events.js    real-time broadcast (Server-Sent Events)
  services/mailer.js    OTP email (falls back to on-screen code)
  routes/               auth · masters (warehouses, locations, categories, products) · operations · moves · dashboard
  seed.js               demo data played through the real engine
  start.js              production entry: seeds a fresh database, then starts the API
client/src
  ui/                   layout, kit (tags, status trail, barcode, product picker, modal), toasts, icons
  pages/                Auth, Dashboard, OperationsList, OperationForm, PrintOperation, Stock, MoveHistory, Settings, Profile
  live.jsx              real-time connection
docs/guide/             the screenshots in this README
```

## Testing

The full flow was tested end to end in a real browser (Playwright) on a fresh clone, with **92 checks passing**
and no browser or server errors:
- sign-up rules, login errors, OTP reset (wrong code, reuse, old password)
- dashboard cards, KPIs and all four filters
- the complete receipt, delivery, transfer and adjustment flows with exact stock changes
- waiting / reservation logic, cancel, double-validation and negative-stock protection
- stock page updates, product create/validate/duplicate SKU, move-history colours and filters
- warehouse & location settings, profile, theme
- real-time updates between two users
- rejection of requests without a valid token
