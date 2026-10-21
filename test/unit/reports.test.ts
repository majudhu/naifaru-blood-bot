import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent, installApiTestGlobals } from "./api-test-utils";
import { reportRange, reportTrends } from "../../server/utils/reports";

let sqlite: DatabaseSync;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  installApiTestGlobals();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE users (id INTEGER, blood_type TEXT, status TEXT, created_at INTEGER);
    CREATE TABLE blood_requests (id INTEGER, blood_type TEXT, created_at INTEGER);
    CREATE TABLE donations (id INTEGER, blood_type TEXT, donated_at INTEGER, created_at INTEGER);
    CREATE TABLE donor_responses (id INTEGER, request_id INTEGER, donor_id INTEGER, status TEXT, responded_at INTEGER);
  `);
  const db = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    const rows = method === "run" ? [] : statement.all(...params).map((row) => Object.values(row));
    return { rows };
  });
  vi.stubGlobal("useDb", () => db);
});

afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function seed() {
  const user = sqlite.prepare("INSERT INTO users VALUES (?, ?, ?, unixepoch(?))");
  user.run(1, "A+", "Donor", "2026-09-01T00:00:00Z");
  user.run(2, "A+", "Donor", "2026-10-01T00:00:00Z");
  user.run(3, "O+", "Reserved", "2026-10-04T00:00:00Z");
  user.run(4, "A-", "Temporary", "2026-10-02T00:00:00Z");
  user.run(5, "B+", "Non-Donor", "2026-10-03T00:00:00Z");
  user.run(6, "B-", "pending", "2026-10-03T00:00:00Z");
  user.run(7, "", "Donor", "2026-10-05T00:00:00Z");
  const request = sqlite.prepare("INSERT INTO blood_requests VALUES (?, ?, unixepoch(?))");
  request.run(1, "A+", "2026-09-30T18:59:59Z");
  request.run(2, "A+", "2026-09-30T19:00:00Z");
  request.run(3, "O+", "2026-10-07T18:59:59Z");
  request.run(4, "B+", "2026-10-07T19:00:00Z");
  request.run(5, "", "2026-10-02T00:00:00Z");
  const donation = sqlite.prepare(
    "INSERT INTO donations VALUES (?, ?, unixepoch(?), unixepoch(?))",
  );
  donation.run(1, "A+", "2026-10-05T00:00:00Z", "2026-10-09T00:00:00Z");
  donation.run(2, "O+", "2026-10-08T00:00:00Z", "2026-10-02T00:00:00Z");
  donation.run(3, "", "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
}

describe("reports API", () => {
  it("filters activity by Maldives dates and keeps the donor pool across all dates", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    seed();
    const report = await handler(
      createEvent({ query: { period: "custom", start: "2026-10-01", end: "2026-10-07" } }),
    );

    expect(report.range).toEqual({ start: "2026-10-01", end: "2026-10-07", interval: "week" });
    expect(report.total).toEqual({
      requests: 3,
      donations: 2,
      donors: 5,
      newDonors: 4,
      responses: 0,
    });
    expect(report.groups).toEqual(
      expect.arrayContaining([
        { type: "A+", requests: 1, donations: 1, donors: 2, newDonors: 1, responses: 0 },
        { type: "", requests: 1, donations: 1, donors: 1, newDonors: 1, responses: 0 },
      ]),
    );
    expect(report.trends).toEqual([
      { date: "2026-09-28", requests: 2, donations: 1, newDonors: 3 },
      { date: "2026-10-05", requests: 1, donations: 1, newDonors: 1 },
    ]);
  });

  it("includes all request records, monthly trends, and unknown blood groups in totals", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    seed();
    const report = await handler(createEvent());

    expect(report.total).toEqual({
      requests: 5,
      donations: 3,
      donors: 5,
      newDonors: 5,
      responses: 0,
    });
    expect(report.trends).toEqual([
      { date: "2026-09-01", requests: 1, donations: 0, newDonors: 1 },
      { date: "2026-10-01", requests: 4, donations: 3, newDonors: 4 },
    ]);
  });

  it("includes the current second and excludes future dated activity", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    sqlite.exec(
      "INSERT INTO blood_requests VALUES (1, 'A+', unixepoch('2026-10-21T12:00:00Z')), (2, 'A+', unixepoch('2026-10-22T00:00:00Z'))",
    );

    const report = await handler(createEvent({ query: { period: "1" } }));

    expect(report.total.requests).toBe(1);
    expect(
      report.trends.reduce((sum: number, row: { requests: number }) => sum + row.requests, 0),
    ).toBe(1);
  });

  it("returns zero totals and no all-time trend buckets for an empty database", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    const report = await handler(createEvent());

    expect(report.total).toEqual({
      requests: 0,
      donations: 0,
      donors: 0,
      newDonors: 0,
      responses: 0,
    });
    expect(report.groups).toEqual([]);
    expect(report.trends).toEqual([]);
  });

  it("counts responses by response date and requested group without changing donation counts", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    seed();
    const response = sqlite.prepare(
      "INSERT INTO donor_responses VALUES (?, ?, ?, ?, unixepoch(?))",
    );
    response.run(1, 1, 1, "contacted", "2026-09-30T19:00:00Z");
    response.run(2, 2, 3, "accepted", "2026-10-02T00:00:00Z");
    response.run(3, 2, 2, "donated", "2026-10-03T00:00:00Z");
    response.run(4, 3, 4, "declined", "2026-10-07T18:59:59Z");
    response.run(5, 5, 7, "contacted", "2026-10-04T00:00:00Z");
    response.run(6, 4, 5, "accepted", "2026-10-07T19:00:00Z");
    response.run(7, 4, 6, "donated", "2026-09-30T18:59:59Z");
    response.run(8, 1, 2, "accepted", "2026-10-22T00:00:00Z");

    const report = await handler(
      createEvent({ query: { period: "custom", start: "2026-10-01", end: "2026-10-07" } }),
    );

    expect(report.total).toEqual({
      requests: 3,
      donations: 2,
      donors: 5,
      newDonors: 4,
      responses: 5,
    });
    expect(report.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "A+",
          responses: 3,
        }),
        expect.objectContaining({ type: "O+", responses: 1 }),
        expect.objectContaining({ type: "", responses: 1 }),
      ]),
    );
  });

  it("includes a group with only response activity, even when the donor is not in the current pool", async () => {
    const { default: handler } = await import("../../server/api/reports.get");
    sqlite.exec("INSERT INTO blood_requests VALUES (1, 'B+', unixepoch('2026-01-01'))");
    sqlite.exec("INSERT INTO users VALUES (1, 'O+', 'Non-Donor', unixepoch('2026-01-01'))");
    sqlite.exec(
      "INSERT INTO donor_responses VALUES (1, 1, 1, 'accepted', unixepoch('2026-10-05'))",
    );
    const report = await handler(createEvent({ query: { period: "1" } }));

    expect(report.groups).toEqual([
      {
        type: "B+",
        requests: 0,
        donations: 0,
        donors: 0,
        newDonors: 0,
        responses: 1,
      },
    ]);
    expect(report.total.responses).toBe(1);
  });

  it.each(["nurse", "lab"])("rejects %s access", async (role) => {
    const { default: handler } = await import("../../server/api/reports.get");
    await expect(handler(createEvent({ session: { user: { role } } }))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("report periods", () => {
  it.each([
    { period: "2" },
    { period: "custom" },
    { period: "custom", start: "2026-02-30", end: "2026-03-03" },
    { period: "custom", start: "2026-10-20", end: "2026-10-19" },
    { period: "custom", start: "2026-10-20", end: "2026-10-22" },
  ])("rejects invalid dates %j", (query) => {
    expect(() => reportRange(query)).toThrow(/Choose|Invalid/);
  });

  it("uses the current Maldives day and counts 30 inclusive calendar dates", () => {
    const range = reportRange({ period: "1" }, new Date("2026-10-21T20:00:00Z"));

    expect(range.start).toBe("2026-09-23");
    expect(range.end).toBe("2026-10-22");
    expect(range.from?.toISOString()).toBe("2026-09-22T19:00:00.000Z");
  });

  it("fills missing monthly buckets with zeros", () => {
    const range = reportRange({ period: "custom", start: "2026-07-01", end: "2026-10-01" });
    const buckets = reportTrends(range, [{ date: "2026-07-01", count: 2 }], [], []);

    expect(buckets.map((bucket) => bucket.date)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(buckets[1]).toEqual({ date: "2026-08-01", requests: 0, donations: 0, newDonors: 0 });
  });
});
