import * as v from "valibot";
import { and, eq } from "drizzle-orm";
import { recordAuditLog } from "../utils/audit";
import { SESSION_MAX_AGE } from "../../shared/utils/session";

const LoginParser = v.parser(
  v.object({
    username: v.pipe(v.string(), v.trim(), v.minLength(3), v.maxLength(40)),
    password: v.pipe(v.string(), v.minLength(8), v.maxLength(128)),
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
    const actor = { id: user.id, name: username, role: user.role };
    await recordAuditLog(db, event, actor, {
      action: "login",
      entityType: "staff",
      entityId: user.id,
    });
    await setUserSession(event, { user: actor }, { maxAge: SESSION_MAX_AGE[actor.role] });
    return null;
  }

  await recordAuditLog(
    db,
    event,
    { id: null, name: username, role: null },
    {
      action: "login_failed",
      entityType: "staff",
      entityId: null,
    },
  );

  throw createError({ status: 401, message: "Bad credentials" });
});
