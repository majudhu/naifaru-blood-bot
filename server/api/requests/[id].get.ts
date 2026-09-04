import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const requestId = +getRouterParam(event, "id")!;

  const [request] = await db
    .select()
    .from(schema.bloodRequests)
    .where(eq(schema.bloodRequests.id, requestId))
    .limit(1);

  if (request) return request;

  throw createError({ statusCode: 404, statusMessage: "Request not found" });
});
