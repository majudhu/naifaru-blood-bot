import { desc, eq, getTableColumns } from "drizzle-orm";
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

  if (!request) throw createError({ statusCode: 404, statusMessage: "Request not found" });

  const responses = await db
    .select({
      id: schema.donorResponses.id,
      donorId: schema.donorResponses.donorId,
      status: schema.donorResponses.status,
      respondedAt: schema.donorResponses.respondedAt,
      notes: schema.donorResponses.notes,
      donor: {
        id: schema.users.id,
        name: schema.users.name,
        phone: schema.users.phone,
        telegramUsername: schema.users.telegramUsername,
      },
    })
    .from(schema.donorResponses)
    .leftJoin(schema.users, eq(schema.donorResponses.donorId, schema.users.id))
    .where(eq(schema.donorResponses.requestId, requestId))
    .orderBy(desc(schema.donorResponses.respondedAt), desc(schema.donorResponses.id));

  return { ...request, responses };
});
