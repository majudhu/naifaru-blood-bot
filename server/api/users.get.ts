import { and, count, eq, gte, like, or, sql } from "drizzle-orm";
import { createError } from "h3";

const limit = 20;

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "-";
  }>(event);

  const offset = ((+query.page! || 1) - 1) * limit;
  const search = query.search;

  const [data, [total], [donors], [newDonors]] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .limit(limit)
      .offset(offset)
      .where(
        and(
          search
            ? or(like(schema.users.name, `%${search}%`), like(schema.users.phone, search))
            : undefined,
          query.type && query.type !== "-" ? eq(schema.users.bloodType, query.type) : undefined,
        ),
      ),
    db.select({ count: count() }).from(schema.users),
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
  ]);

  return { data, total: total?.count, donors: donors?.count, new: newDonors?.count };
});
