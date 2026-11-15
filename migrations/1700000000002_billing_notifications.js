export const up = (pgm) => {
  pgm.sql(`
  -- Price is locked when the order is placed, so invoices never depend on later price changes.
  ALTER TABLE orders.order_items
    ADD COLUMN unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0);
  -- Orders placed before this migration get the product's current price.
  UPDATE orders.order_items i SET unit_price_cents = p.price_cents
    FROM catalog.products p WHERE p.id = i.product_id;

  CREATE SCHEMA notifications;
  CREATE TABLE notifications.notifications (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    entity text,
    entity_id text,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX notifications_user_idx ON notifications.notifications (user_id, created_at DESC);

  CREATE SCHEMA billing;
  CREATE SEQUENCE billing.invoice_number_seq;
  CREATE TABLE billing.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number text NOT NULL UNIQUE,
    order_id uuid NOT NULL UNIQUE,
    customer_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid')),
    total_cents bigint NOT NULL CHECK (total_cents >= 0),
    issued_at timestamptz NOT NULL DEFAULT now(),
    due_at timestamptz NOT NULL,
    paid_at timestamptz,
    paid_by uuid,
    payment_reference text
  );
  CREATE INDEX invoices_customer_idx ON billing.invoices (customer_id, issued_at DESC);
  CREATE TABLE billing.invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES billing.invoices(id),
    product_id uuid NOT NULL,
    description text NOT NULL,
    unit_price_cents integer NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    line_total_cents bigint NOT NULL
  );
  `);
};
export const down = (pgm) => {
  pgm.sql(`
  DROP SCHEMA billing CASCADE;
  DROP SCHEMA notifications CASCADE;
  ALTER TABLE orders.order_items DROP COLUMN unit_price_cents;
  `);
};
