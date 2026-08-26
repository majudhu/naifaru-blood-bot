import { describe, expect, it, vi } from "vitest";
import type { Update } from "grammy/types";

import type { User } from "../../server/schema";
import { createTelegramBot } from "../../server/utils/telegram/bot";
import type { AppDb } from "../../server/utils/telegram/types";
import { DATE_NIL } from "../../shared/utils/const";
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
    lastDonatedAt: new Date(DATE_NIL),
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

function callbackUpdate(updateId: number, data: string): Update {
  return {
    callback_query: {
      chat_instance: "test",
      data,
      from: { first_name: "Aisha", id: 12345, is_bot: false },
      id: String(updateId),
      message: {
        chat: { first_name: "Aisha", id: 12345, type: "private" },
        date: 0,
        message_id: updateId,
      },
    },
    update_id: updateId,
  };
}

function testBot(db: ReturnType<typeof createDbMock>) {
  const calls: ApiCall[] = [];
  const events: string[] = [];
  const sendNotificationBatch = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {
    events.push("queue:sendBatch");
  });
  const notificationQueue = {
    sendBatch: sendNotificationBatch,
  } as unknown as Parameters<typeof createTelegramBot>[0]["notificationQueue"];
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
    notificationQueue,
  });

  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as unknown as Record<string, unknown> });
    events.push(`telegram:${method}`);
    return {
      ok: true,
      result: {
        chat: { first_name: "Aisha", id: 12345, type: "private" },
        date: 0,
        message_id: calls.length,
      },
    } as never;
  });

  return { bot, calls, events, sendNotificationBatch };
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

  it("queues matching donor notifications when creating a blood request", async () => {
    const db = createDbMock();
    const requester = user({ id: 7 });
    const request = {
      bloodType: "O+" as const,
      createdAt: new Date("2026-01-01"),
      id: 21,
      island: "Naifaru",
      location: "",
      notes: "",
      status: "open" as const,
      telegramChatId: null,
      telegramMessageId: null,
      unitsNeeded: 1,
      updatedAt: new Date("2026-01-01"),
      urgent: false,
      userId: requester.id,
    };
    const readyDonor = user({ id: 8, telegramUserId: 45678 });

    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([requester]);
    db.queueSelect([readyDonor]);
    db.queueInsert([]);
    db.queueInsert([request]);
    db.queueUpdate([]);
    const { bot, calls, events, sendNotificationBatch } = testBot(db);

    await bot.handleUpdate(callbackUpdate(5, "request:type:O+"));

    expect(sendNotificationBatch).toHaveBeenCalledWith([
      {
        body: {
          donorId: readyDonor.id,
          requestId: request.id,
          type: "donor_notification",
        },
        contentType: "json",
      },
    ]);
    expect(sentTexts(calls)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Request sent to channel"),
        expect.stringContaining("Available O+ donors"),
      ]),
    );
    expect(events.at(-1)).toBe("queue:sendBatch");
  });
});
