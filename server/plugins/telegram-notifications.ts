import { Api } from "grammy";

import { createDb } from "../utils/db";
import { getTelegramConfig } from "../utils/telegram/config";
import {
  classifyTelegramDeliveryError,
  findDonorNotification,
  parseDonorNotificationJob,
  sendDonorNotification,
  TELEGRAM_DONOR_NOTIFICATION_QUEUE,
  telegramErrorDetails,
} from "../utils/telegram/notifications";
import type { TelegramEnv } from "../utils/telegram/types";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:queue", async ({ batch, env }) => {
    if (batch.queue !== TELEGRAM_DONOR_NOTIFICATION_QUEUE) return;

    const telegramEnv = env as TelegramEnv;
    const config = getTelegramConfig(telegramEnv);
    const db = createDb(telegramEnv.DB);
    const api = new Api(config.botToken);

    for (const message of batch.messages) {
      const job = parseDonorNotificationJob(message.body);
      if (!job) {
        console.error({
          event: "telegram_donor_notification_invalid",
          messageId: message.id,
        });
        message.ack();
        continue;
      }

      try {
        const result = await findDonorNotification(db, job);
        if (result.status === "skip") {
          console.warn({
            donorId: job.donorId,
            event: "telegram_donor_notification_skipped",
            reason: result.reason,
            requestId: job.requestId,
          });
          message.ack();
          continue;
        }

        await sendDonorNotification(api, config, result.notification);
        message.ack();
      } catch (error) {
        const disposition = classifyTelegramDeliveryError(error, message.attempts);
        const details = {
          attempt: message.attempts,
          donorId: job.donorId,
          requestId: job.requestId,
          ...telegramErrorDetails(error),
        };

        if (disposition?.action === "discard") {
          console.warn({
            event: "telegram_donor_notification_discarded",
            ...details,
          });
          message.ack();
          continue;
        }

        if (disposition?.action === "retry") {
          console.error({
            delaySeconds: disposition.delaySeconds,
            event: "telegram_donor_notification_retrying",
            ...details,
          });
          message.retry({ delaySeconds: disposition.delaySeconds });
          continue;
        }

        console.error({
          event: "telegram_donor_notification_failed",
          ...details,
        });
        throw error;
      }
    }
  });
});
