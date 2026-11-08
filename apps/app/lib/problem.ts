// Plain words for a failed request: what went wrong and what to do next.
// Screens show this instead of the raw error text.
import { ApiError } from './api';

/** True when the request never reached the server (no signal, wrong address). */
export const unreachable = (e: unknown) => !(e instanceof ApiError) || e.status === 0;

export function problem(e: unknown) {
  if (unreachable(e)) return 'Couldn’t reach your server. Check your connection, then try again.';
  return (e as ApiError).status >= 500 ? 'Your server ran into a problem. Try again in a moment.' : 'Your server turned the request down. Pull to refresh, then try again.';
}
