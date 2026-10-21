import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { createError } from "h3";
import { donorStatusValues } from "../../shared/utils/const";
import { reportRange, reportSummary, reportTrends, type ReportQuery } from "../utils/reports";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const range = reportRange(getQuery<ReportQuery>(event));
  const db = useDb(event);
  const donorFilter = inArray(schema.users.status, donorStatusValues);
  const dateFilter = (date: AnySQLiteColumn) =>
    and(range.from ? gte(date, range.from) : undefined, lt(date, range.to));
  const bucket = (date: AnySQLiteColumn) =>
    range.interval === "week"
      ? sql<string>`date(${date}, 'unixepoch', '+5 hours', 'weekday 0', '-6 days')`
      : sql<string>`strftime('%Y-%m-01', ${date}, 'unixepoch', '+5 hours')`;

  const [requests, donations, donors, requestTrend, donationTrend, donorTrend, responses] =
    await Promise.all([
      db
        .select({ type: schema.bloodRequests.bloodType, count: count() })
        .from(schema.bloodRequests)
        .where(dateFilter(schema.bloodRequests.createdAt))
        .groupBy(schema.bloodRequests.bloodType),
      db
        .select({ type: schema.donations.bloodType, count: count() })
        .from(schema.donations)
        .where(dateFilter(schema.donations.donatedAt))
        .groupBy(schema.donations.bloodType),
      db
        .select({
          type: schema.users.bloodType,
          count: count(),
          newDonors:
            sql<number>`sum(case when ${dateFilter(schema.users.createdAt)} then 1 else 0 end)`.mapWith(
              Number,
            ),
        })
        .from(schema.users)
        .where(donorFilter)
        .groupBy(schema.users.bloodType),
      db
        .select({ date: bucket(schema.bloodRequests.createdAt), count: count() })
        .from(schema.bloodRequests)
        .where(dateFilter(schema.bloodRequests.createdAt))
        .groupBy(bucket(schema.bloodRequests.createdAt)),
      db
        .select({ date: bucket(schema.donations.donatedAt), count: count() })
        .from(schema.donations)
        .where(dateFilter(schema.donations.donatedAt))
        .groupBy(bucket(schema.donations.donatedAt)),
      db
        .select({ date: bucket(schema.users.createdAt), count: count() })
        .from(schema.users)
        .where(and(donorFilter, dateFilter(schema.users.createdAt)))
        .groupBy(bucket(schema.users.createdAt)),
      db
        .select({
          type: schema.bloodRequests.bloodType,
          count: count(),
        })
        .from(schema.donorResponses)
        .innerJoin(
          schema.bloodRequests,
          eq(schema.donorResponses.requestId, schema.bloodRequests.id),
        )
        .where(dateFilter(schema.donorResponses.respondedAt))
        .groupBy(schema.bloodRequests.bloodType),
    ]);

  return {
    range: { start: range.start, end: range.end, interval: range.interval },
    ...reportSummary(requests, donations, donors, responses),
    trends: reportTrends(range, requestTrend, donationTrend, donorTrend),
  };
});
