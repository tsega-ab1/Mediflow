import { query } from '../../db.js';
import { notFound } from '../../errors.js';

export async function notify(userIds, { type, title, body = null, entity = null, entityId = null }) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await query(
    `INSERT INTO notifications.notifications (user_id, type, title, body, entity, entity_id)
     SELECT u, $2, $3, $4, $5, $6 FROM unnest($1::uuid[]) AS u`,
    [ids, type, title, body, entity, entityId == null ? null : String(entityId)]);
}

export async function listFor(userId, { unread } = {}) {
  const { rows } = await query(
    `SELECT * FROM notifications.notifications
     WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
     ORDER BY id DESC LIMIT 100`, [userId, unread ?? null]);
  return rows;
}

export async function unreadCount(userId) {
  const { rows: [r] } = await query(
    'SELECT count(*)::int AS n FROM notifications.notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return r.n;
}

export async function markRead(userId, id) {
  const { rows } = await query(
    `UPDATE notifications.notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);
  if (!rows[0]) throw notFound('Notification not found');
  return rows[0];
}

export async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE notifications.notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return { updated: rowCount };
}
