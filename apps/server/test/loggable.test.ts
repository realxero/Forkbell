// What goes in the server log about an error: never a query's parameters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loggable } from '../src/db-errors.ts';

test('a failed query logs its Postgres code, not the SQL parameters', () => {
  const err = new Error('Failed query: select auth_password_signup($1, $2)\nparams: sam,scrypt$secret-hash');
  err.name = 'DrizzleQueryError';
  Object.assign(err, { cause: Object.assign(new Error('duplicate key value violates unique constraint "x"'), { code: '23505' }) });
  const line = loggable(err);
  assert.ok(!line.includes('secret-hash') && !line.includes('params'), line);
  assert.match(line, /23505/);
  assert.match(loggable(new Error('plain problem')), /plain problem/, 'other errors keep their message and stack');
});
