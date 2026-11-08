// Asking Bell. A quick answer comes straight back; a slow one (a local model, a
// busy AI service) comes back as a ticket, and this checks every couple of
// seconds until it's ready, so a long think never hits the iPhone's 60-second
// limit on a request or Cloudflare's 100 seconds.
import type { BellReply } from '@forkbell/shared';
import { api, post } from './api';

type Pending = { pending: string };
const isPending = (r: unknown): r is Pending => typeof (r as Pending)?.pending === 'string';

/** Thrown when you tap Stop; the screen drops the answer quietly. */
export class BellStopped extends Error {}

export async function askBell(body: unknown, opts: { giveUpAfterMs?: number; signal?: AbortSignal } = {}): Promise<BellReply> {
  const check = () => {
    if (opts.signal?.aborted) throw new BellStopped('Stopped');
  };
  let r = await post<BellReply | Pending>('/api/bell/chat', body);
  check();
  const until = Date.now() + (opts.giveUpAfterMs ?? 5 * 60_000);
  while (isPending(r)) {
    if (Date.now() > until) throw new Error('Bell is taking too long. Try again in a moment.');
    await new Promise((done) => setTimeout(done, 2000));
    check();
    r = await api<BellReply | Pending>(`/api/bell/chat/${r.pending}`);
    check();
  }
  return r;
}
