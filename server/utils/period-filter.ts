import { and, gte, lte, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { createError } from "h3";
import { SUMMARY_PERIODS } from "../../shared/utils/const";

export function periodFilter(date: AnySQLiteColumn, month = "0") {
  const period = SUMMARY_PERIODS.find((period) => String(period.months) === month);
  if (!period) throw createError({ statusCode: 400, statusMessage: "Invalid period" });
  if (!period.days) return undefined;

  return and(
    gte(date, sql`unixepoch('now', ${`-${period.days} days`})`),
    lte(date, sql`unixepoch('now')`),
  );
}
