# MediFlow

Order fulfillment and batch-tracked inventory for pharmaceutical wholesale distribution.
Modular monolith: Node.js (Express) + PostgreSQL, one schema per module.

## Run locally
```bash
docker compose up -d        # Postgres (or use any local Postgres and edit .env)
npm install
npm run migrate up
npm run dev                 # http://localhost:3000/health
npm test
```

## Structure
`src/modules/<name>/` owns its tables. Modules talk to each other only through `index.js`.
Modules: identity, catalog, inventory, orders, audit.

## Status (Weeks 1-2)
- [x] Repo, CI, migrations for all schemas
- [x] Catalog: create/list products
- [ ] Identity: login and roles (next)
