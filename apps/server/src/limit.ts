// A small in-memory limit: at most `limit` events per key in a sliding window.
// Per process, so a restart forgets; enough to stop one person or address
// from running up costs or guessing codes.
export function perWindow(limit: number, windowMs: number, maxKeys = 20_000) {
  const seen = new Map<string, number[]>();
  return {
    /** Whether one more is allowed now (and, if so, count it). */
    take(key: string): boolean {
      const now = Date.now();
      const list = (seen.get(key) ?? []).filter((t) => now - t < windowMs);
      if (list.length >= limit) return false;
      seen.delete(key); // re-insert so the map stays oldest-first
      seen.set(key, [...list, now]);
      while (seen.size > maxKeys) seen.delete(seen.keys().next().value!);
      return true;
    },
    /** Whether the key is at its limit, without counting anything. */
    full(key: string): boolean {
      const now = Date.now();
      return (seen.get(key) ?? []).filter((t) => now - t < windowMs).length >= limit;
    },
  };
}
