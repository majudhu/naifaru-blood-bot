import { Bot, session } from "grammy";

import { donorStatusValues } from "../../../shared/utils/const";
import {
  bloodRequestKeyboard,
  contactKeyboard,
  helpKeyboard,
  mainMenuKeyboard,
  registrationKeyboard,
} from "./keyboards";
import {
  acceptHelpOffer,
  createBloodRequest,
  findReadyDonors,
  findUserByTelegramId,
  isBloodType,
  normalizePhone,
  recordChannelMessage,
  upsertTelegramContactUser,
} from "./services";
import { enqueueDonorNotifications, enqueueRegistrationNotification } from "./notifications";
import { nextRegistrationStep, registrationPrompts, saveRegistrationAnswer } from "./registration";
import { createD1SessionStorage, markTelegramUpdateProcessed } from "./storage";
import {
  formatChannelRequest,
  formatDonorProfile,
  formatDonorContact,
  formatReadyDonorMessages,
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

  return user;
}

async function startRequest(ctx: TelegramContext, db: AppDb) {
  ctx.session.registrationStep = undefined;
  if (ctx.session.pendingHelpRequestId) {
    await promptForContact(ctx);
    return;
  }

  const user = await registeredUser(ctx, db);
  if (!user) {
    ctx.session.pendingBloodRequest = true;
    return;
  }

  ctx.session.pendingBloodRequest = undefined;

  await ctx.reply("Choose an option below.", {
    reply_markup: mainMenuKeyboard(user.status),
  });
  await ctx.reply("Select the blood group you need.", {
    reply_markup: bloodRequestKeyboard(user.status),
  });
}

async function showDonorProfile(ctx: TelegramContext, db: AppDb) {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Please open a private chat with me to view your donor profile.");
    return;
  }
  const user = await registeredUser(ctx, db);
  if (!user) return;
  if (!donorStatusValues.some((status) => status === user.status)) {
    await ctx.reply("Donor profiles are available only to registered donors.", {
      reply_markup: mainMenuKeyboard(user.status),
    });
    return;
  }
  await ctx.reply(formatDonorProfile(user), {
    ...html,
    reply_markup: mainMenuKeyboard(user.status),
  });
}

