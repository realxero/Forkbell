// Plain words for a failed request: what went wrong and what to do next.
// Screens show this instead of the raw error text.
import { ApiError } from './api';

export function problem(e: unknown) {
  if (e instanceof ApiError) return e.status >= 500 ? 'Your server ran into a problem. Try again in a moment.' : 'Your server turned the request down. Pull to refresh, then try again.';
  return 'Couldn’t reach your server. Check your connection, then try again.';
}
