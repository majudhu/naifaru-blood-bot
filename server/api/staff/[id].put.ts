import { eq, sql } from "drizzle-orm";
import { createError } from "h3";
import * as v from "valibot";

const UpdateStaffSchema = v.parser(
  v.object({
    username: v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(40)),
    password: v.optional(v.pipe(v.string(), v.minLength(8), v.maxLength(128))),
    role: v.picklist(staffRoleValues),
    isActive: v.boolean(),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const staffId = +getRouterParam(event, "id")!;
  if (!staffId) throw createError({ statusCode: 400, statusMessage: "Invalid staff ID" });

  const body = await readValidatedBody(event, UpdateStaffSchema);

  if (staffId === user.id) {
    if (body.role && body.role !== user.role)
      throw createError({ statusCode: 400, statusMessage: "You cannot change your own role" });
    else if (body.isActive === false)
      throw createError({
        statusCode: 400,
        statusMessage: "You cannot deactivate your own account",
      });
  }

  const db = useDb(event);

  const result = await db
    .update(schema.staff)
    .set({
      ...body,
      password: body.password ? await hashPassword(body.password) : undefined,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(schema.staff.id, staffId));

  if (result.meta.changes === 0)
    throw createError({ statusCode: 404, statusMessage: "Staff user not found" });

  return null;
});
