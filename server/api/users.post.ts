import * as v from "valibot";
import { DATE_NIL, donorStatusValues, userStatusValues } from "../../shared/utils/const";
import { enqueueDonorSummary } from "../utils/telegram/notifications";

const dateParser = v.pipe(
  v.optional(v.string(), ""),
  v.transform((value) => value || DATE_NIL),
  v.toDate(),
);

export const CreateUserSchema = v.object({
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
      v.string(),
    ]),
  ),
  sex: v.picklist(["", "m", "f"]),
  dob: dateParser,
  address: v.string(),
  island: v.string(),
  status: v.optional(v.picklist(userStatusValues), "Non-Donor"),
  lastDonatedAt: dateParser,
  notes: v.optional(v.string(), ""),
});

export const CreateuserParser = v.parser(CreateUserSchema);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  const db = useDb(event);

  const body = await readValidatedBody(event, CreateuserParser);

  if (body.status === "pending" && user.role !== "admin")
    throw createError({
      statusCode: 403,
      statusMessage: "Only admins can manage pending registrations",
    });

  const [newUser] = await db.insert(schema.users).values(body).returning({ id: schema.users.id });

  if (donorStatusValues.some((status) => status === body.status)) {
    await enqueueDonorSummary(
      event.context.cloudflare.env.TELEGRAM_DONOR_NOTIFICATIONS,
      newUser!.id,
    );
  }

  return newUser;
});
