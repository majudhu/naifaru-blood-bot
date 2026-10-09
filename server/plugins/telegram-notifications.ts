import { Api } from "grammy";

import { completeCooldownReminder, sendCooldownReminder } from "../utils/telegram/cooldown";
import { createDb } from "../utils/db";
import { getTelegramConfig } from "../utils/telegram/config";
import {
  classifyTelegramDeliveryError,
  findDonorNotification,
  parseTelegramNotificationJob,
  sendDonorNotification,
  sendRegistrationNotification,
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
      const job = parseTelegramNotificationJob(message.body);
      if (!job) {
        console.error({
          event: "telegram_donor_notification_invalid",
          messageId: message.id,
        });
        message.ack();
        continue;
      }

      const userId = job.type === "donor_notification" ? job.donorId : job.userId;
      const requestId = job.type === "donor_notification" ? job.requestId : undefined;
      let chatId: number | string | undefined;
      try {
        if (job.type === "cooldown_reminder") {
          await sendCooldownReminder(api, db, job);
          message.ack();
          continue;
        }
        if (job.type !== "donor_notification") {
          if (job.type === "registration_submitted") chatId = config.adminGroupId;
          if (job.type === "registration_reviewed") chatId = job.telegramUserId;
          const sent = await sendRegistrationNotification(api, config, db, job);
          if (!sent)
            console.warn({
              event: "telegram_registration_delivery_skipped",
              userId,
              type: job.type,
              recipientUserId:
                job.type === "registration_admin_dm" ? job.recipientUserId : undefined,
            });
          message.ack();
          continue;
        }
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

        chatId = result.notification.chatId;
        await sendDonorNotification(api, config, result.notification);
        message.ack();
      } catch (error) {
        const disposition = classifyTelegramDeliveryError(error, message.attempts);
        const details = {
          attempt: message.attempts,
          userId,
          requestId,
          type: job.type,
          ...telegramErrorDetails(error),
        };

        if (disposition?.action === "discard") {
          if (job.type === "cooldown_reminder") await completeCooldownReminder(db, job);
          console.warn({
            chatId,
            event: "telegram_donor_notification_discarded",
            ...details,
            userId,
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
