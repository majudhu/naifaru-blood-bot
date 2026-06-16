import { createError } from "h3";

const limit = 20;

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  const offset = ((+getQuery(event).page! || 1) - 1) * -limit;

  return db.query.users.findMany({ limit, offset });
});
