import { pool } from '../../db.js';

// `db` is a pg client (to join a transaction) or the pool.
export async function record(db, { actorId = null, action, entity, entityId = null, details = {} }) {
  await (db ?? pool).query(
    `INSERT INTO audit.audit_log (actor_id, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details)]
  );
}

export async function listAudit({ entity, entityId, limit = 100 } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM audit.audit_log
     WHERE ($1::text IS NULL OR entity = $1) AND ($2::text IS NULL OR entity_id = $2)
     ORDER BY id DESC LIMIT $3`,
    [entity ?? null, entityId ?? null, lim]
  );
  return rows;
}
