// Asking Bell. A quick answer comes straight back; a slow one (a local model, a
// busy AI service) comes back as a ticket, and this checks every couple of
// seconds until it's ready, so a long think never hits the iPhone's 60-second
// limit on a request or Cloudflare's 100 seconds.
import type { BellReply } from '@forkbell/shared';
import { api, post } from './api';

type Pending = { pending: string };
const isPending = (r: unknown): r is Pending => typeof (r as Pending)?.pending === 'string';

export async function askBell(body: unknown, opts: { giveUpAfterMs?: number } = {}): Promise<BellReply> {
  let r = await post<BellReply | Pending>('/api/bell/chat', body);
  const until = Date.now() + (opts.giveUpAfterMs ?? 5 * 60_000);
  while (isPending(r)) {
    if (Date.now() > until) throw new Error('Bell is taking too long. Try again in a moment.');
    await new Promise((done) => setTimeout(done, 2000));
    r = await api<BellReply | Pending>(`/api/bell/chat/${r.pending}`);
  }
  return r;
}
