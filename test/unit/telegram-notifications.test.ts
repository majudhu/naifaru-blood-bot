import { Api, GrammyError, HttpError } from "grammy";
import { describe, expect, it, vi } from "vitest";

import {
  classifyTelegramDeliveryError,
  enqueueDonorNotifications,
  enqueueRegistrationNotification,
  findDonorNotification,
  parseDonorNotificationJob,
  parseTelegramNotificationJob,
  registrationOutcomeMessages,
  sendRegistrationNotification,
} from "../../server/utils/telegram/notifications";
import type { TelegramConfig, AppDb } from "../../server/utils/telegram/types";
import { createDbMock } from "./api-test-utils";

describe("Telegram donor notification queue", () => {
  it("publishes only donors with Telegram user IDs in queue-sized batches", async () => {
    const sendBatch = vi.fn<(messages: unknown[]) => Promise<void>>(async () => undefined);
    const queue = { sendBatch } as unknown as Parameters<typeof enqueueDonorNotifications>[0];
    const donors = Array.from({ length: 102 }, (_, index) => ({
      id: index + 1,
      telegramUserId: index === 50 ? null : 10_000 + index,
    }));

    await enqueueDonorNotifications(queue, donors, { id: 77 });

    expect(sendBatch).toHaveBeenCalledTimes(2);
    expect(sendBatch.mock.calls[0]?.[0]).toHaveLength(100);
    expect(sendBatch.mock.calls[1]?.[0]).toEqual([
      {
        body: {
          donorId: 102,
          requestId: 77,
          type: "donor_notification",
        },
        contentType: "json",
      },
    ]);
  });

  it("validates queue message bodies", () => {
    expect(
      parseDonorNotificationJob({ donorId: 4, requestId: 8, type: "donor_notification" }),
    ).toEqual({ donorId: 4, requestId: 8, type: "donor_notification" });
    expect(parseDonorNotificationJob({ donorId: "4", requestId: 8 })).toBeUndefined();
    expect(parseDonorNotificationJob(null)).toBeUndefined();
  });

  it("retries transient failures and discards unreachable chats", () => {
    const rateLimit = new GrammyError(
      "Call failed",
      {
        description: "Too Many Requests",
        error_code: 429,
        ok: false,
        parameters: { retry_after: 17 },
      },
      "sendMessage",
      {},
    );
    const missingChat = new GrammyError(
      "Call failed",
      {
        description: "Bad Request: chat not found",
        error_code: 400,
        ok: false,
      },
      "sendMessage",
      {},
    );

    expect(classifyTelegramDeliveryError(rateLimit, 1)).toEqual({
      action: "retry",
      delaySeconds: 17,
    });
    expect(classifyTelegramDeliveryError(new HttpError("Network failed", new Error()), 3)).toEqual({
      action: "retry",
      delaySeconds: 120,
    });
    expect(classifyTelegramDeliveryError(missingChat, 1)).toEqual({ action: "discard" });
    expect(classifyTelegramDeliveryError(new Error("unexpected"), 1)).toBeUndefined();
  });
});

