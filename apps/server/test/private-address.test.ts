// The private-address check behind recipe links: 127.0.0.1 written another way
// (IPv4 inside IPv6, NAT64, the unspecified address) is still refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivate } from '../src/private-address.ts';

test('private, loopback and link-local addresses are refused however they are written', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.31.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::', '::1', 'fd00::1', 'fe80::1%eth0', 'fec0::1',
    '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe', '::127.0.0.1', 'not-an-address']) {
    assert.equal(isPrivate(ip), true, ip);
  }
});

test('public addresses are allowed, including IPv4 inside IPv6', () => {
  for (const ip of ['8.8.8.8', '172.32.1.1', '2606:4700::1111', '::ffff:808:808', '64:ff9b::808:808']) {
    assert.equal(isPrivate(ip), false, ip);
  }
});
