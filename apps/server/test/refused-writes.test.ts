// A write the database will never accept must answer 4xx, not 500. The
// phone's outbox retries a 500 forever, in order, so one change that can never
// be saved (a dose for a medication deleted on another device) would hold back
// every change made after it. These pin that down.
//   DATABASE_ADMIN_URL=... DATABASE_URL=... pnpm --filter @forkbell/server test:api
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newUser, serverLog, startServer, stopServer } from './harness.ts';

before(startServer);
after(stopServer);
const explain = (what: string) => `${what}\n--- server log ---\n${serverLog().slice(-2000)}`;
const today = new Date().toISOString().slice(0, 10);

test('a dose for a medication that was deleted is refused (409), not a server error', async () => {
  const u = await newUser();
  const made = await u.call('POST', '/api/wellbeing/medications', { name: 'Vitamin D', dose: null, notes: null, timesPerDay: 1 });
  assert.equal(made.status, 201, explain(JSON.stringify(made.body)));
  assert.equal((await u.call('DELETE', `/api/wellbeing/medications/${made.body.id}`)).status, 200);
  // The phone was offline and ticked the dose before it heard about the delete.
  const r = await u.call('PUT', '/api/wellbeing/medication-logs', { medicationId: made.body.id, date: today, slot: 0, status: 'taken' });
  assert.equal(r.status, 409, explain(JSON.stringify(r.body)));
  assert.match(r.body.error, /isn’t there any more/);
});

test('a dose for someone else’s medication is refused (4xx), not a server error', async () => {
  const owner = await newUser('Owner');
  const other = await newUser('Other');
  const made = await owner.call('POST', '/api/wellbeing/medications', { name: 'Iron', dose: null, notes: null, timesPerDay: 1 });
  assert.equal(made.status, 201);
  const r = await other.call('PUT', '/api/wellbeing/medication-logs', { medicationId: made.body.id, date: today, slot: 0, status: 'taken' });
  assert.ok(r.status >= 400 && r.status < 500, explain(`answered ${r.status}`));
  // And nothing was written for the owner.
  const w = await owner.call('GET', `/api/wellbeing?today=${today}`);
  const med = w.body.medications.find((m: { id: string }) => m.id === made.body.id);
  assert.deepEqual(med.today, [null]);
});

test('a dose for a medication that never existed is refused too', async () => {
  const u = await newUser();
  const r = await u.call('PUT', '/api/wellbeing/medication-logs', { medicationId: randomUUID(), date: today, slot: 0, status: 'taken' });
  assert.ok(r.status >= 400 && r.status < 500, explain(`answered ${r.status}`));
});
