import { and, count, desc, eq, like, or } from "drizzle-orm";
import { createError } from "h3";

const limit = 20;

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
  }>(event);

  const db = useDb(event);

  const where = and(
    query.search
      ? or(
          like(schema.users.name, `%${query.search}%`),
          like(schema.users.phone, `%${query.search}%`),
        )
      : undefined,
    query.type && query.type !== "All" ? eq(schema.donations.bloodType, query.type) : undefined,
  );

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.donations.id,
        donatedAt: schema.donations.donatedAt,
        bloodType: schema.donations.bloodType,
        donor: {
          id: schema.users.id,
          name: schema.users.name,
          phone: schema.users.phone,
          bloodType: schema.users.bloodType,
        },
      })
      .from(schema.donations)
      .leftJoin(schema.users, eq(schema.donations.donorId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.donations.donatedAt))
      .limit(limit)
      .offset(((+query.page! || 1) - 1) * limit),
    db.select({ count: count() }).from(schema.donations).where(where),
  ]);

  return { data, total: total?.count };
});
