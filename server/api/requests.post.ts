import { createError } from "h3";
import * as v from "valibot";

export const CreateRequestParser = v.parser(
  v.object({
    userId: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
    bloodType: v.picklist(bloodTypeValues),
    location: v.string(),
    island: v.string(),
    unitsNeeded: v.pipe(v.number(), v.integer(), v.minValue(1)),
    urgent: v.boolean(),
    status: v.picklist(requestStatusValues),
    notes: v.string(),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (!user.role) throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const db = useDb(event);
  const body = await readValidatedBody(event, CreateRequestParser);

  const [request] = await db
    .insert(schema.bloodRequests)
    .values(body)
    .returning({ id: schema.bloodRequests.id });

  return request;
});
