import { and, count, desc, eq, like, or } from "drizzle-orm";
import { createError } from "h3";

const limit = 20;

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
    status?: (typeof requestStatusValues)[number] | "all";
    priority?: string;
  }>(event);

  const db = useDb(event);

  const [data, [total]] = await Promise.all([
    db
      .select()
      .from(schema.bloodRequests)
      .where(
        and(
          query.search
            ? or(
                like(schema.bloodRequests.location, `%${query.search}%`),
                like(schema.bloodRequests.island, `%${query.search}%`),
              )
            : undefined,
          query.type && query.type !== "All"
            ? eq(schema.bloodRequests.bloodType, query.type)
            : undefined,
          query.status && query.status !== "all"
            ? eq(schema.bloodRequests.status, query.status)
            : undefined,
          query.priority === "true" || query.priority === "1"
            ? eq(schema.bloodRequests.urgent, true)
            : undefined,
        ),
      )
      .orderBy(desc(schema.bloodRequests.createdAt))
      .limit(limit)
      .offset(((+query.page! || 1) - 1) * limit),
    db.select({ count: count() }).from(schema.bloodRequests),
  ]);

  return { data, total: total?.count };
});
