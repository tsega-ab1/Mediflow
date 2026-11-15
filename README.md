# MediFlow

![CI](https://github.com/tsega-ab1/Mediflow/actions/workflows/ci.yml/badge.svg)

Order fulfillment, batch-tracked inventory, invoicing and reporting for pharmaceutical wholesale distribution.
A modular monolith: Node.js (Express) API + PostgreSQL (one schema per module) + Next.js web app.

Author: Tsegaye Abate | Developer Internship personal project | Status as of 15 November 2026

**Contents:** [Status](#project-status) | [Acceptance criteria](#acceptance-criteria) | [Decisions needed](#decisions-needed-from-the-tech-lead) | [Next phase](#proposed-next-phase-not-started) | [Run it](#run-it) | [Structure](#structure) | [Business rules](#how-the-business-rules-are-enforced) | [API](#api-summary)

## Project status

The first release from the approved proposal is built and tested: login with four roles, catalog and batch inventory,
the order flow with cancellation, and an append-only audit log. On top of it I added three modules the proposal had
deferred: **notifications**, **invoicing** and **reporting**. Each owns its own tables and talks to other modules only
through a small interface, like the rest.

Not done: the **deployed demo** (the system runs locally and in Docker; a hosting target still has to be chosen) and the
deferred items below.

| Item | Status | Notes |
|---|---|---|
| Roles and login | Done | Customer, warehouse staff, inventory manager and admin; token-based login; admin creates users |
| Catalog and batch inventory | Done | Batches with expiry date, on-hand and reserved counts; status active, quarantined or recalled |
| Order flow and cancellation | Done | Placed, confirmed, packed, shipped, delivered. Cancelling releases reserved stock |
| Audit log | Done | Every status change and stock movement records who and when. Edits and deletes are blocked by the database |
| Tests, CI, Docker | Done | 40 automated tests. CI runs the API tests, the web build and both Docker builds on every push |
| Deployed demo | **Not done** | Runs locally and with Docker. Hosting target to be chosen |
| Notifications (was deferred) | Done | In-app only: a bell with an unread count. Warehouse is told about new orders, customers about status changes and invoices, stock staff about recalls |
| Invoicing (was deferred) | Done | Price is locked when the order is placed. One invoice is issued automatically when the order ships. An admin records payment; there is no payment gateway |
| Reports (was deferred) | Done | Orders by status, top products, low stock, batches nearing expiry, stock CSV export. Financial figures are admin-only |
| Payment gateway, multiple warehouses, email/SMS, microservices | Deferred | Not started. Multiple warehouses is proposed as the next phase |

## Acceptance criteria

| Criterion | Result | How it was verified |
|---|---|---|
| Ordering more than the available stock is rejected | Pass | Automated test. An order with several items is all-or-nothing: if one item fails, nothing is reserved |
| Stock comes from the earliest-expiring eligible batch; recalled batches are never used | Pass | Automated tests, including an order that spills over into a second batch, and batches that are recalled, quarantined or near expiry |
| Ten simultaneous orders for the last 5 units sell exactly 5 | Pass | Automated concurrency test. Eligible batch rows are locked inside the order transaction, with database checks as a backstop |
| A customer cannot see another customer's order; invalid status changes are rejected | Pass | Automated tests: another customer's order looks like "not found"; invalid changes return a conflict error |

Also tested: shipping stock from a recalled batch is blocked; cancel and ship racing on the same order cannot corrupt
stock; an order can never get a second invoice; customers only see their own invoices and notifications.

## Decisions needed from the tech lead

These are the rules the original proposal left open, and what I assumed while building. Each is a small change if you
want it different.

| # | Topic | What I assumed |
|---|---|---|
| 1 | Near expiry | A batch with fewer than 90 days left is never allocated (`NEAR_EXPIRY_DAYS`) |
| 2 | Recalled batches | A recall is final and cannot be undone. Quarantine can be released |
| 3 | Confirming an order | Placed becomes confirmed automatically once stock is reserved |
| 4 | When stock leaves | Stock is reserved at order time and leaves on-hand when the order ships. Cancelling before shipping releases it |
| 5 | Recall with open orders | Orders holding stock from the recalled batch cannot ship and must be cancelled by staff. No automatic re-allocation yet |
| 6 | Invoices | Issued automatically on shipping, 30-day terms, payment recorded by an admin. No tax or currency handling |
| 7 | Notifications | In-app only. No email or SMS provider yet |
| 8 | Report thresholds | Low stock means 20 or fewer sellable units; expiring means within 120 days. Both can be changed on the report screen |
| 9 | Login | Eight-hour tokens. No self-registration, password reset or token revocation yet |

Please also decide:

- [ ] Confirm or change rules 1 to 9 above (numbers 1, 2, 5 and 6 matter most)
- [ ] Approve multiple warehouses as the next phase, or name a different priority
- [ ] Choose a hosting target for the demo, or confirm that a local Docker demo is enough
- [ ] Confirm the dates for the next phase

## Proposed next phase (not started)

**Multiple warehouses:** stock is held per warehouse, and orders are allocated within the same safety rules (earliest
expiry first, never below zero, recalled stock never used). It changes how stock is reserved, so a short design note
comes first and nothing is built until it is approved. Real microservices stay out of scope: nothing in the current
system needs them yet.

| Weeks (proposed) | Work |
|---|---|
| Week 7 | Design note for multiple warehouses: data model, allocation rules, whether one order may ship from several warehouses. Review |
| Week 8 | Implementation inside the inventory module, with tests including the concurrency cases |
| Week 9 | Demo deployment, updated handoff notes, final review |

These dates are proposals for the tech lead to confirm.

## Run it

**Everything in Docker** (web on http://localhost:3000):
```bash
docker compose up --build
docker compose exec api node scripts/seed.js     # optional demo data
```

**Local development**
```bash
# 1. PostgreSQL: with the compose plugin: docker compose up -d db
#    or plain Docker:
docker run -d --name mediflow-db -e POSTGRES_USER=mediflow -e POSTGRES_PASSWORD=mediflow \
  -e POSTGRES_DB=mediflow -p 5432:5432 postgres:16

# 2. API (port 4000)
cp .env.example .env
npm install
set -a; . ./.env; set +a          # makes DATABASE_URL visible to `npm run migrate`
npm run migrate up
npm run seed                      # demo users, products, batches
npm run dev

# 3. Web app (port 3000, proxies /api to the API), in a second terminal
cd web && npm install && npm run dev
```
Demo logins (password `Passw0rd!demo`): `admin@`, `manager@` (inventory manager), `warehouse@`,
`selam@` and `bole@` (customers), all `@mediflow.local`.

**Tests** wipe their database, so they use a separate one:
```bash
docker exec mediflow-db psql -U mediflow -d postgres -c "CREATE DATABASE mediflow_test;"
DATABASE_URL=postgres://mediflow:mediflow@localhost:5432/mediflow_test npm run migrate up
npm test                          # override the URL with TEST_DATABASE_URL if needed
```

## Structure
```
src/modules/<name>/   identity | catalog | inventory | orders | audit | notifications | billing | reporting
  index.js            the module's public interface; other modules import ONLY from here
  service.js          business logic and SQL for the module's own schema
  routes.js           HTTP endpoints
src/events.js         in-process event bus (OrderPlaced, OrderStatusChanged, BatchRecalled, InvoiceIssued)
migrations/           node-pg-migrate
web/                  Next.js app (customer, warehouse, inventory manager, admin screens)
```
Modules never query another module's tables. They call its interface
(e.g. orders calls `reserveStock` in inventory, inside the order's one transaction).
Reporting is built the same way: it composes read functions exposed by the other modules.

## How the business rules are enforced
| Rule | Where |
|---|---|
| Stock never below zero, even concurrently | `reserveStock` locks the product's eligible batch rows (`FOR UPDATE`) inside the order transaction; DB CHECKs `on_hand >= 0`, `reserved <= on_hand` as a backstop. Tested with 10 parallel orders for 5 units |
| Earliest-expiring batch first | `ORDER BY expiry_date` in `reserveStock`; an order can span several batches |
| Near-expiry / quarantined / recalled never allocated | same query; `NEAR_EXPIRY_DAYS` (default 90) |
| Recalled stock cannot ship | `shipReservations` refuses non-active batches; the recall response lists affected orders |
| Only valid status changes | `orders/transitions.js` + order row lock (cancel and ship cannot race) |
| Customers see only own orders and invoices | ownership check in the service; others get 404 |
| Who/when on every change | `order_status_history`, `stock_movements`, `audit_log` store actor and time; `audit_log` is append-only (DB trigger) |
| Invoice matches what was ordered | `order_items.unit_price_cents` is locked at placement; billing issues one invoice per order (unique `order_id`) when it ships |
| Notifications never break an order | handlers run after commit via `subscribe()`; a failing handler is logged, not thrown |
| Financial figures are admin-only | reports hide the billing section from inventory managers; invoices are admin and owning customer only |

Order flow: placed -> confirmed (automatic when stock is reserved) -> packed -> shipped -> delivered.
Cancelling releases the reserved stock. Stock leaves `on_hand` when the order ships.
Shipping issues the invoice (30-day terms) and notifies the customer.

## API summary
`POST /auth/login` | `GET/POST /catalog/products`, `PATCH /catalog/products/:id` (admin) |
`GET/POST /inventory/batches`, `PATCH /inventory/batches/:id/status` |
`POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/status`, `POST /orders/:id/cancel` |
`GET /billing/invoices`, `GET /billing/invoices/:id`, `POST /billing/invoices/:id/pay` (admin), `POST /billing/orders/:orderId/invoice` (admin) |
`GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
`GET /reports/overview`, `GET /reports/stock.csv` (admin, inventory manager) |
`GET /audit` (admin) | `GET/POST /identity/users|customers` (admin)

## Known limits
The event bus is in-process; splitting Inventory into a service later means replacing it with a broker and giving it
its own database. Production needs `JWT_SECRET` set and HTTPS in front of the app.
