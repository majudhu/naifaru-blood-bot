import { and, count, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { donorStatusValues } from "../../shared/utils/const";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);
  const donorFilter = inArray(schema.users.status, donorStatusValues);

  const [
    [donors],
    [newDonors],
    [ready],
    groups,
    [activeRequests],
    [pending],
    [donations],
    [recentDonations],
  ] = await Promise.all([
    db.select({ count: count() }).from(schema.users).where(donorFilter),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(and(donorFilter, gte(schema.users.createdAt, sql`unixepoch('now', '-30 days')`))),
    db
      .select({ count: count() })
      .from(schema.users)
      .where(and(donorFilter, lte(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`))),
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
      .where(donorFilter)
      .groupBy(schema.users.bloodType),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(eq(schema.bloodRequests.status, "open")),
    db.select({ count: count() }).from(schema.users).where(eq(schema.users.status, "pending")),
    db.select({ count: count() }).from(schema.donations),
    db
      .select({ count: count() })
      .from(schema.donations)
      .where(
        and(
          gte(schema.donations.donatedAt, sql`unixepoch('now', '-30 days')`),
          lte(schema.donations.donatedAt, sql`unixepoch('now')`),
        ),
      ),
  ]);

  return {
    donors: donors?.count,
    new: newDonors?.count,
    ready: ready?.count,
    groups,
    activeRequests: activeRequests?.count,
    pending: pending?.count,
    donations: donations?.count,
    donationsLast30Days: recentDonations?.count,
  };
});
