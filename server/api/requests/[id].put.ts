import { eq } from "drizzle-orm";
import { createError } from "h3";
import { requireStaffRole } from "../../utils/auth";
import { CreateRequestParser } from "../requests.post";

export default defineEventHandler(async (event) => {
  await requireStaffRole(event, ["admin", "nurse"]);

  const requestId = +getRouterParam(event, "id")!;
  if (!requestId) throw createError({ statusCode: 400, statusMessage: "Invalid request ID" });

  const body = await readValidatedBody(event, CreateRequestParser);
  const db = useDb(event);

  const result = await db
    .update(schema.bloodRequests)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.bloodRequests.id, requestId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "Request not found" });

  return null;
});
