import * as v from "valibot";
import { sql } from "drizzle-orm";
import { auditMutation } from "../utils/audit";

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

  const db = useDb(event);
  const body = await readValidatedBody(event, CreateRequestParser);

  const [request] = await auditMutation(
    db,
    event,
    user,
    {
      action: "create",
      entityType: "request",
      entityId: sql`last_insert_rowid()`,
      details: body,
    },
    db.insert(schema.bloodRequests).values(body).returning({ id: schema.bloodRequests.id }),
  );

  return request;
});
