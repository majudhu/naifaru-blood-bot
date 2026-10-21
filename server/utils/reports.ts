import { createError } from "h3";
import { SUMMARY_PERIODS, DAY_MS } from "../../shared/utils/const";

const OFFSET_MS = 5 * 60 * 60 * 1000;

export type ReportQuery = { period?: string; start?: string; end?: string };
export type ReportCounts = { type: string; count: number };
export type DonorReportCounts = ReportCounts & { newDonors: number };
export type TrendCount = { date: string; count: number };

function localDate(date: Date) {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00+05:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    localDate(date) !== value
  )
    throw createError({ statusCode: 400, statusMessage: "Choose a valid date" });
  return date;
}

export function reportRange(query: ReportQuery, now = new Date()) {
  const today = localDate(now);
  let start: string | null = null;
  let end = today;

  if (query.period === "custom") {
    if (!query.start || !query.end)
      throw createError({ statusCode: 400, statusMessage: "Choose a start and end date" });
    parseDate(query.start);
    parseDate(query.end);
    if (query.start > query.end || query.end > today)
      throw createError({
        statusCode: 400,
        statusMessage: "Choose a date range ending today or earlier",
      });
    start = query.start;
    end = query.end;
  } else {
    const period = SUMMARY_PERIODS.find(
      (period) => String(period.months) === (query.period ?? "0"),
    );
    if (!period) throw createError({ statusCode: 400, statusMessage: "Invalid report period" });
    if (period.days)
      start = localDate(new Date(parseDate(today).getTime() - (period.days - 1) * DAY_MS));
  }

  const from = start ? parseDate(start) : undefined;
  const to = new Date(
    Math.min(parseDate(end).getTime() + DAY_MS, (Math.floor(now.getTime() / 1000) + 1) * 1000),
  );
  const days = from ? (parseDate(end).getTime() - from.getTime()) / DAY_MS + 1 : Infinity;
  return { start, end, from, to, interval: days <= 90 ? ("week" as const) : ("month" as const) };
}

export function reportSummary(
  requests: ReportCounts[],
  donations: ReportCounts[],
  donors: DonorReportCounts[],
  responses: ReportCounts[],
) {
  const types = new Set(
    [...requests, ...donations, ...donors, ...responses].map((group) => group.type),
  );
  const groups = Array.from(types, (type) => {
    const donor = donors.find((group) => group.type === type);
    return {
      type,
      requests: requests.find((group) => group.type === type)?.count ?? 0,
      donations: donations.find((group) => group.type === type)?.count ?? 0,
      donors: donor?.count ?? 0,
      newDonors: donor?.newDonors ?? 0,
      responses: responses.find((group) => group.type === type)?.count ?? 0,
    };
  });
  const total = groups.reduce(
    (total, group) => ({
      requests: total.requests + group.requests,
      donations: total.donations + group.donations,
      donors: total.donors + group.donors,
      newDonors: total.newDonors + group.newDonors,
      responses: total.responses + group.responses,
    }),
    {
      requests: 0,
      donations: 0,
      donors: 0,
      newDonors: 0,
      responses: 0,
    },
  );
  return { total, groups };
}

function bucketDate(value: string, interval: "week" | "month") {
  const date = new Date(`${value}T00:00:00Z`);
  if (interval === "month") date.setUTCDate(1);
  else date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

export function reportTrends(
  range: ReturnType<typeof reportRange>,
  requests: TrendCount[],
  donations: TrendCount[],
  donors: TrendCount[],
) {
  const first =
    range.start ?? [...requests, ...donations, ...donors].map((row) => row.date).sort()[0];
  if (!first) return [];
  const date = bucketDate(first, range.interval);
  const last = bucketDate(range.end, range.interval);
  const requestCounts = new Map(requests.map((row) => [row.date, row.count]));
  const donationCounts = new Map(donations.map((row) => [row.date, row.count]));
  const donorCounts = new Map(donors.map((row) => [row.date, row.count]));
  const buckets = [];

  while (date <= last) {
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      requests: requestCounts.get(key) ?? 0,
      donations: donationCounts.get(key) ?? 0,
      newDonors: donorCounts.get(key) ?? 0,
    });
    if (range.interval === "month") date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCDate(date.getUTCDate() + 7);
  }
  return buckets;
}
