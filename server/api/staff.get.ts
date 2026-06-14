import { createError } from "h3";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  return db.query.staff.findMany();
});
