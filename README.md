# MediFlow

Order fulfillment, batch-tracked inventory, invoicing and reporting for pharmaceutical wholesale distribution.
A modular monolith: Node.js (Express) API + PostgreSQL (one schema per module) + Next.js web app.

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
| Stock never below zero, even concurrently | `reserveStock` locks the product's eligible batch rows (`FOR UPDATE`) inside the order transaction; DB CHECKs `on_hand >= 0`, `reserved <= on_hand` as a backstop. Tested with 10 parallel orders for 5 units. |
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

## Decisions to confirm with the tech lead
These were assumptions made while building; each is a one-line change:
1. **Near expiry = under 90 days** (`NEAR_EXPIRY_DAYS`).
2. **A recalled batch is final** (cannot be reactivated). Quarantine can be released.
3. **Placed -> Confirmed is automatic** once stock is reserved.
4. **Recall while stock is reserved**: affected open orders stay reserved but cannot ship; staff cancel them (no automatic re-allocation yet).
5. **Invoices**: issued automatically on shipping, 30-day terms, payment recorded manually by an admin (no payment gateway), no tax or currency handling.
6. **Notifications** are in-app only (no email or SMS provider yet).
7. **Low stock** means sellable units at or below 20 (adjustable in the report); "expiring" defaults to 120 days.
8. Login uses 8-hour JWTs; no self-registration, password reset or token revocation yet.

## Known limits and what is still deferred
Done: roles and login, catalog, batch inventory, order flow, audit log, in-app notifications,
invoicing with manual payment recording, reports with CSV export.
Still deferred: online payment gateway, multiple warehouses and companies, email/SMS notifications,
real microservices. The event bus is in-process; splitting Inventory into a service later means
replacing it with a broker and giving it its own database.
Production needs `JWT_SECRET` set and HTTPS in front of the app.
