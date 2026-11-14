export const up = (pgm) => {
  pgm.sql(`
  CREATE SCHEMA identity; CREATE SCHEMA catalog; CREATE SCHEMA inventory;
  CREATE SCHEMA orders;   CREATE SCHEMA audit;

  CREATE TABLE identity.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE identity.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid REFERENCES identity.customers(id),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('customer','warehouse','inventory_manager','admin')),
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE catalog.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    sku text NOT NULL UNIQUE,
    strength text,
    unit text NOT NULL,
    price_cents integer NOT NULL CHECK (price_cents >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE inventory.batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    batch_number text NOT NULL,
    expiry_date date NOT NULL,
    on_hand integer NOT NULL CHECK (on_hand >= 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','quarantined','recalled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, batch_number),
    CHECK (reserved <= on_hand)
  );
  CREATE INDEX batches_fefo_idx ON inventory.batches (product_id, expiry_date) WHERE status = 'active';
  CREATE TABLE inventory.reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL,
    batch_id uuid NOT NULL REFERENCES inventory.batches(id),
    quantity integer NOT NULL CHECK (quantity > 0),
    released_at timestamptz
  );
  CREATE TABLE inventory.stock_movements (
    id bigserial PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES inventory.batches(id),
    quantity_delta integer NOT NULL,
    reason text NOT NULL,
    order_id uuid,
    actor_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE orders.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'placed'
      CHECK (status IN ('placed','confirmed','packed','shipped','delivered','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE orders.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders.orders(id),
    product_id uuid NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0)
  );
  CREATE TABLE orders.order_status_history (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders.orders(id),
    from_status text,
    to_status text NOT NULL,
    actor_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE audit.audit_log (
    id bigserial PRIMARY KEY,
    actor_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE FUNCTION audit.block_changes() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'audit_log is append-only'; END; $$ LANGUAGE plpgsql;
  CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION audit.block_changes();
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP SCHEMA audit, orders, inventory, catalog, identity CASCADE;`);
};
