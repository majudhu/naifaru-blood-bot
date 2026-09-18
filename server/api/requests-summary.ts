import { count, gte, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const query = getQuery<{ month?: string }>(event);

  const days = +query.month! * 30;

  const [[total], [month], [month3], [month6], [year], groups] = await Promise.all([
    db.select({ count: count() }).from(schema.bloodRequests),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-30 days')`)),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-90 days')`)),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-180 days')`)),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-365 days')`)),
    db
      .select({ type: schema.bloodRequests.bloodType, total: count() })
      .from(schema.bloodRequests)
      .where(
        days
          ? gte(schema.bloodRequests.createdAt, sql`unixepoch('now', ${`-${days} days`})`)
          : undefined,
      )
      .groupBy(schema.bloodRequests.bloodType),
  ]);

  return {
    total: total?.count,
    month: month?.count,
    month3: month3?.count,
    month6: month6?.count,
    year: year?.count,
    groups,
  };
});
