import * as v from "valibot";
import { DATE_NIL } from "../../shared/utils/const";
import { requireStaffRole } from "../utils/auth";

const dateParser = v.pipe(
  v.optional(v.string(), ""),
  v.transform((value) => value || DATE_NIL),
  v.toDate(),
);

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
    sex: v.picklist(["", "m", "f"]),
    dob: dateParser,
    address: v.string(),
    island: v.string(),
    isAvailable: v.optional(v.boolean(), false),
    lastDonatedAt: dateParser,
    notes: v.optional(v.string(), ""),
  }),
);

export default defineEventHandler(async (event) => {
  await requireStaffRole(event, ["admin", "nurse", "lab"]);

  const db = useDb(event);

  const body = await readValidatedBody(event, CreateuserParser);

  const [newUser] = await db.insert(schema.users).values(body).returning({ id: schema.users.id });

  return newUser;
});
