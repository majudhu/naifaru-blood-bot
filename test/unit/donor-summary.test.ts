import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { Api } from "grammy";
import { describe, expect, it } from "vitest";

import { formatDonorSummary, sendDonorSummary } from "../../server/utils/telegram/donor-summary";
import { parseTelegramNotificationJob } from "../../server/utils/telegram/notifications";
import type { AppDb, TelegramConfig } from "../../server/utils/telegram/types";

describe("Admin donor summary", () => {
  it("counts all donor statuses and waiting periods per blood group", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, blood_type TEXT, status TEXT, last_donated_at INTEGER,
        name TEXT DEFAULT '<Aisha> Ahmed');
      INSERT INTO users (blood_type, status, last_donated_at) VALUES
        ('A+', 'Donor', unixepoch('now', '-90 days')),
        ('A+', 'Donor', unixepoch('now', '-89 days')),
        ('A+', 'Temporary', unixepoch('now', '-89 days')),
        ('O-', 'Reserved', unixepoch('now', '-91 days')),
        ('', 'Donor', -62167219200),
        ('A+', 'pending', unixepoch('now')),
        ('A+', 'Non-Donor', unixepoch('now'));`);
    const db = drizzle(async (sql, params) => {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      return { rows: statement.all(...params) as unknown as unknown[][] };
    }) as unknown as AppDb;
    const config: TelegramConfig = {
      botInfo: undefined,
      botToken: "123:test",
      botUsername: "test_bot",
      channelId: -100111,
      adminGroupId: -100222,
      webhookSecret: "secret",
    };
    const api = new Api(config.botToken);
    const calls: Record<string, unknown>[] = [];
    api.config.use(async (_previous, _method, payload) => {
      calls.push(payload as unknown as Record<string, unknown>);
      return { ok: true, result: true } as never;
    });
    await sendDonorSummary(api, config, db, 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ chat_id: config.adminGroupId, parse_mode: "HTML" });
    const message = calls[0]?.text;
    expect(message).toContain("New donor: <b>&lt;Aisha&gt; Ahmed A+</b>\nTotal: 5");
    expect(String(message).split("\n")).toHaveLength(11);
    expect(message).not.toContain("By blood group");
    expect(message).toContain("Total: 5");
    expect(message).toContain("Donor: 3");
    expect(message).toContain("Cooldown: 2 ⏳");
    expect(message).toContain("Temp: 1 🕒");
    expect(message).toContain("Reserved: 1 🔒");
    expect(message).toContain("A+: 3 • 2 ⏳ • 1 🕒 • 0 🔒");
    expect(message).toContain("O-: 1 • 0 ⏳ • 0 🕒 • 1 🔒");
    expect(message).toContain("AB-: 0 • 0 ⏳ • 0 🕒 • 0 🔒");
    expect(message).toContain("Unknown: 1");
    sqlite.close();
  });

  it("shows zero totals for an empty donor list", () => {
    const message = formatDonorSummary({ name: "Aisha", bloodType: "O+" }, []);
    expect(message).toContain("Total: 0");
    expect(message).toContain("Cooldown: 0 ⏳");
    expect(message).not.toContain("Unknown");
  });

  it("validates summary jobs", () => {
    expect(parseTelegramNotificationJob({ type: "donor_summary", userId: 12 })).toEqual({
      type: "donor_summary",
      userId: 12,
    });
    expect(parseTelegramNotificationJob({ type: "donor_summary", userId: 0 })).toBeUndefined();
  });
});
