import { createError } from "h3";
import * as v from "valibot";

const CreateStaffParser = v.parser(
  v.object({
    username: v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(40)),
    password: v.pipe(v.string(), v.minLength(8), v.maxLength(128)),
    role: v.picklist(staffRoleValues),
    isActive: v.optional(v.boolean(), true),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  const body = await readValidatedBody(event, CreateStaffParser);

  const [staff] = await db
    .insert(schema.staff)
    .values({
      username: body.username,
      password: await hashPassword(body.password),
      role: body.role,
      isActive: body.isActive,
    })
    .returning({ id: schema.staff.id });

  return staff;
});
