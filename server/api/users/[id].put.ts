import { eq, sql } from "drizzle-orm";
import { createError } from "h3";
import { DATE_NIL } from "../../../shared/utils/const";
import { CreateuserParser } from "../users.post";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const userId = +getRouterParam(event, "id")!;
  if (!userId) throw createError({ statusCode: 400, statusMessage: "Invalid user ID" });

  const body = await readValidatedBody(event, CreateuserParser);

  const db = useDb(event);

  const [existing] = await db
    .select({ lastDonatedAt: schema.users.lastDonatedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!existing) throw createError({ statusCode: 404, statusMessage: "User not found" });

  const result = await db
    .update(schema.users)
    .set({ ...body, updatedAt: sql`unixepoch()` })
    .where(eq(schema.users.id, userId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "User not found" });

  const lastDonatedChanged = existing.lastDonatedAt.getTime() !== body.lastDonatedAt.getTime();
  const isRealDonation = body.lastDonatedAt.getTime() !== new Date(DATE_NIL).getTime();

  if (lastDonatedChanged && isRealDonation) {
    await db.insert(schema.donations).values({
      donorId: userId,
      bloodType: body.bloodType,
      donatedAt: body.lastDonatedAt,
    });
  }

  return null;
});
