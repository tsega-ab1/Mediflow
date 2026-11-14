export const STATUSES = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

// Forward path. 'placed -> confirmed' is automatic once stock is reserved.
const NEXT = { placed: ['confirmed'], confirmed: ['packed'], packed: ['shipped'], shipped: ['delivered'] };

export const canAdvance = (from, to) => NEXT[from]?.includes(to) ?? false;

// Customers can cancel before packing; warehouse staff and admins before shipping.
export function canCancel(role, status) {
  if (role === 'customer') return ['placed', 'confirmed'].includes(status);
  if (role === 'warehouse' || role === 'admin') return ['placed', 'confirmed', 'packed'].includes(status);
  return false;
}
