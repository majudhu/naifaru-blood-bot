import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  const [[donors], [newDonors], [ready], groups] = await Promise.all([
    db.select({ count: count() }).from(schema.users).where(eq(schema.users.isAvailable, true)),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isAvailable, true),
          gte(schema.users.createdAt, sql`unixepoch('now', '-30 days')`),
        ),
      ),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isAvailable, true),
          lte(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`),
        ),
      ),
    db
      .select({
        type: schema.users.bloodType,
        ready:
          sql<number>`sum(case when ${schema.users.lastDonatedAt} <= unixepoch('now', '-90 days') then 1 else 0 end)`.mapWith(
            Number,
          ),
        total: count(),
      })
      .from(schema.users)
      .where(and(eq(schema.users.isAvailable, true)))
      .groupBy(schema.users.bloodType),
  ]);

  return { donors: donors?.count, new: newDonors?.count, ready: ready?.count, groups };
});
