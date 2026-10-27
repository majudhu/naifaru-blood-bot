import { and, count, eq, inArray, gt, like, lte, or, type SQL, sql, asc } from "drizzle-orm";
import { PER_PAGE } from "~~/shared/utils/const";

type Status = "ready" | "cooldown" | "donors" | "non-donors" | "Temporary" | "Reserved" | "pending";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const query = getQuery<{
    page?: string;
    search?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
    status?: Status;
    temporary?: string;
    reserved?: string;
    sex?: "all" | "m" | "f";
  }>(event);

  const offset = ((+query.page! || 1) - 1) * PER_PAGE;
  const search = query.search;

  const donorStatuses: (typeof schema.users.$inferSelect.status)[] = ["Donor"];
  if (query.temporary === "true") donorStatuses.push("Temporary");
  if (query.reserved === "true") donorStatuses.push("Reserved");
  const donorFilter = inArray(schema.users.status, donorStatuses);
  const statusFilter: Record<Status, SQL<unknown> | undefined> = {
    ready: and(donorFilter, lte(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`)),
    cooldown: and(donorFilter, gt(schema.users.lastDonatedAt, sql`unixepoch('now', '-90 days')`)),
    Temporary: eq(schema.users.status, "Temporary"),
    Reserved: eq(schema.users.status, "Reserved"),
    donors: donorFilter,
    "non-donors": eq(schema.users.status, "Non-Donor"),
    pending: eq(schema.users.status, "pending"),
  };

  const where = and(
    search
      ? or(
          like(schema.users.name, `%${search}%`),
          like(schema.users.phone, `%${search}%`),
          like(schema.users.nid, `%${search}%`),
          like(schema.users.address, `%${search}%`),
        )
      : undefined,
    query.type && query.type !== "All" ? eq(schema.users.bloodType, query.type) : undefined,
    statusFilter[query.status!],
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
      .where(where)
      .orderBy(asc(schema.users.lastDonatedAt)),
    db.select({ count: count() }).from(schema.users).where(where),
  ]);

  return { data, total: total?.count };
});
