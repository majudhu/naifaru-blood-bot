import { createError, defineEventHandler, getHeader, readBody } from "h3";
import type { Update } from "grammy/types";

import { createTelegramBot } from "../../utils/telegram/bot";
import { assertTelegramWebhookSecret, getTelegramConfig } from "../../utils/telegram/config";

export default defineEventHandler(async (event) => {
  const cloudflare = event.context.cloudflare;
  const config = getTelegramConfig(cloudflare.env);
  const db = useDb(event);

  assertTelegramWebhookSecret(
    getHeader(event, "X-Telegram-Bot-Api-Secret-Token"),
    config.webhookSecret,
  );

  const update = await readBody<Update>(event);
  if (!update || typeof update.update_id !== "number") {
    throw createError({ statusCode: 400, statusMessage: "Invalid Telegram update" });
  }

  await createTelegramBot({
    config,
    db,
    waitUntil: cloudflare.context.waitUntil.bind(cloudflare.context),
  }).handleUpdate(update);
  return { ok: true };
});
