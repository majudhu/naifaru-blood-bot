import { createError } from "h3";
import * as v from "valibot";

export const CreateuserParser = v.parser(
  v.object({
    name: v.string(),
    telegramUsername: v.nullish(
      v.pipe(
        v.string(),
        v.transform((s) => s || null),
      ),
    ),
    phone: v.nullish(
      v.union([
        v.pipe(
          v.string(),
          v.empty(),
          v.transform(() => null),
        ),
        v.pipe(v.string(), v.minLength(7)),
      ]),
    ),
    bloodType: v.picklist(bloodTypeValues),
    nid: v.nullish(
      v.union([
        v.pipe(
          v.string(),
          v.empty(),
          v.transform(() => null),
        ),
        v.pipe(v.string(), v.length(7)),
      ]),
    ),
    sex: v.picklist(["m", "f"]),
    dob: v.pipe(v.string(), v.toDate()),
    address: v.string(),
    island: v.string(),
    isAvailable: v.optional(v.boolean(), false),
    lastDonatedAt: v.optional(
      v.pipe(
        v.string(),
        v.transform((s) => s || null),
        v.toDate(),
      ),
    ),
    notes: v.optional(v.string(), ""),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);

  const body = await readValidatedBody(event, CreateuserParser);

  const [newUser] = await db.insert(schema.users).values(body).returning({ id: schema.users.id });

  return newUser;
});
