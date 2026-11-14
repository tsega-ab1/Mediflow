export const up = (pgm) => {
  pgm.sql(`
  ALTER TABLE inventory.reservations
    ADD COLUMN order_id uuid NOT NULL,
    ADD COLUMN shipped_at timestamptz,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT reservation_single_outcome CHECK (released_at IS NULL OR shipped_at IS NULL);
  CREATE INDEX reservations_order_idx ON inventory.reservations (order_id);
  CREATE INDEX reservations_batch_idx ON inventory.reservations (batch_id);
  ALTER TABLE inventory.stock_movements ADD COLUMN reserved_delta integer NOT NULL DEFAULT 0;
  CREATE INDEX orders_customer_idx ON orders.orders (customer_id, created_at DESC);
  `);
};
export const down = (pgm) => {
  pgm.sql(`
  DROP INDEX orders.orders_customer_idx;
  ALTER TABLE inventory.stock_movements DROP COLUMN reserved_delta;
  ALTER TABLE inventory.reservations DROP COLUMN order_id, DROP COLUMN shipped_at, DROP COLUMN created_at;
  `);
};