async function offerHelp(ctx: TelegramContext, db: AppDb, requestId: number) {
  const donorTelegramUserId = ctx.from?.id;
  if (!donorTelegramUserId) return;

  ctx.session.pendingBloodRequest = undefined;
  ctx.session.registrationStep = undefined;
  const donor = await findUserByTelegramId(db, donorTelegramUserId);
  if (!donor) {
    ctx.session.pendingHelpRequestId = requestId;
    await promptForContact(ctx);
    return;
  }

  ctx.session.pendingHelpRequestId = requestId;
  const result = await acceptHelpOffer(db, { donorTelegramUserId, requestId });
  if (result.status !== "not_registered" && result.status !== "profile_incomplete") {
    ctx.session.pendingHelpRequestId = undefined;
  }

  if (ctx.callbackQuery) await ctx.answerCallbackQuery();

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
    case "not_registered":
      await promptForContact(ctx);
      return;
    case "profile_incomplete":
      await promptForContact(ctx);
      return;
    case "request_closed":
      await ctx.reply("This request is no longer open.");
      return;
    case "request_not_found":
      await ctx.reply("This request could not be found.");
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

async function promptRegistrationStep(ctx: TelegramContext) {
  const step = ctx.session.registrationStep;
  if (!step) return;
  await ctx.reply(registrationPrompts[step], { reply_markup: registrationKeyboard(step) });
}

async function startRegistration(ctx: TelegramContext, db: AppDb) {
  if (!ctx.from) return;
  const user = await findUserByTelegramId(db, ctx.from.id);
  if (user?.status === "pending") {
    ctx.session.registrationStep = undefined;
    await ctx.reply(
      "Your donor registration is Pending Review. An admin will review your details.",
      {
        reply_markup: mainMenuKeyboard(user.status),
      },
    );
    return;
  }
  if (user && user.status !== "Non-Donor") {
    ctx.session.registrationStep = undefined;
    await showDonorProfile(ctx, db);
    return;
  }
  ctx.session.pendingBloodRequest = undefined;
  ctx.session.pendingHelpRequestId = undefined;
  ctx.session.registrationStep ??= "phone";
  await promptRegistrationStep(ctx);
}

async function cancelRegistration(ctx: TelegramContext, db: AppDb) {
  ctx.session.registrationStep = undefined;
  const user = ctx.from ? await findUserByTelegramId(db, ctx.from.id) : undefined;
  await ctx.reply("Registration cancelled. Your saved details have been kept.", {
    reply_markup: user ? mainMenuKeyboard(user.status) : contactKeyboard(),
  });
}

async function answerRegistration(
  ctx: TelegramContext,
  db: AppDb,
  queue: Env["TELEGRAM_DONOR_NOTIFICATIONS"],
) {
  const step = ctx.session.registrationStep;
  if (!step || !ctx.from) return;
  if (step === "phone" || !ctx.message?.text || ctx.message.text.startsWith("/")) {
    await promptRegistrationStep(ctx);
    return;
  }
  const user = await findUserByTelegramId(db, ctx.from.id);
  if (!user || user.status !== "Non-Donor") {
    ctx.session.registrationStep = undefined;
    await startRegistration(ctx, db);
    return;
  }
  const result = await saveRegistrationAnswer(db, user, step, ctx.message.text);
  if ("message" in result) {
    await ctx.reply(result.message);
    await promptRegistrationStep(ctx);
    return;
  }
  if (result.user.status === "pending") {
    ctx.session.registrationStep = undefined;
    await enqueueRegistrationNotification(queue, {
      type: "registration_submitted",
      userId: result.user.id,
    });
    await ctx.reply("Your donor registration has been submitted. Status: Pending Review.", {
      reply_markup: mainMenuKeyboard(result.user.status),
    });
    return;
  }
  if (step !== "address") ctx.session.registrationStep = nextRegistrationStep[step];
  await promptRegistrationStep(ctx);
}

export function createTelegramBot(input: {
  config: TelegramConfig;
  db: AppDb;
  notificationQueue: Env["TELEGRAM_DONOR_NOTIFICATIONS"];
}) {
  const bot = new Bot<TelegramContext>(input.config.botToken, {
    botInfo: input.config.botInfo,
  });

  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === "private") {
      await next();
      return;
    }
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: "Please open a private chat with me." });
      if (ctx.callbackQuery.data === "donor:profile")
        await ctx.reply("Please open a private chat with me to view your donor profile.");
    }
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

    if (ctx.session.registrationStep) {
      await startRegistration(ctx, input.db);
      return;
    }

    const user = ctx.from ? await findUserByTelegramId(input.db, ctx.from.id) : undefined;
    if (!user) {
      await promptForContact(ctx);
      return;
    }

    await ctx.reply("Welcome back.", { reply_markup: mainMenuKeyboard(user.status) });
  });

  bot.command("register", (ctx) => startRegistration(ctx, input.db));
  bot.hears("Register as Donor", (ctx) => startRegistration(ctx, input.db));
  bot.command("cancel", (ctx) => cancelRegistration(ctx, input.db));
  bot.hears("Cancel Registration", (ctx) => cancelRegistration(ctx, input.db));

  bot.hears("My Donor Profile", (ctx) => showDonorProfile(ctx, input.db));
  bot.callbackQuery("donor:profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDonorProfile(ctx, input.db);
  });

  bot.command("request", (ctx) => startRequest(ctx, input.db));
  bot.hears("Request Blood", (ctx) => startRequest(ctx, input.db));

  bot.on("message:contact", async (ctx) => {
    const from = ctx.from;
    const contact = ctx.message.contact;
    if (!from) return;

    if (contact.user_id !== from.id || normalizePhone(contact.phone_number).length < 7) {
      await ctx.reply("Please share your own contact using the contact-sharing button.");
      return;
    }

    if (ctx.session.registrationStep && ctx.session.registrationStep !== "phone") {
      await promptRegistrationStep(ctx);
      return;
    }

    const user = await upsertTelegramContactUser(input.db, contact, from);
    if (!user) {
      await ctx.reply(
        "This phone number belongs to another account. Please contact an admin to resolve it.",
      );
      return;
    }
    if (ctx.session.registrationStep === "phone") {
      if (user.status !== "Non-Donor") {
        await startRegistration(ctx, input.db);
        return;
      }
      ctx.session.registrationStep = "name";
      await promptRegistrationStep(ctx);
      return;
    }
    await ctx.reply("Registration saved.", {
      reply_markup: mainMenuKeyboard(user.status),
    });

    if (ctx.session.pendingHelpRequestId) {
      ctx.session.pendingBloodRequest = undefined;
      await tryPendingHelp(ctx, input.db);
      return;
    }

    if (ctx.session.pendingBloodRequest) {
      ctx.session.pendingBloodRequest = undefined;
      await ctx.reply("Select the blood group you need.", {
        reply_markup: bloodRequestKeyboard(user.status),
      });
    }
  });

  bot.callbackQuery(/^request:type:(.+)$/, async (ctx) => {
    const bloodType = ctx.callbackQuery.data.split(":").at(-1);
    if (!bloodType || !isBloodType(bloodType)) {
      await ctx.answerCallbackQuery({ text: "Invalid blood type" });
      return;
    }

    await ctx.answerCallbackQuery();

    if (ctx.session.pendingHelpRequestId) {
      await promptForContact(ctx);
      return;
    }

    const user = await registeredUser(ctx, input.db);
    if (!user) {
      ctx.session.pendingBloodRequest = true;
      return;
    }

    ctx.session.pendingBloodRequest = undefined;

    const request = await createBloodRequest(input.db, user, {
      bloodType,
    });

    const message = await ctx.api.sendMessage(
      input.config.channelId,
      formatChannelRequest(request, user),
      {
        ...html,
        reply_markup: helpKeyboard(request.id, input.config.botUsername),
      },
    );

    await recordChannelMessage(input.db, request.id, {
      chatId: message.chat.id,
      messageId: message.message_id,
    });

    const donorMatch = {
      bloodType,
      requesterId: user.id,
    };
    const readyDonors = await findReadyDonors(input.db, donorMatch);

    await ctx.reply(
      'Request sent to channel <a href="https://t.me/naifarudonors">@naifarudonors</a>',
      {
        ...html,
        reply_markup: mainMenuKeyboard(user.status),
      },
    );

    for (const donorMessage of formatReadyDonorMessages(readyDonors, request)) {
      await ctx.reply(donorMessage, html);
    }

    await enqueueDonorNotifications(input.notificationQueue, readyDonors, request);
  });

  bot.callbackQuery(/^help:(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.callbackQuery.data.split(":").at(-1));
    await offerHelp(ctx, input.db, requestId);
  });

  bot.on("message", (ctx) =>
    ctx.session.registrationStep
      ? answerRegistration(ctx, input.db, input.notificationQueue)
      : startRequest(ctx, input.db),
  );

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "This action is no longer available.",
    });
  });

  return bot;
}
