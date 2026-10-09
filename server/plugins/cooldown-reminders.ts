import { createDb } from "../utils/db";
import { COOLDOWN_REMINDER_CRON, enqueueCooldownReminders } from "../utils/telegram/cooldown";
import type { TelegramEnv } from "../utils/telegram/types";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async ({ controller, env }) => {
    if (controller.cron !== COOLDOWN_REMINDER_CRON) return;
    const telegramEnv = env as TelegramEnv;
    await enqueueCooldownReminders(
      createDb(telegramEnv.DB),
      telegramEnv.TELEGRAM_DONOR_NOTIFICATIONS,
      new Date(controller.scheduledTime),
    );
  });
});
