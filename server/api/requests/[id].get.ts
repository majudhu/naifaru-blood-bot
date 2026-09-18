import { eq, getTableColumns } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const requestId = +getRouterParam(event, "id")!;

  const [request] = await db
    .select({
      ...getTableColumns(schema.bloodRequests),
      requester: {
        id: schema.users.id,
        name: schema.users.name,
        phone: schema.users.phone,
        telegramUsername: schema.users.telegramUsername,
      },
    })
    .from(schema.bloodRequests)
    .leftJoin(schema.users, eq(schema.bloodRequests.userId, schema.users.id))
    .where(eq(schema.bloodRequests.id, requestId))
    .limit(1);

  if (request) return request;

  throw createError({ statusCode: 404, statusMessage: "Request not found" });
});
