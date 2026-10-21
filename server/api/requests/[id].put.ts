import { eq } from "drizzle-orm";
import { createError } from "h3";
import { CreateRequestParser } from "../requests.post";
import { auditMutation } from "../../utils/audit";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  const requestId = +getRouterParam(event, "id")!;
  if (!requestId) throw createError({ statusCode: 400, statusMessage: "Invalid request ID" });

  const body = await readValidatedBody(event, CreateRequestParser);
  const db = useDb(event);

  const mutation = db
    .update(schema.bloodRequests)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.bloodRequests.id, requestId));

  const result = await auditMutation(
    db,
    event,
    user,
    {
      action: "update",
      entityType: "request",
      entityId: requestId,
      details: body,
    },
    mutation,
  );

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "Request not found" });

  return null;
});
