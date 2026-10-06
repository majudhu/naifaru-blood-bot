import { and, eq, sql } from "drizzle-orm";
import { createError } from "h3";
import * as v from "valibot";
import { DATE_NIL, userStatusValues } from "../../../shared/utils/const";
import { enqueueRegistrationNotification } from "../../utils/telegram/notifications";
import { CreateUserSchema } from "../users.post";

const UpdateUserParser = v.parser(
  v.object({
    ...CreateUserSchema.entries,
    expectedStatus: v.optional(v.picklist(userStatusValues)),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  const userId = +getRouterParam(event, "id")!;
  if (!userId) throw createError({ statusCode: 400, statusMessage: "Invalid user ID" });

  const { expectedStatus, ...body } = await readValidatedBody(event, UpdateUserParser);

  const db = useDb(event);

  const [existing] = await db
    .select({
      lastDonatedAt: schema.users.lastDonatedAt,
      status: schema.users.status,
      telegramUserId: schema.users.telegramUserId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!existing) throw createError({ statusCode: 404, statusMessage: "User not found" });

  if ((existing.status === "pending" || body.status === "pending") && user.role !== "admin")
    throw createError({
      statusCode: 403,
      statusMessage: "Only admins can manage pending registrations",
    });

  if (expectedStatus !== undefined && expectedStatus !== existing.status)
    throw createError({
      statusCode: 409,
      statusMessage: "User status has changed. Reload their details.",
    });

  const result = await db
    .update(schema.users)
    .set({ ...body, updatedAt: sql`unixepoch()` })
    .where(and(eq(schema.users.id, userId), eq(schema.users.status, existing.status)));

  if (result.meta.changes === 0)
    throw createError({
      statusCode: 409,
      statusMessage: "User has changed. Reload their details.",
    });

  const lastDonatedChanged = existing.lastDonatedAt.getTime() !== body.lastDonatedAt.getTime();
  const isRealDonation = body.lastDonatedAt.getTime() !== new Date(DATE_NIL).getTime();

  if (lastDonatedChanged && isRealDonation) {
    await db.insert(schema.donations).values({
      donorId: userId,
      bloodType: body.bloodType,
      donatedAt: body.lastDonatedAt,
    });
  }

  if (
    existing.status === "pending" &&
    body.status !== "pending" &&
    existing.telegramUserId !== null
  ) {
    await enqueueRegistrationNotification(
      event.context.cloudflare.env.TELEGRAM_DONOR_NOTIFICATIONS,
      {
        type: "registration_reviewed",
        userId,
        telegramUserId: existing.telegramUserId,
        status: body.status,
      },
    );
  }

  return null;
});
