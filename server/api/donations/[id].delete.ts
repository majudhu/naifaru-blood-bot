import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const donationId = Number(getRouterParam(event, "id"));
  if (!Number.isSafeInteger(donationId) || donationId <= 0)
    throw createError({ statusCode: 400, statusMessage: "Invalid donation ID" });

  const db = useDb(event);
  const result = await db.delete(schema.donations).where(eq(schema.donations.id, donationId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "Donation not found" });

  return null;
});
