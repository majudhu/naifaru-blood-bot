import { and, count, desc, eq, like, or, sql } from "drizzle-orm";

const limit = 20;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
    status?: (typeof requestStatusValues)[number] | "all";
    priority?: string;
  }>(event);

  const db = useDb(event);

  const filters = and(
    query.search
      ? or(
          like(schema.bloodRequests.location, `%${query.search}%`),
          like(schema.bloodRequests.island, `%${query.search}%`),
        )
      : undefined,
    query.type && query.type !== "All" ? eq(schema.bloodRequests.bloodType, query.type) : undefined,
    query.status && query.status !== "all"
      ? eq(schema.bloodRequests.status, query.status)
      : undefined,
    query.priority === "true" || query.priority === "1"
      ? eq(schema.bloodRequests.urgent, true)
      : undefined,
  );

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.bloodRequests.id,
        responseCount:
          sql<number>`(SELECT count(*) FROM ${schema.donorResponses} WHERE ${schema.donorResponses.requestId} = ${schema.bloodRequests.id})`.mapWith(
            Number,
          ),
        bloodType: schema.bloodRequests.bloodType,
        location: schema.bloodRequests.location,
        island: schema.bloodRequests.island,
        unitsNeeded: schema.bloodRequests.unitsNeeded,
        urgent: schema.bloodRequests.urgent,
        status: schema.bloodRequests.status,
        updatedAt: schema.bloodRequests.updatedAt,
        requester: {
          id: schema.users.id,
          name: schema.users.name,
          phone: schema.users.phone,
          telegramUsername: schema.users.telegramUsername,
        },
      })
      .from(schema.bloodRequests)
      .leftJoin(schema.users, eq(schema.bloodRequests.userId, schema.users.id))
      .where(filters)
      .orderBy(desc(schema.bloodRequests.createdAt))
      .limit(limit)
      .offset(((+query.page! || 1) - 1) * limit),
    db.select({ count: count() }).from(schema.bloodRequests).where(filters),
  ]);

  return { data, total: total?.count };
});
