// Which addresses are off limits when the server fetches a link for someone.
import { BlockList, isIP } from 'node:net';

/** Addresses that aren't the public internet: never fetched for someone unless the server allows it. */
const blocked = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]] as const) blocked.addSubnet(net, bits, 'ipv6');

/** The eight 16-bit groups of an IPv6 address, however it's written (::, a dotted IPv4 tail). */
function v6Groups(ip: string): number[] {
  let text = ip.split('%')[0]!;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail) {
    const [a, b, c, d] = tail.split('.').map(Number) as [number, number, number, number];
    text = text.slice(0, -tail.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split('::') as [string, string | undefined];
  const part = (x: string) => (x ? x.split(':').map((h) => parseInt(h, 16)) : []);
  const front = part(head);
  if (rest === undefined) return front;
  const back = part(rest);
  return [...front, ...Array(8 - front.length - back.length).fill(0), ...back];
}

/**
 * Private, loopback, link-local and other non-public addresses. An IPv6 address
 * carrying an IPv4 one (::ffff:7f00:1, 64:ff9b::a9fe:a9fe) is judged by the
 * IPv4 address inside it, so writing 127.0.0.1 another way doesn't get past.
 */
export function isPrivate(ip: string): boolean {
  const family = isIP(ip.split('%')[0]!);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family !== 6) return true; // not an address at all: refuse
  const g = v6Groups(ip);
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  const compat = g.slice(0, 6).every((x) => x === 0) && (g[6]! | g[7]!) > 1; // ::a.b.c.d (old style)
  if (mapped || nat64 || compat) return blocked.check(`${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`, 'ipv4');
  return blocked.check(ip.split('%')[0]!, 'ipv6');
}
