import { formatDonorProfile } from "../../server/utils/telegram/format";
import { mainMenuKeyboard } from "../../server/utils/telegram/keyboards";
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
    status: "Donor",
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
  const command = /^\/\S+/.exec(text)?.[0];
  return {
    message: {
      chat: { first_name: "Aisha", id: 12345, type: "private" },
      date: 0,
      entities: command ? [{ length: command.length, offset: 0, type: "bot_command" }] : undefined,
      from: { first_name: "Aisha", id: 12345, is_bot: false },
      message_id: updateId,
      text,
    },
    update_id: updateId,
  };
}

function stickerUpdate(updateId: number): Update {
  return {
    message: {
      chat: { first_name: "Aisha", id: 12345, type: "private" },
      date: 0,
      from: { first_name: "Aisha", id: 12345, is_bot: false },
      message_id: updateId,
      sticker: {
        file_id: "sticker",
        file_unique_id: "sticker-unique",
        height: 512,
        is_animated: false,
        is_video: false,
        type: "regular",
        width: 512,
      },
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

describe("Telegram message fallback", () => {
  it.each(["Donor", "Temporary", "Reserved", "Non-Donor"] as const)(
    "refreshes the menu and blood groups when a %s sends arbitrary text",
    async (status) => {
      const db = createDbMock();
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([user({ status })]);
      db.queueSelect([]);
      db.queueInsert([]);
      db.queueInsert([]);
      const { bot, calls } = testBot(db);

      await bot.handleUpdate(textUpdate(1, "hello"));

      expect(sentTexts(calls)).toEqual([
        "Choose an option below.",
        "Select the blood group you need.",
      ]);
      expect(calls[0]?.payload.reply_markup).toMatchObject({
        keyboard:
          status === "Non-Donor"
            ? [[{ text: "Request Blood" }]]
            : [[{ text: "Request Blood" }], [{ text: "My Donor Profile" }]],
      });
      expect(calls[1]?.payload.reply_markup).toMatchObject({
        inline_keyboard: expect.arrayContaining([
          expect.arrayContaining([expect.objectContaining({ callback_data: "request:type:O+" })]),
        ]),
      });
      const inlineKeyboard = calls[1]?.payload.reply_markup as {
        inline_keyboard: { text: string }[][];
      };
      expect(
        inlineKeyboard.inline_keyboard.flat().some(({ text }) => text === "My Donor Profile"),
      ).toBe(status !== "Non-Donor");
    },
  );

  it.each([
    { name: "unknown commands", update: textUpdate(1, "/unknown") },
    { name: "stickers", update: stickerUpdate(1) },
  ])("shows the donor menu for $name in private chats", async ({ update }) => {
    const db = createDbMock();
    db.queueSelect([]);
    db.queueSelect([]);
    db.queueSelect([user()]);
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(update);

    expect(sentTexts(calls)).toEqual([
      "Choose an option below.",
      "Select the blood group you need.",
    ]);
    expect(calls[0]?.payload.reply_markup).toMatchObject({
      keyboard: expect.arrayContaining([[expect.objectContaining({ text: "My Donor Profile" })]]),
    });
  });

  it("updates both menus after a linked user's donor status changes", async () => {
    const db = createDbMock();
    for (const status of ["Non-Donor", "Donor", "Non-Donor"] as const) {
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([user({ status })]);
      db.queueSelect([]);
    }
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(textUpdate(1, "hello"));
    await bot.handleUpdate(textUpdate(2, "hello again"));
    await bot.handleUpdate(textUpdate(3, "hello again"));

    for (const [index, hasProfile] of [false, true, false].entries()) {
      const mainMenu = calls[index * 2]?.payload.reply_markup as {
        keyboard: { text: string }[][];
      };
      const bloodGroups = calls[index * 2 + 1]?.payload.reply_markup as {
        inline_keyboard: { text: string }[][];
      };
      expect(mainMenu.keyboard.flat().some(({ text }) => text === "My Donor Profile")).toBe(
        hasProfile,
      );
      expect(
        bloodGroups.inline_keyboard.flat().some(({ text }) => text === "My Donor Profile"),
      ).toBe(hasProfile);
    }
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

  it.each(["Donor", "Non-Donor"] as const)(
    "continues to blood-group selection after sharing contact registers a %s",
    async (status) => {
      const db = createDbMock();
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([{ value: JSON.stringify({ pendingBloodRequest: true }) }]);
      db.queueSelect([]);
      db.queueSelect(status === "Non-Donor" ? [] : [user({ status, telegramUserId: null })]);
      db.queueSelect([{ key: "user:12345" }]);
      db.queueInsert([]);
      db.queueInsert([]);
      db.queueInsert([]);
      if (status === "Non-Donor") db.queueInsert([user({ status })]);
      const { bot, calls } = testBot(db);

      await bot.handleUpdate(textUpdate(3, "I need blood"));
      await bot.handleUpdate(contactUpdate(4));

      expect(sentTexts(calls)).toEqual([
        "Welcome to Naifaru Blood Donors. Please press START to share your contact.",
        "Registration saved.",
        "Select the blood group you need.",
      ]);
      const bloodGroups = calls[2]?.payload.reply_markup as {
        inline_keyboard: { text: string; callback_data: string }[][];
      };
      expect(
        bloodGroups.inline_keyboard
          .flat()
          .some(({ callback_data }) => callback_data === "donor:profile"),
      ).toBe(status !== "Non-Donor");
    },
  );

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

    const channelMessage = calls.find(
      (call) =>
        call.method === "sendMessage" && String(call.payload.text).includes("BLOOD REQUEST"),
    );
    expect(channelMessage?.payload.text).toContain("Requester: Aisha");
    expect(channelMessage?.payload.text).toContain("Phone/mobile: 7771234");
    expect(channelMessage?.payload.text).not.toContain("<a href=");

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

describe("Donor profiles", () => {
  it.each(["Donor", "Temporary", "Reserved", "Non-Donor"] as const)(
    "shows the profile button for every donor status: %s",
    (status) => {
      const buttons = mainMenuKeyboard(status)
        .keyboard.flat()
        .map((button) => (typeof button === "string" ? button : button.text));
      expect(buttons.includes("My Donor Profile")).toBe(status !== "Non-Donor");
    },
  );

  it.each(["Donor", "Temporary", "Reserved", "Non-Donor"] as const)(
    "checks current status when the inline profile button is pressed: %s",
    async (status) => {
      const db = createDbMock();
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([user({ status })]);
      const { bot, calls, sendNotificationBatch } = testBot(db);

      await bot.handleUpdate(callbackUpdate(10, "donor:profile"));

      expect(calls[0]).toMatchObject({
        method: "answerCallbackQuery",
        payload: { callback_query_id: "10" },
      });
      const texts = sentTexts(calls).join("\n");
      expect(texts.includes("Name: Aisha")).toBe(status !== "Non-Donor");
      expect(texts.includes("available only to registered donors")).toBe(status === "Non-Donor");
      expect(texts).not.toContain("BLOOD REQUEST");
      expect(sendNotificationBatch).not.toHaveBeenCalled();
    },
  );

  it("asks an unlinked user to share contact when pressing an old profile button", async () => {
    const db = createDbMock();
    const { bot, calls } = testBot(db);

    await bot.handleUpdate(callbackUpdate(10, "donor:profile"));

    expect(calls[0]?.method).toBe("answerCallbackQuery");
    expect(sentTexts(calls)).toEqual([
      "Welcome to Naifaru Blood Donors. Please press START to share your contact.",
    ]);
    expect(calls[1]?.payload.reply_markup).toMatchObject({
      keyboard: [[expect.objectContaining({ request_contact: true, text: "START" })]],
    });
  });

  it("keeps donor details private when an inline profile button is pressed in a group", async () => {
    const db = createDbMock();
    const { bot, calls } = testBot(db);
    const update = callbackUpdate(10, "donor:profile");
    if (!update.callback_query?.message) throw new Error("Missing callback message");
    update.callback_query.message.chat = { id: -12345, title: "Blood Donors", type: "group" };

    await bot.handleUpdate(update);

    expect(calls[0]?.method).toBe("answerCallbackQuery");
    expect(sentTexts(calls)).toEqual([
      "Please open a private chat with me to view your donor profile.",
    ]);
  });

  it("shows remaining days and the end date, escaping profile values", () => {
    const text = formatDonorProfile(
      user({
        name: "<Aisha>",
        lastDonatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      Date.parse("2026-03-31T12:00:00Z"),
    );
    expect(text).toContain("Name: &lt;Aisha&gt;");
    expect(text).toContain("Cooldown: Active");
    expect(text).toContain("Days remaining: 1");
    expect(text).toContain("Next eligible date: 1 April 2026");
  });

  it("ends cooldown exactly after 90 days", () => {
    const text = formatDonorProfile(
      user({
        lastDonatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      Date.parse("2026-04-01T00:00:00Z"),
    );
    expect(text).toContain("Cooldown: None");
    expect(text).toContain("Days remaining: 0");
  });

  it("does not show the sentinel as a donation date", () => {
    const text = formatDonorProfile(user());
    expect(text).toContain("Last donation: Not recorded");
    expect(text).toContain("Days remaining: 0");
    expect(text).not.toContain("0000");
  });

  it.each(["Donor", "Temporary", "Reserved", "Non-Donor"] as const)(
    "checks current status before returning a profile: %s",
    async (status) => {
      const db = createDbMock();
      db.queueSelect([]);
      db.queueSelect([]);
      db.queueSelect([user({ status })]);
      const { bot, calls } = testBot(db);
      await bot.handleUpdate(textUpdate(10, "My Donor Profile"));
      const texts = sentTexts(calls).join("\n");
      expect(texts.includes("Name: Aisha")).toBe(status !== "Non-Donor");
      expect(texts.includes("Cooldown: None")).toBe(status !== "Non-Donor");
      expect(texts.includes("available only to registered donors")).toBe(status === "Non-Donor");
      expect(texts.includes("Phone:")).toBe(status !== "Non-Donor");
    },
  );
});
