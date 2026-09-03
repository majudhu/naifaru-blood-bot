import type { H3Event } from "h3";
import { createError } from "h3";
import type { Staff } from "../schema";

export async function requireStaffRole(event: H3Event, allowedRoles: readonly Staff["role"][]) {
  const { user } = await requireUserSession(event);

  if (!allowedRoles.includes(user.role))
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  return user;
}
