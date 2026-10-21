import { and, count, eq } from "drizzle-orm";
import { SUMMARY_PERIODS } from "../../shared/utils/const";
import { periodFilter } from "../utils/period-filter";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const db = useDb(event);

  const query = getQuery<{
    month?: string;
    type?: (typeof bloodTypeValues)[number] | "All";
  }>(event);

  const selectedPeriod = periodFilter(schema.bloodRequests.createdAt, query.month);
  const selectedGroup =
    query.type && query.type !== "All" ? eq(schema.bloodRequests.bloodType, query.type) : undefined;

  const [counts, groups] = await Promise.all([
    Promise.all(
      SUMMARY_PERIODS.map((period) =>
        db
          .select({ count: count() })
          .from(schema.bloodRequests)
          .where(
            and(periodFilter(schema.bloodRequests.createdAt, String(period.months)), selectedGroup),
          ),
      ),
    ),
    db
      .select({ type: schema.bloodRequests.bloodType, total: count() })
      .from(schema.bloodRequests)
      .where(selectedPeriod)
      .groupBy(schema.bloodRequests.bloodType),
  ]);
  const [total, month, month3, month6, year] = counts.map(([row]) => row?.count);

  return {
    total,
    month,
    month3,
    month6,
    year,
    groups,
  };
});
