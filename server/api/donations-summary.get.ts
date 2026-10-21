import { and, count, eq } from "drizzle-orm";
import { createError } from "h3";
import { SUMMARY_PERIODS } from "../../shared/utils/const";
import { periodFilter } from "../utils/period-filter";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const query = getQuery<{
    month?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
  }>(event);
  const selectedPeriod = periodFilter(schema.donations.donatedAt, query.month);
  const selectedGroup =
    query.type && query.type !== "All" ? eq(schema.donations.bloodType, query.type) : undefined;
  const db = useDb(event);

  const [counts, groups] = await Promise.all([
    Promise.all(
      SUMMARY_PERIODS.map((period) =>
        db
          .select({ count: count() })
          .from(schema.donations)
          .where(
            and(periodFilter(schema.donations.donatedAt, String(period.months)), selectedGroup),
          ),
      ),
    ),
    db
      .select({ type: schema.donations.bloodType, total: count() })
      .from(schema.donations)
      .where(selectedPeriod)
      .groupBy(schema.donations.bloodType),
  ]);
  const [total, recent, month3, month6, year] = counts.map(([row]) => row?.count);

  return {
    total,
    last30Days: recent,
    last90Days: month3,
    last180Days: month6,
    last365Days: year,
    groups,
  };
});
