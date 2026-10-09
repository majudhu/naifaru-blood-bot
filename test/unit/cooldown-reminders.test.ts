import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { Api } from "grammy";
import { describe, expect, it, vi } from "vitest";

import {
  enqueueCooldownReminders,
  sendCooldownReminder,
} from "../../server/utils/telegram/cooldown";
import { parseTelegramNotificationJob } from "../../server/utils/telegram/notifications";
import type { AppDb } from "../../server/utils/telegram/types";
import { DAY_MS } from "../../shared/utils/const";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY, status TEXT, telegram_user_id INTEGER, last_donated_at INTEGER
  );`);
  sqlite.exec(
    readFileSync(new URL("../../drizzle/0005_cooldown-reminders.sql", import.meta.url), "utf8"),
  );
  const db = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }
    statement.setReturnArrays(true);
    return { rows: statement.all(...params) as unknown as unknown[][] };
  }) as unknown as AppDb;
  const sendBatch = vi.fn<(messages: unknown[]) => Promise<void>>(async () => {});
  const queue = { sendBatch } as unknown as Parameters<typeof enqueueCooldownReminders>[1];
  const api = new Api("123:test");
  const send = vi.fn<(previous: unknown, method: unknown, payload: unknown) => Promise<never>>(
    async () => ({ ok: true, result: true }) as never,
  );
  api.config.use(send);
  const now = new Date("2026-10-09T04:00:00Z");
  const donatedAt = (now.getTime() - 90 * DAY_MS) / 1000;
  const job = { type: "cooldown_reminder" as const, userId: 1, donatedAt };
  return { sqlite, db, queue, sendBatch, api, send, now, donatedAt, job };
}

describe("Cooldown reminders", () => {
  it("selects only linked active donors at or beyond 90 days with a recorded donation", async () => {
    const { sqlite, db, queue, sendBatch, now, donatedAt, job } = setup();
    const insert = sqlite.prepare("INSERT INTO users VALUES (?, ?, ?, ?)");
    insert.run(1, "Donor", 123, donatedAt);
    insert.run(2, "Donor", 124, donatedAt + 1);
    insert.run(3, "Reserved", 125, donatedAt);
    insert.run(4, "Temporary", 126, donatedAt);
    insert.run(5, "Donor", null, donatedAt);
    insert.run(6, "pending", 127, donatedAt);
    insert.run(7, "Donor", 128, -62167219200);
    await enqueueCooldownReminders(db, queue, now);
    expect(sendBatch).toHaveBeenCalledExactlyOnceWith([{ body: job, contentType: "json" }]);
    sqlite.close();
  });

  it("sends a reminder once and stops selecting that donation", async () => {
    const { sqlite, db, queue, sendBatch, api, send, now, donatedAt, job } = setup();
    sqlite.prepare("INSERT INTO users VALUES (1, 'Donor', 123, ?)").run(donatedAt);
    await expect(sendCooldownReminder(api, db, job, now)).resolves.toBe(true);
    await expect(sendCooldownReminder(api, db, job, now)).resolves.toBe(false);
    await enqueueCooldownReminders(db, queue, now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[2]).toMatchObject({ chat_id: 123 });
    expect(sendBatch).not.toHaveBeenCalled();
    // A new donation becomes eligible independently of the previous reminder.
    sqlite.prepare("UPDATE users SET last_donated_at = ? WHERE id = 1").run(donatedAt + 1);
    await enqueueCooldownReminders(db, queue, new Date(now.getTime() + DAY_MS));
    expect(sendBatch).toHaveBeenCalledTimes(1);
    sqlite.close();
  });

  it.each([
    ["Donor", 123, 1],
    ["Temporary", 123, 0],
    ["Donor", null, 0],
  ])("skips stale or ineligible jobs (%s, %s, %s)", async (status, chat, delta) => {
    const { sqlite, db, api, send, now, donatedAt, job } = setup();
    sqlite
      .prepare("INSERT INTO users VALUES (1, ?, ?, ?)")
      .run(status, chat, donatedAt + Number(delta));
    await expect(sendCooldownReminder(api, db, job, now)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    sqlite.close();
  });

  it("keeps unsuccessful deliveries eligible for retry", async () => {
    const { sqlite, db, queue, api, send, sendBatch, now, donatedAt, job } = setup();
    sqlite.prepare("INSERT INTO users VALUES (1, 'Donor', 123, ?)").run(donatedAt);
    send.mockRejectedValueOnce(new Error("delivery failed"));
    await expect(sendCooldownReminder(api, db, job, now)).rejects.toThrow("delivery failed");
    await enqueueCooldownReminders(db, queue, now);
    expect(sendBatch).toHaveBeenCalledTimes(1);
    sqlite.close();
  });

  it("marks only historical expired cooldowns completed during rollout", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, last_donated_at INTEGER);
      INSERT INTO users VALUES
        (1, unixepoch('now', '-91 days')),
        (2, unixepoch('now', '-89 days'));`);
    sqlite.exec(
      readFileSync(new URL("../../drizzle/0005_cooldown-reminders.sql", import.meta.url), "utf8"),
    );
    expect(
      sqlite
        .prepare("SELECT user_id FROM cooldown_reminders")
        .all()
        .map((row) => row.user_id),
    ).toEqual([1]);
    sqlite.close();
  });

  it("validates cooldown job bodies", () => {
    const { sqlite, job } = setup();
    expect(parseTelegramNotificationJob(job)).toEqual(job);
    expect(parseTelegramNotificationJob({ ...job, donatedAt: "123" })).toBeUndefined();
    expect(parseTelegramNotificationJob({ ...job, userId: 0 })).toBeUndefined();
    sqlite.close();
  });
});
