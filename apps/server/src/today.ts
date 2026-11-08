import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';

type AsUser = ReturnType<typeof connect>['asUser'];

/**
 * The time zone this person's phone last reported, or null. The server's own
 * clock is often UTC, so pass this to todayIn() / mealForTime() whenever the
 * request didn't say what day it is.
 */
export async function timeZoneOf(asUser: AsUser, userId: string): Promise<string | null> {
  const [u] = await asUser(userId, (tx) => tx.select({ tz: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1));
  return u?.tz ?? null;
}
