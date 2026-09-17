import { count, gte, sql } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const query = getQuery<{ month?: string }>(event);

  const [[total], [month], groups] = await Promise.all([
    db.select({ count: count() }).from(schema.bloodRequests),
    db
      .select({ count: count() })
      .from(schema.bloodRequests)
      .where(gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-30 days')`)),
    db
      .select({ type: schema.bloodRequests.bloodType, total: count() })
      .from(schema.bloodRequests)
      .where(
        +query.month!
          ? gte(schema.bloodRequests.createdAt, sql`unixepoch('now', '-30 days')`)
          : undefined,
      )
      .groupBy(schema.bloodRequests.bloodType),
  ]);

  return { total: total?.count, month: month?.count, groups };
});
