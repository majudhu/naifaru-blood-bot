import { and, count, eq, ne, gt, like, lte, or, type SQL, sql } from "drizzle-orm";
import { PER_PAGE } from "~~/shared/utils/const";

type Status = "ready" | "cooldown" | "donors" | "non-donors" | "Temporary" | "Reserved";

const STATUS_FILTER: Record<Status, SQL<unknown> | undefined> = {
  ready: and(
    ne(schema.users.status, "Non-Donor"),
    lte(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`),
  ),
  cooldown: and(
    ne(schema.users.status, "Non-Donor"),
    gt(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`),
  ),
  Temporary: eq(schema.users.status, "Temporary"),
  Reserved: eq(schema.users.status, "Reserved"),
  donors: and(ne(schema.users.status, "Non-Donor")),
  "non-donors": and(eq(schema.users.status, "Non-Donor")),
};

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
    status?: Status;
    sex?: "all" | "m" | "f";
  }>(event);

  const offset = ((+query.page! || 1) - 1) * PER_PAGE;
  const search = query.search;

  const where = and(
    search
      ? or(
          like(schema.users.name, `%${search}%`),
          like(schema.users.phone, `%${search}%`),
          like(schema.users.nid, `%${search}%`),
        )
      : undefined,
    query.type && query.type !== "All" ? eq(schema.users.bloodType, query.type) : undefined,
    STATUS_FILTER[query.status!],
    query.sex === "m"
      ? eq(schema.users.sex, "m")
      : query.sex === "f"
        ? eq(schema.users.sex, "f")
        : undefined,
  );

  const [data, [total]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        phone: schema.users.phone,
        address: schema.users.address,
        bloodType: schema.users.bloodType,
        lastDonatedAt: schema.users.lastDonatedAt,
        status: schema.users.status,
      })
      .from(schema.users)
      .limit(PER_PAGE)
      .offset(offset)
      .where(where),
    db.select({ count: count() }).from(schema.users).where(where),
  ]);

  return { data, total: total?.count };
});
