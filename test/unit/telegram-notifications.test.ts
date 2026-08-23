import { GrammyError, HttpError } from "grammy";
import { describe, expect, it, vi } from "vitest";

import {
  classifyTelegramDeliveryError,
  enqueueDonorNotifications,
  parseDonorNotificationJob,
} from "../../server/utils/telegram/notifications";

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
