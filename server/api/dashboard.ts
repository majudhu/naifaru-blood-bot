import { and, count, ne, gte, lte, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const [[donors], [newDonors], [ready], groups] = await Promise.all([
    db.select({ count: count() }).from(schema.users).where(ne(schema.users.status, "Non-Donor")),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          ne(schema.users.status, "Non-Donor"),
          gte(schema.users.createdAt, sql`unixepoch('now', '-30 days')`),
        ),
      ),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(
        and(
          ne(schema.users.status, "Non-Donor"),
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
      .where(and(ne(schema.users.status, "Non-Donor")))
      .groupBy(schema.users.bloodType),
  ]);

  return {
    donors: donors?.count,
    new: newDonors?.count,
    ready: ready?.count,
    groups,
  };
});
