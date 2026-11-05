// What a refused database write means for the person who sent it.
//
// Postgres refuses some writes for good: a change that points at something
// deleted on another device (a foreign key), one that breaks a rule on the
// table (a check, or a value of the wrong kind), or one that row-level security
// doesn't allow. Answered as a 500, the phone's outbox reads "try again later"
// and retries it forever, and every change queued behind it waits forever too.
// Answered as a 4xx, the phone drops it and says it couldn't be saved.
//
// Anything else (the database down, a timeout, a bug) stays a 500, so the
// phone keeps the change and tries again.

type Refusal = { status: 400 | 403 | 409; error: string };

const REFUSALS: Record<string, Refusal> = {
  // foreign_key_violation
  '23503': { status: 409, error: 'That refers to something that isn’t there any more. It may have been deleted on another device.' },
  // unique_violation
  '23505': { status: 409, error: 'That’s already saved.' },
  // check_violation, not_null_violation, invalid_text_representation, numeric_value_out_of_range, invalid_datetime_format, datetime_field_overflow
  '23514': { status: 400, error: 'One of those values isn’t allowed. Check the numbers and try again.' },
  '23502': { status: 400, error: 'Something that change needs is missing.' },
  '22P02': { status: 400, error: 'One of those values isn’t the right kind.' },
  '22003': { status: 400, error: 'One of those numbers is too big.' },
  '22007': { status: 400, error: 'One of those dates isn’t a real date.' },
  '22008': { status: 400, error: 'One of those dates isn’t a real date.' },
  // insufficient_privilege: row-level security said no
  '42501': { status: 403, error: 'That isn’t yours to change.' },
};

/** The Postgres error code behind an error, whether the driver or Drizzle threw it. */
export function postgresCode(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/** A 4xx answer for a write Postgres will never accept, or null for anything else. */
export function refusalFor(err: unknown): Refusal | null {
  const code = postgresCode(err);
  return code ? (REFUSALS[code] ?? null) : null;
}
