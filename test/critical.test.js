const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db');

const login = async name => (await request(app).post('/login').send({ email: name + '@demo.test', password: 'password123' })).body.token;
const as = (token, method, url) => request(app)[method](url).set('Authorization', 'Bearer ' + token);
let alice, bob, carol;

beforeAll(async () => { [alice, bob, carol] = await Promise.all([login('alice'), login('bob'), login('carol')]); });
afterAll(() => pool.end());

const newItem = async () =>
  (await as(bob, 'post', '/items').send({ title: 'test item', type: 'task', team_id: 1 })).body;

test('two people claiming at once: exactly one wins', async () => {
  const item = await newItem();
  const results = await Promise.all([as(alice, 'post', `/items/${item.id}/claim`), as(bob, 'post', `/items/${item.id}/claim`)]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]);
});

test('stale version is rejected and data stays unchanged', async () => {
  const item = await newItem();
  const first = await as(bob, 'patch', `/items/${item.id}`).send({ version: 1, title: 'bob title' });
  const stale = await as(alice, 'patch', `/items/${item.id}`).send({ version: 1, title: 'alice title' });
  expect(first.status).toBe(200);
  expect(stale.status).toBe(409);
  expect(stale.body.current.title).toBe('bob title');
});

test('same idempotency key creates one item', async () => {
  const key = 'same-key-' + Date.now();
  const post = () => as(bob, 'post', '/items').set('Idempotency-Key', key).send({ title: 'once', type: 'task', team_id: 1 });
  const [a, b] = await Promise.all([post(), post()]);
  expect(a.body.id).toBe(b.body.id);
  const { rows } = await pool.query("SELECT count(*) FROM work_items WHERE id=$1", [a.body.id]);
  expect(+rows[0].count).toBe(1);
});

test('invalid jump is rejected, and only a lead can approve', async () => {
  const item = await newItem();
  const jump = await as(bob, 'post', `/items/${item.id}/transition`).send({ to: 'closed', version: 1 });
  expect(jump.status).toBe(422);
  await as(bob, 'post', `/items/${item.id}/transition`).send({ to: 'in_progress', version: 1 });
  await as(bob, 'post', `/items/${item.id}/transition`).send({ to: 'awaiting_approval', version: 2 });
  const memberApprove = await as(bob, 'post', `/items/${item.id}/transition`).send({ to: 'resolved', version: 3 });
  const leadApprove = await as(alice, 'post', `/items/${item.id}/transition`).send({ to: 'resolved', version: 3 });
  expect(memberApprove.status).toBe(403);
  expect(leadApprove.status).toBe(200);
});

test('a user from another team cannot read or write', async () => {
  const item = await newItem();
  expect((await as(carol, 'get', `/items/${item.id}`)).status).toBe(404);
  expect((await as(carol, 'post', `/items/${item.id}/claim`)).status).toBe(404);
});

test('history is written with the change', async () => {
  const item = await newItem();
  await as(alice, 'post', `/items/${item.id}/claim`);
  const events = (await as(alice, 'get', `/items/${item.id}/activity`)).body.map(e => e.kind);
  expect(events).toEqual(['created', 'claimed']);
});
