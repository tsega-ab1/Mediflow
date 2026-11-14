import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, closeDb, makeUser, resetDb } from './helpers.js';

describe('auth and roles', () => {
  let admin, customer;
  beforeAll(async () => { await resetDb(); admin = await makeUser('admin'); customer = await makeUser('customer'); });
  afterAll(closeDb);

  it('logs in and rejects bad credentials', async () => {
    expect((await api().post('/auth/login').send({ email: 'nobody@x.io', password: 'whatever12' })).status).toBe(401);
    expect(admin.token).toBeTruthy();
  });
  it('requires a token', async () => {
    expect((await api().get('/catalog/products')).status).toBe(401);
    expect((await api().get('/catalog/products').set({ Authorization: 'Bearer junk' })).status).toBe(401);
  });
  it('enforces roles', async () => {
    const body = { name: 'X', sku: 'X1', unit: 'tab', price_cents: 1 };
    expect((await api().post('/catalog/products').set(customer.auth).send(body)).status).toBe(403);
    expect((await api().post('/catalog/products').set(admin.auth).send(body)).status).toBe(201);
    expect((await api().get('/audit').set(customer.auth)).status).toBe(403);
  });
  it('admin creates users; duplicate email rejected; password never returned', async () => {
    const res = await api().post('/identity/users').set(admin.auth)
      .send({ email: 'staff@test.local', password: 'password123', role: 'warehouse' });
    expect(res.status).toBe(201);
    expect(res.body.password_hash).toBeUndefined();
    const dup = await api().post('/identity/users').set(admin.auth)
      .send({ email: 'STAFF@test.local', password: 'password123', role: 'warehouse' });
    expect(dup.status).toBe(409);
  });
  it('validates products and rejects duplicate SKUs', async () => {
    const bad = await api().post('/catalog/products').set(admin.auth).send({ name: '', price_cents: -1 });
    expect(bad.status).toBe(400);
    const body = { name: 'Y', sku: 'X1', unit: 'tab', price_cents: 1 };
    expect((await api().post('/catalog/products').set(admin.auth).send(body)).status).toBe(409);
  });
});
