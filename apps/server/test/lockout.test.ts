// Guessing limits: someone who knows your username can't lock you out from their
// own address, but one address still locks after its own budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockedFor, noteFailure, noteSuccess } from '../src/password.ts';

test('wrong passwords from one address lock that pair only', () => {
  for (let i = 0; i < 8; i++) noteFailure('alice', '10.0.0.1');
  assert.ok(lockedFor('alice', '10.0.0.1') > 0);
  assert.equal(lockedFor('alice', '10.0.0.2'), 0, 'alice can still sign in from home');
});

test('one address locks after 30 tries across usernames', () => {
  for (let i = 0; i < 30; i++) noteFailure(`user${i}`, '10.0.0.9');
  assert.ok(lockedFor('someone-else', '10.0.0.9') > 0);
});

test('a username locks everywhere only at 100', () => {
  for (let i = 0; i < 99; i++) noteFailure('bob', `10.1.${i >> 8}.${i & 255}`);
  assert.equal(lockedFor('bob', '10.2.0.1'), 0);
  noteFailure('bob', '10.1.9.9');
  assert.ok(lockedFor('bob', '10.2.0.1') > 0);
});

test('a right password clears the pair and the username', () => {
  for (let i = 0; i < 8; i++) noteFailure('carol', '10.3.0.1');
  noteSuccess('carol', '10.3.0.1');
  assert.equal(lockedFor('carol', '10.3.0.1'), 0);
});
