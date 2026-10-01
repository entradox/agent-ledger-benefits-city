/** Range of source-check dates across a set of offers (one place; used by insights, badge and SEO pages). */
import type { Bonus } from "./types.js";

export function checkRange(offers: Bonus[]): { oldest: string | null; newest: string | null } {
  const ds = offers.map((b) => b.last_verified_date).filter((d): d is string => Boolean(d)).sort();
  return { oldest: ds.length ? ds[0] : null, newest: ds.length ? ds[ds.length - 1] : null };
}
