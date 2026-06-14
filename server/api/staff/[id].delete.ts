import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const staffId = +getRouterParam(event, "id")!;

  if (!staffId) throw createError({ statusCode: 400, statusMessage: "Invalid staff ID" });

  if (staffId === user.id)
    throw createError({ statusCode: 400, statusMessage: "You cannot delete your own account" });

  const db = useDb(event);
  const result = await db.delete(schema.staff).where(eq(schema.staff.id, staffId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "Staff not found" });

  return null;
});
