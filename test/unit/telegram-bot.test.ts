import { describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";

import type { User } from "../../server/schema";
import { createTelegramBot } from "../../server/utils/telegram/bot";
import type { AppDb } from "../../server/utils/telegram/types";
import { createDbMock } from "./api-test-utils";

type ApiCall = {
  method: string;
  payload: Record<string, unknown>;
};

function user(overrides: Partial<User> = {}): User {
  return {
    address: "Harbour Road",
    bloodType: "O+",
    createdAt: new Date("2026-01-01"),
    dob: new Date("1990-01-01"),
    id: 7,
    island: "Naifaru",
    isAvailable: true,
    lastDonatedAt: new Date("1970-01-01"),
    name: "Aisha",
    nid: "A123456",
    notes: "",
    phone: "7771234",
    sex: "f",
    telegramUserId: 12345,
    telegramUsername: "aisha",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function textUpdate(updateId: number, text: string): Update {
  return {
    message: {
      chat: { first_name: "Aisha", id: 12345, type: "private" },
      date: 0,
      from: { first_name: "Aisha", id: 12345, is_bot: false },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function contactUpdate(updateId: number): Update {
  return {
    message: {
      chat: { first_name: "Aisha", id: 12345, type: "private" },
      contact: {
        first_name: "Aisha",
        phone_number: "+9607771234",
        user_id: 12345,
      },
      date: 0,
      from: { first_name: "Aisha", id: 12345, is_bot: false },
      message_id: updateId,
    },
    update_id: updateId,
  };
}

function testBot(db: ReturnType<typeof createDbMock>) {
  const calls: ApiCall[] = [];
  const bot = createTelegramBot({
    config: {
      botInfo: {
        allows_users_to_create_topics: false,
        can_connect_to_business: false,
        can_join_groups: true,
        can_manage_bots: false,
        can_read_all_group_messages: false,
        first_name: "Blood Bot",
        has_main_web_app: false,
        has_topics_enabled: false,
        id: 999,
        is_bot: true,
        supports_join_request_queries: false,
        supports_inline_queries: false,
        username: "blood_test_bot",
      },
      botToken: "999:test",
      botUsername: "blood_test_bot",
      channelId: -100123,
      webhookSecret: "secret",
    },
    db: db as unknown as AppDb,
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  });

  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as unknown as Record<string, unknown> });
    return {
      ok: true,
      result: {
        chat: { first_name: "Aisha", id: 12345, type: "private" },
        date: 0,
        message_id: calls.length,
      },
    } as never;
  });

  return { bot, calls };
}

function sentTexts(calls: ApiCall[]) {
  return calls.filter(({ method }) => method === "sendMessage").map(({ payload }) => payload.text);
}

describe("Telegram text fallback", () => {
  it("shows blood groups when a registered user sends arbitrary text", async () => {
    const db = createDbMock();
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([user()]);
    db.queueSelect([]);
    db.queueInsert([]);
    db.queueInsert([]);
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(textUpdate(1, "hello"));

    expect(sentTexts(calls)).toEqual(["Select the blood group you need."]);
    expect(calls[0]?.payload.reply_markup).toMatchObject({
      inline_keyboard: expect.arrayContaining([
        expect.arrayContaining([expect.objectContaining({ callback_data: "request:type:O+" })]),
      ]),
    });
  });

  it("keeps a pending help offer active instead of starting a blood request", async () => {
    const db = createDbMock();
    db.queueSelect([]);
    db.queueSelect([{ value: JSON.stringify({ pendingHelpRequestId: 77 }) }]);
    db.queueSelect([{ key: "user:12345" }]);
    db.queueInsert([]);
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(textUpdate(2, "hello"));

    expect(sentTexts(calls)).toEqual([
      "Welcome to Naifaru Blood Donors. Please press START to share your contact.",
    ]);
    expect(calls[0]?.payload.reply_markup).toMatchObject({
      keyboard: [[expect.objectContaining({ request_contact: true, text: "START" })]],
    });
  });

  it("continues to blood-group selection after an unregistered user shares contact", async () => {
    const db = createDbMock();
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([{ value: JSON.stringify({ pendingBloodRequest: true }) }]);
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([{ key: "user:12345" }]);
    db.queueInsert([]);
    db.queueInsert([]);
    db.queueInsert([]);
    db.queueInsert([user()]);
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(textUpdate(3, "I need blood"));
    await bot.handleUpdate(contactUpdate(4));

    expect(sentTexts(calls)).toEqual([
      "Welcome to Naifaru Blood Donors. Please press START to share your contact.",
      "Registration saved.",
      "Select the blood group you need.",
    ]);
  });
});
