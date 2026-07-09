import { Bot, session } from "grammy";

import { bloodRequestKeyboard, contactKeyboard, helpKeyboard, mainMenuKeyboard } from "./keyboards";
import {
  acceptHelpOffer,
  createBloodRequest,
  findMatchingTelegramUsers,
  findUserByTelegramId,
  isBlacklisted,
  isBloodType,
  normalizePhone,
  recordChannelMessage,
  upsertTelegramContactUser,
} from "./services";
import { createD1SessionStorage, markTelegramUpdateProcessed } from "./storage";
import {
  formatChannelRequest,
  formatDonorContact,
  formatMatchingRequestNotification,
  formatRequesterContact,
} from "./format";
import type { AppDb, TelegramConfig, TelegramContext, TelegramSession } from "./types";

const html = { parse_mode: "HTML" as const };

async function promptForContact(ctx: TelegramContext) {
  await ctx.reply("Welcome to Naifaru Blood Donors. Please press START to share your contact.", {
    reply_markup: contactKeyboard(),
  });
}

async function registeredUser(ctx: TelegramContext, db: AppDb) {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return undefined;

  const user = await findUserByTelegramId(db, telegramUserId);
  if (!user) {
    await promptForContact(ctx);
    return undefined;
  }

  if (
    await isBlacklisted(db, {
      phone: user.phone,
      telegramUserId,
      username: user.telegramUsername,
    })
  ) {
    await ctx.reply("Access denied. Please contact an administrator.");
    return undefined;
  }

  return user;
}

async function startRequest(ctx: TelegramContext, db: AppDb) {
  const user = await registeredUser(ctx, db);
  if (!user) return;

  await ctx.reply("Select the blood group you need.", {
    reply_markup: bloodRequestKeyboard(),
  });
}

async function offerHelp(ctx: TelegramContext, db: AppDb, requestId: number) {
  const donorTelegramUserId = ctx.from?.id;
  if (!donorTelegramUserId) return;

  const donor = await findUserByTelegramId(db, donorTelegramUserId);
  if (!donor) {
    ctx.session.pendingHelpRequestId = requestId;
    await promptForContact(ctx);
    return;
  }

  ctx.session.pendingHelpRequestId = requestId;
  const result = await acceptHelpOffer(db, { donorTelegramUserId, requestId });
  if (result.status !== "not_registered") ctx.session.pendingHelpRequestId = undefined;

  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});

  switch (result.status) {
    case "accepted":
      if (result.requester) {
        await ctx.reply(formatRequesterContact(result.requester), html);
        if (
          result.requester.telegramUserId &&
          result.requester.telegramUserId !== result.donor.telegramUserId
        ) {
          await ctx.api.sendMessage(
            result.requester.telegramUserId,
            formatDonorContact(result.donor),
            html,
          );
        }
      } else {
        await ctx.reply("Thanks for helping. Staff will contact you with requester details.");
      }
      return;
    case "already_accepted":
      if (result.requester) await ctx.reply(formatRequesterContact(result.requester), html);
      else await ctx.reply("You have already offered to help this request.");
      return;
    case "blacklisted":
      await ctx.reply("Access denied. Please contact an administrator.");
      return;
    case "cooldown":
      await ctx.reply("You are still in the donation cooldown window.");
      return;
    case "not_registered":
      ctx.session.pendingHelpRequestId = undefined;
      await promptForContact(ctx);
      return;
    case "profile_incomplete":
      await ctx.reply("Your donor details are not ready for matching yet. Please contact staff.", {
        reply_markup: mainMenuKeyboard(),
      });
      return;
    case "request_closed":
      await ctx.reply("This request is no longer open.");
      return;
    case "request_not_found":
      await ctx.reply("This request could not be found.");
      return;
    case "wrong_blood_type":
      await ctx.reply(
        `This request needs ${result.request.bloodType}, but your registered blood group is ${result.donor.bloodType}.`,
      );
      return;
  }
}

async function tryPendingHelp(ctx: TelegramContext, db: AppDb) {
  const requestId = ctx.session.pendingHelpRequestId;
  if (!requestId || !ctx.from?.id) return;

  const user = await findUserByTelegramId(db, ctx.from.id);
  if (!user) return;

  await offerHelp(ctx, db, requestId);
}