describe("Registration notification queue", () => {
  const config: TelegramConfig = {
    botInfo: undefined,
    botToken: "999:test",
    botUsername: "blood_test_bot",
    channelId: -100123,
    adminGroupId: -100456,
    webhookSecret: "secret",
  };

  function interceptedApi() {
    const api = new Api(config.botToken);
    const calls: Record<string, unknown>[] = [];
    api.config.use(async (_previous, _method, payload) => {
      calls.push(payload as unknown as Record<string, unknown>);
      return { ok: true, result: true } as never;
    });
    return { api, calls };
  }

  it("validates submission and review jobs while supporting existing donor jobs", () => {
    const submitted = { type: "registration_submitted", userId: 7 };
    const reviewed = {
      type: "registration_reviewed",
      userId: 7,
      telegramUserId: 12345,
      status: "Donor",
    };
    expect(parseTelegramNotificationJob(submitted)).toEqual(submitted);
    const adminDm = { type: "registration_admin_dm", userId: 7, recipientUserId: 17 };
    expect(parseTelegramNotificationJob(adminDm)).toEqual(adminDm);
    expect(parseTelegramNotificationJob({ ...adminDm, recipientUserId: "17" })).toBeUndefined();
    expect(parseTelegramNotificationJob({ ...adminDm, recipientUserId: 0 })).toBeUndefined();
    expect(parseTelegramNotificationJob(reviewed)).toEqual(reviewed);
    expect(parseTelegramNotificationJob({ ...reviewed, status: "Temporary" })).toEqual({
      ...reviewed,
      status: "Temporary",
    });
    expect(parseTelegramNotificationJob({ ...reviewed, status: "Reserved" })).toEqual({
      ...reviewed,
      status: "Reserved",
    });
    expect(parseTelegramNotificationJob({ ...submitted, userId: "7" })).toBeUndefined();
    expect(parseTelegramNotificationJob({ ...submitted, userId: 0 })).toBeUndefined();
    expect(
      parseTelegramNotificationJob({ ...reviewed, telegramUserId: undefined }),
    ).toBeUndefined();
    expect(parseTelegramNotificationJob({ ...reviewed, status: "pending" })).toBeUndefined();
    expect(
      parseTelegramNotificationJob({ type: "donor_notification", donorId: 4, requestId: 8 }),
    ).toEqual({ type: "donor_notification", donorId: 4, requestId: 8 });
  });

  it("publishes registration messages to the existing queue", async () => {
    const sendBatch = vi.fn<(messages: unknown[]) => Promise<void>>(async () => {});
    const queue = { sendBatch } as unknown as Parameters<typeof enqueueRegistrationNotification>[0];
    const job = { type: "registration_submitted" as const, userId: 7 };
    await enqueueRegistrationNotification(queue, job);
    expect(sendBatch).toHaveBeenCalledExactlyOnceWith([
      { body: job, contentType: "json" },
      {
        body: { type: "registration_admin_dm", userId: 7, recipientUserId: 17 },
        contentType: "json",
      },
    ]);
  });

  it("DMs the web admin using user 17's linked Telegram ID", async () => {
    const db = createDbMock();
    db.queueSelect([
      { id: 7, name: "<Aisha>", phone: "7771234", bloodType: "O+", telegramUserId: 12345 },
    ]);
    db.queueSelect([{ telegramUserId: 987654321 }]);
    const { api, calls } = interceptedApi();
    await expect(
      sendRegistrationNotification(api, config, db as unknown as AppDb, {
        type: "registration_admin_dm",
        userId: 7,
        recipientUserId: 17,
      }),
    ).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ chat_id: 987654321, parse_mode: "HTML" });
    expect(calls[0]?.text).toContain("&lt;Aisha&gt;");
    expect(calls[0]?.text).toContain("7771234");
    expect(calls[0]?.text).toContain("Pending Review");
    expect(calls[0]?.text).toContain('href="tg://user?id=12345"');
    expect(calls[0]?.text).toContain('href="https://naifaru-blood-bot.majudhu.workers.dev"');
  });

  it.each([{ recipient: [] }, { recipient: [{ telegramUserId: null }] }])(
    "skips an admin DM without a linked Telegram account (%j)",
    async ({ recipient }) => {
      const db = createDbMock();
      db.queueSelect([{ id: 7, name: "Aisha", phone: "7771234", bloodType: "O+" }]);
      db.queueSelect(recipient);
      const { api, calls } = interceptedApi();
      await expect(
        sendRegistrationNotification(api, config, db as unknown as AppDb, {
          type: "registration_admin_dm",
          userId: 7,
          recipientUserId: 17,
        }),
      ).resolves.toBe(false);
      expect(calls).toEqual([]);
    },
  );

  it("sends escaped applicant details to the admin group", async () => {
    const db = createDbMock();
    db.queueSelect([
      { id: 7, name: "<Aisha>", phone: "7771234", bloodType: "O+", telegramUserId: 12345 },
    ]);
    const { api, calls } = interceptedApi();
    await expect(
      sendRegistrationNotification(api, config, db as unknown as AppDb, {
        type: "registration_submitted",
        userId: 7,
      }),
    ).resolves.toBe(true);
    expect(calls[0]).toMatchObject({ chat_id: config.adminGroupId, parse_mode: "HTML" });
    expect(calls[0]?.text).toContain("&lt;Aisha&gt;");
    expect(calls[0]?.text).toContain("7771234");
    expect(calls[0]?.text).toContain("O+");
    expect(calls[0]?.text).toContain("Pending Review");
    expect(calls[0]?.text).toContain('href="tg://user?id=12345"');
    expect(calls[0]?.text).toContain('href="https://naifaru-blood-bot.majudhu.workers.dev"');
  });

  it.each(["Donor", "Reserved", "Temporary", "Non-Donor"] as const)(
    "delivers the captured %s decision to the applicant",
    async (status) => {
      const db = createDbMock();
      const { api, calls } = interceptedApi();
      await sendRegistrationNotification(api, config, db as unknown as AppDb, {
        type: "registration_reviewed",
        userId: 7,
        telegramUserId: 12345,
        status,
      });
      expect(calls[0]).toMatchObject({ chat_id: 12345, text: registrationOutcomeMessages[status] });
      expect(db.select).not.toHaveBeenCalled();
    },
  );

  it("skips missing applicants and does not send queued blood notifications to pending users", async () => {
    const db = createDbMock();
    const { api, calls } = interceptedApi();
    await expect(
      sendRegistrationNotification(api, config, db as unknown as AppDb, {
        type: "registration_submitted",
        userId: 7,
      }),
    ).resolves.toBe(false);
    expect(calls).toEqual([]);
    db.queueSelect([{ id: 8, status: "open", userId: 9 }]);
    db.queueSelect([{ id: 7, status: "pending", telegramUserId: 12345 }]);
    await expect(
      findDonorNotification(db as unknown as AppDb, {
        type: "donor_notification",
        requestId: 8,
        donorId: 7,
      }),
    ).resolves.toEqual({ status: "skip", reason: "donor_not_eligible" });
  });
});
