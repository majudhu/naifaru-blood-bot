import { createError, defineEventHandler, getHeader, readBody } from "h3";
import type { Update } from "grammy/types";

import { createTelegramBot, createTelegramWebhookResponse } from "../../utils/telegram/bot";
import { assertTelegramWebhookSecret, getTelegramConfig } from "../../utils/telegram/config";
import type { TelegramEnv } from "../../utils/telegram/types";

export default defineEventHandler(async (event) => {
  const cloudflare = event.context.cloudflare;
  const config = getTelegramConfig((cloudflare?.env ?? process.env) as TelegramEnv);
  const db = useDb(event);

  if (cloudflare?.request) {
    return createTelegramWebhookResponse({
      config,
      db,
      request: cloudflare.request,
    });
  }

  assertTelegramWebhookSecret(
    getHeader(event, "X-Telegram-Bot-Api-Secret-Token") ?? undefined,
    config.webhookSecret,
  );

  const update = await readBody<Update>(event);
  if (!update || typeof update.update_id !== "number") {
    throw createError({ statusCode: 400, statusMessage: "Invalid Telegram update" });
  }

  await createTelegramBot({ config, db }).handleUpdate(update);
  return { ok: true };
});