export function createTelegramBot(input: { config: TelegramConfig; db: AppDb }) {
  const bot = new Bot<TelegramContext>(input.config.botToken, {
    botInfo: input.config.botInfo,
  });

  bot.use(async (ctx, next) => {
    const processed = await markTelegramUpdateProcessed(input.db, ctx.update.update_id);
    if (!processed) return;
    await next();
  });

  bot.use(
    session({
      getSessionKey: (ctx) => (ctx.from ? `user:${ctx.from.id}` : undefined),
      initial: (): TelegramSession => ({}),
      storage: createD1SessionStorage<TelegramSession>(input.db),
    }),
  );

  bot.command("start", async (ctx) => {
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const requestIdMatch = /^help_(\d+)$/.exec(payload);
    const requestId = requestIdMatch ? Number(requestIdMatch[1]) : undefined;

    if (requestId) {
      await offerHelp(ctx, input.db, requestId);
      return;
    }

    const user = ctx.from ? await findUserByTelegramId(input.db, ctx.from.id) : undefined;
    if (!user) {
      await promptForContact(ctx);
      return;
    }

    await ctx.reply("Welcome back.", { reply_markup: mainMenuKeyboard() });
  });

  bot.command("request", (ctx) => startRequest(ctx, input.db));
  bot.hears("Request Blood", (ctx) => startRequest(ctx, input.db));

  bot.on("message:contact", async (ctx) => {
    const from = ctx.from;
    const contact = ctx.message.contact;
    if (!from) return;

    if (contact.user_id && contact.user_id !== from.id) {
      await ctx.reply("Please share your own contact using the START button.");
      return;
    }

    const phone = normalizePhone(contact.phone_number);
    if (
      await isBlacklisted(input.db, {
        phone,
        telegramUserId: from.id,
        username: from.username,
      })
    ) {
      await ctx.reply("Access denied. Please contact an administrator.");
      return;
    }

    await upsertTelegramContactUser(input.db, contact, from);
    await ctx.reply("Registration saved.", { reply_markup: mainMenuKeyboard() });
    await tryPendingHelp(ctx, input.db);
  });

  bot.callbackQuery(/^request:type:(.+)$/, async (ctx) => {
    const bloodType = ctx.callbackQuery.data.split(":").at(-1);
    if (!bloodType || !isBloodType(bloodType)) {
      await ctx.answerCallbackQuery({ text: "Invalid blood type" });
      return;
    }

    await ctx.answerCallbackQuery();

    const user = await registeredUser(ctx, input.db);
    if (!user) return;

    const request = await createBloodRequest(input.db, user, {
      bloodType,
    });

    if (input.config.channelId) {
      const message = await ctx.api.sendMessage(
        input.config.channelId,
        formatChannelRequest(request),
        {
          ...html,
          reply_markup: helpKeyboard(request.id, input.config.botUsername),
        },
      );

      await recordChannelMessage(input.db, request.id, {
        chatId: message.chat.id,
        messageId: message.message_id,
      });
    }

    const matchingUsers = await findMatchingTelegramUsers(input.db, {
      bloodType,
      requesterId: user.id,
    });
    await Promise.allSettled(
      matchingUsers.map((matchingUser) => {
        const username = matchingUser.telegramUsername?.trim();
        const chatId =
          matchingUser.telegramUserId ??
          (username ? (username.startsWith("@") ? username : `@${username}`) : undefined);
        if (!chatId) return Promise.resolve();

        return ctx.api.sendMessage(chatId, formatMatchingRequestNotification(user, request), {
          ...html,
          reply_markup: helpKeyboard(request.id, input.config.botUsername),
        });
      }),
    );

    await ctx.reply(
      input.config.channelId
        ? "Request sent to the channel. We will notify you when a donor offers to help."
        : "Request recorded. Telegram channel posting is not configured.",
      { reply_markup: mainMenuKeyboard() },
    );
  });

  bot.callbackQuery(/^help:(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.callbackQuery.data.split(":").at(-1));
    await offerHelp(ctx, input.db, requestId);
  });

  bot.on("message:text", async (ctx) => {
    await ctx.reply("Choose an option from the menu.", { reply_markup: mainMenuKeyboard() });
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "This action is no longer available." });
  });

  return bot;
}
