import type { BotConfig, Context, SessionFlavor } from "grammy";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import type * as schema from "../../schema";
import type { bloodTypeValues } from "../../../shared/utils/const";

export type AppDb = DrizzleD1Database<typeof schema>;
export type BloodType = Exclude<(typeof bloodTypeValues)[number], "">;

export type RequestDraft = {
  bloodType: BloodType;
  location?: string;
  unitsNeeded?: number;
};

export type BotFlow =
  | { kind: "request_location"; draft: RequestDraft }
  | { kind: "request_units"; draft: RequestDraft }
  | { kind: "request_urgent"; draft: RequestDraft }
  | { kind: "profile_nid" }
  | { kind: "profile_dob" }
  | { kind: "profile_address" }
  | { kind: "profile_island" };

export type TelegramSession = {
  flow?: BotFlow;
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
