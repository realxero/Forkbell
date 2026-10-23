// The offline outbox: changes made without a connection wait here, in order,
// and are sent when the connection returns. Pure functions, so the rules are
// testable without a phone or a network.

export interface OutboxItem {
  /** unique per item */
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  /** items with the same key replace each other (only the latest matters) */
  coalesceKey: string | null;
  /** short description for the sync banner, e.g. "Log Banana" */
  label: string;
  createdAt: number;
  attempts: number;
  /** whose data, when logging for someone who shared with you */
  profileId?: string | null;
}

/**
 * Add a change. A whole-workout save or a weigh-in for the same day replaces
 * the one already waiting, so a long offline session doesn't pile up dozens
 * of copies, but only if nothing that depends on it has been queued after it.
 */
export function enqueue(queue: OutboxItem[], item: OutboxItem): OutboxItem[] {
  if (item.coalesceKey) {
    const i = queue.findIndex((q) => q.coalesceKey === item.coalesceKey);
    if (i >= 0 && i === queue.length - 1) return [...queue.slice(0, i), { ...item, attempts: 0 }];
    if (i >= 0 && queue.slice(i + 1).every((q) => !touchesSameThing(q, item))) {
      return [...queue.slice(0, i), ...queue.slice(i + 1), { ...item, attempts: 0 }];
    }
  }
  return [...queue, item];
}

/** Two items affect the same record when one's path starts with the other's resource. */
function touchesSameThing(a: OutboxItem, b: OutboxItem) {
  const base = (p: string) => p.split('/').slice(0, 4).join('/');
  return base(a.path) === base(b.path);
}

export type SendResult = 'ok' | 'rejected' | 'retry';

/**
 * What a server answer means for a queued change:
 *   2xx              done
 *   404 on DELETE    already gone, done
 *   other 4xx        the server will never accept it (bad data); drop it and tell the person
 *   5xx, no network  try again later, keeping the order
 */
export function classify(status: number, method: OutboxItem['method']): SendResult {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 && method === 'DELETE') return 'ok';
  if (status === 401) return 'retry'; // signed out: keep it until they sign back in
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'rejected';
  return 'retry';
}

/** A random id the server accepts as a UUID, made on the device so offline records keep it forever. */
export function newId(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
