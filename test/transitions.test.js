import { describe, it, expect } from 'vitest';
import { canAdvance, canCancel } from '../src/modules/orders/transitions.js';

describe('order transitions', () => {
  it('only allows the forward path', () => {
    expect(canAdvance('confirmed', 'packed')).toBe(true);
    expect(canAdvance('packed', 'shipped')).toBe(true);
    expect(canAdvance('confirmed', 'shipped')).toBe(false);
    expect(canAdvance('shipped', 'packed')).toBe(false);
    expect(canAdvance('delivered', 'shipped')).toBe(false);
    expect(canAdvance('cancelled', 'confirmed')).toBe(false);
  });
  it('customers cancel before packing, staff before shipping', () => {
    expect(canCancel('customer', 'confirmed')).toBe(true);
    expect(canCancel('customer', 'packed')).toBe(false);
    expect(canCancel('warehouse', 'packed')).toBe(true);
    expect(canCancel('warehouse', 'shipped')).toBe(false);
    expect(canCancel('inventory_manager', 'placed')).toBe(false);
  });
});
