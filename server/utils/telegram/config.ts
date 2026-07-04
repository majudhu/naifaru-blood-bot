import { createError } from "h3";

import type { TelegramConfig, TelegramEnv } from "./types";

function parseChannelId(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function parseBotInfo(value: string | undefined) {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as TelegramConfig["botInfo"];
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 500,
      statusMessage: "Invalid TELEGRAM_BOT_INFO JSON",
    });
  }
}

export function getTelegramConfig(env: TelegramEnv): TelegramConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken)
    throw createError({
      statusCode: 500,
      statusMessage: "Missing TELEGRAM_BOT_TOKEN",
    });

  const botInfo = parseBotInfo(env.TELEGRAM_BOT_INFO);

  return {
    botInfo,
    botToken,
    botUsername:
      env.TELEGRAM_BOT_USERNAME?.trim() || botInfo?.username || undefined,
    channelId: parseChannelId(env.TELEGRAM_CHANNEL_ID),
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
  };
}

export function assertTelegramWebhookSecret(actual: string | undefined, expected?: string) {
  if (!expected || actual === expected) return;

  throw createError({
    statusCode: 401,
    statusMessage: "Invalid Telegram webhook secret",
  });
}
