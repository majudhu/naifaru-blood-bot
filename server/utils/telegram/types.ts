import type { BotConfig, Context, SessionFlavor } from "grammy";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "../../schema";
import type { bloodTypeValues } from "../../../shared/utils/const";

export type AppDb = DrizzleD1Database<typeof schema>;
export type BloodType = Exclude<(typeof bloodTypeValues)[number], "">;

export type TelegramSession = {
  pendingHelpRequestId?: number;
};

export type TelegramContext = Context & SessionFlavor<TelegramSession>;

export type TelegramConfig = {
  botInfo?: BotConfig<Context>["botInfo"];
  botToken: string;
  botUsername?: string;
  channelId?: number | string;
  webhookSecret?: string;
};

export type TelegramEnv = Partial<Env> & {
  TELEGRAM_BOT_INFO?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_CHANNEL_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};
