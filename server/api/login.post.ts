import * as v from "valibot";
import { and, eq } from "drizzle-orm";

const LoginParser = v.parser(
  v.object({
    username: v.pipe(v.string(), v.minLength(3)),
    password: v.pipe(v.string(), v.minLength(8)),
  }),
);

export default defineEventHandler(async (event) => {
  const { username, password } = await readValidatedBody(event, LoginParser);

  const db = useDb(event);
  const [user] = await db
    .select({ id: schema.staff.id, role: schema.staff.role, password: schema.staff.password })
    .from(schema.staff)
    .where(and(eq(schema.staff.username, username), eq(schema.staff.isActive, true)))
    .limit(1);

  if (user && (await verifyPassword(user.password, password))) {
    await setUserSession(event, { user: { id: user.id, name: username, role: user.role } });
    return null;
  }

  throw createError({
    status: 401,
    message: "Bad credentials",
  });
});
