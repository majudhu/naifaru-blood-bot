import { createError } from "h3";

import type { TelegramConfig, TelegramEnv } from "./types";

function parseChannelId(value: string) {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function parseBotInfo(value: string) {
  return JSON.parse(value) as TelegramConfig["botInfo"];
}

export function getTelegramConfig(env: TelegramEnv): TelegramConfig {
  return {
    botInfo: parseBotInfo(env.TELEGRAM_BOT_INFO),
    botToken: env.TELEGRAM_BOT_TOKEN.trim(),
    botUsername: env.TELEGRAM_BOT_USERNAME.trim(),
    channelId: parseChannelId(env.TELEGRAM_CHANNEL_ID),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET.trim(),
  };
}

export function assertTelegramWebhookSecret(actual: string | undefined, expected: string) {
  if (actual === expected) return;

  throw createError({
    statusCode: 401,
    statusMessage: "Invalid Telegram webhook secret",
  });
}
