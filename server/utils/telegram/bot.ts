import { Bot, session } from "grammy";

import {
  bloodProfileKeyboard,
  bloodRequestKeyboard,
  contactKeyboard,
  helpKeyboard,
  mainMenuKeyboard,
  profileKeyboard,
  sexProfileKeyboard,
  unitsKeyboard,
  urgencyKeyboard,
} from "./keyboards";
import {
  acceptHelpOffer,
  createBloodRequest,
  findUserByTelegramId,
  isBlacklisted,
  isBloodType,
  isCompleteDonorProfile,
  normalizePhone,
  recordChannelMessage,
  updateUserAvailability,
  updateUserBloodType,
  updateUserDob,
  updateUserSex,
  updateUserTextField,
  upsertTelegramContactUser,
  type HelpOfferResult,
} from "./services";
import { createD1SessionStorage, markTelegramUpdateProcessed } from "./storage";
import {
  formatChannelRequest,
  formatDonorContact,
  formatProfile,
  formatRequesterContact,
} from "./format";
import type { AppDb, RequestDraft, TelegramConfig, TelegramContext, TelegramSession } from "./types";

const html = { parse_mode: "HTML" as const };

function clearFlow(ctx: TelegramContext) {
  delete ctx.session.flow;
}

function requestDraftIsComplete(draft: Partial<RequestDraft>): draft is Required<RequestDraft> {
  return Boolean(draft?.bloodType && draft.location && draft.unitsNeeded);
}

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

async function showProfile(ctx: TelegramContext, db: AppDb) {
  const user = await registeredUser(ctx, db);
  if (!user) return;

  await ctx.reply(formatProfile(user), {
    ...html,
    reply_markup: profileKeyboard(),
  });
}

async function startRequest(ctx: TelegramContext, db: AppDb) {
  const user = await registeredUser(ctx, db);
  if (!user) return;

  clearFlow(ctx);
  await ctx.reply("Select the blood group you need.", {
    reply_markup: bloodRequestKeyboard(),
  });
}

function requestIdFromStartPayload(payload: string) {
  const match = /^help_(\d+)$/.exec(payload);
  return match ? Number(match[1]) : undefined;
}

async function notifyHelpResult(ctx: TelegramContext, result: HelpOfferResult) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});

  switch (result.status) {
    case "accepted":
      if (result.requester) {
        await ctx.reply(formatRequesterContact(result.requester), html);
        if (
          result.requester.telegramUserId &&
          result.requester.telegramUserId !== result.donor.telegramUserId
        ) {
          await ctx.api.sendMessage(result.requester.telegramUserId, formatDonorContact(result.donor), html);
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
      await ctx.reply(
        "Please complete your donor profile before offering to help.",
        { reply_markup: mainMenuKeyboard() },
      );
      await ctx.reply(formatProfile(result.donor), {
        ...html,
        reply_markup: profileKeyboard(),
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
        `This request needs ${result.request.bloodType}, but your profile is ${result.donor.bloodType}.`,
      );
      return;
  }
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
  if (result.status === "accepted" || result.status === "already_accepted")
    ctx.session.pendingHelpRequestId = undefined;

  await notifyHelpResult(ctx, result);
}

async function tryPendingHelp(ctx: TelegramContext, db: AppDb) {
  const requestId = ctx.session.pendingHelpRequestId;
  if (!requestId || !ctx.from?.id) return;

  const user = await findUserByTelegramId(db, ctx.from.id);
  if (!user || !isCompleteDonorProfile(user)) return;

  await offerHelp(ctx, db, requestId);
}

async function completeRequest(ctx: TelegramContext, db: AppDb, config: TelegramConfig, urgent: boolean) {
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "request_urgent" || !requestDraftIsComplete(flow.draft)) {
    clearFlow(ctx);
    await startRequest(ctx, db);
    return;
  }

  const user = await registeredUser(ctx, db);
  if (!user) return;

  const request = await createBloodRequest(db, user, {
    ...flow.draft,
    urgent,
  });

  if (config.channelId) {
    const message = await ctx.api.sendMessage(config.channelId, formatChannelRequest(request), {
      ...html,
      reply_markup: helpKeyboard(request.id, config.botUsername),
    });

    await recordChannelMessage(db, request.id, {
      chatId: message.chat.id,
      messageId: message.message_id,
    });
  }

  clearFlow(ctx);
  await ctx.reply(
    config.channelId
      ? "Request sent to the channel. We will notify you when a donor offers to help."
      : "Request recorded. Telegram channel posting is not configured.",
    { reply_markup: mainMenuKeyboard() },
  );
}

async function handleProfileText(ctx: TelegramContext, db: AppDb, text: string) {
  const user = await registeredUser(ctx, db);
  const flow = ctx.session.flow;
  if (!user || !flow) return false;

  if (flow.kind === "profile_nid") {
    const nid = text.trim().toUpperCase();
    if (nid.length !== 7) {
      await ctx.reply("Please send a 7-character NID, for example A123456.");
      return true;
    }
    await updateUserTextField(db, user.id, "nid", nid);
  } else if (flow.kind === "profile_dob") {
    const dob = new Date(text.trim());
    if (Number.isNaN(dob.getTime())) {
      await ctx.reply("Please send your date of birth as YYYY-MM-DD.");
      return true;
    }
    await updateUserDob(db, user.id, dob);
  } else if (flow.kind === "profile_address") {
    await updateUserTextField(db, user.id, "address", text.trim());
  } else if (flow.kind === "profile_island") {
    await updateUserTextField(db, user.id, "island", text.trim());
  } else {
    return false;
  }

  clearFlow(ctx);
  await ctx.reply("Profile updated.");
  await showProfile(ctx, db);
  await tryPendingHelp(ctx, db);
  return true;
}

async function handleRequestText(ctx: TelegramContext, db: AppDb, text: string) {
  const flow = ctx.session.flow;
  if (!flow || flow.kind !== "request_location") return false;

  const location = text.trim();
  if (!location) {
    await ctx.reply("Please send the hospital or location.");
    return true;
  }

  ctx.session.flow = {
    draft: { ...flow.draft, location },
    kind: "request_units",
  };

  await ctx.reply("How many units are needed?", { reply_markup: unitsKeyboard() });
  return true;
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
    const requestId = requestIdFromStartPayload(payload);

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
  bot.command("donor", (ctx) => showProfile(ctx, input.db));
  bot.command("profile", (ctx) => showProfile(ctx, input.db));
  bot.hears("Request Blood", (ctx) => startRequest(ctx, input.db));
  bot.hears("Donor Profile", (ctx) => showProfile(ctx, input.db));
  bot.hears("My Profile", (ctx) => showProfile(ctx, input.db));

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

    ctx.session.flow = { draft: { bloodType }, kind: "request_location" };
    await ctx.answerCallbackQuery();
    await ctx.reply("Send the hospital or location for this request.");
  });

  bot.callbackQuery(/^request:units:(\d+)$/, async (ctx) => {
    const flow = ctx.session.flow;
    const unitsNeeded = Number(ctx.callbackQuery.data.split(":").at(-1));
    if (!flow || flow.kind !== "request_units" || !Number.isInteger(unitsNeeded)) {
      await ctx.answerCallbackQuery({ text: "Please start the request again." });
      clearFlow(ctx);
      return;
    }

    ctx.session.flow = {
      draft: { ...flow.draft, unitsNeeded },
      kind: "request_urgent",
    };
    await ctx.answerCallbackQuery();
    await ctx.reply("Is this urgent?", { reply_markup: urgencyKeyboard() });
  });

  bot.callbackQuery(/^request:urgent:[01]$/, async (ctx) => {
    const urgent = ctx.callbackQuery.data.endsWith(":1");
    await ctx.answerCallbackQuery();
    await completeRequest(ctx, input.db, input.config, urgent);
  });

  bot.callbackQuery(/^help:(\d+)$/, async (ctx) => {
    const requestId = Number(ctx.callbackQuery.data.split(":").at(-1));
    await offerHelp(ctx, input.db, requestId);
  });

  bot.callbackQuery("profile:edit:blood", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Select your blood type.", { reply_markup: bloodProfileKeyboard() });
  });

  bot.callbackQuery(/^profile:blood:(.+)$/, async (ctx) => {
    const user = await registeredUser(ctx, input.db);
    const bloodType = ctx.callbackQuery.data.split(":").at(-1);
    if (!user || !bloodType || !isBloodType(bloodType)) return;

    await updateUserBloodType(input.db, user.id, bloodType);
    await ctx.answerCallbackQuery({ text: "Blood type saved" });
    await showProfile(ctx, input.db);
    await tryPendingHelp(ctx, input.db);
  });

  bot.callbackQuery("profile:edit:sex", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Select your sex.", { reply_markup: sexProfileKeyboard() });
  });

  bot.callbackQuery(/^profile:sex:[mf]$/, async (ctx) => {
    const user = await registeredUser(ctx, input.db);
    const sex = ctx.callbackQuery.data.endsWith(":m") ? "m" : "f";
    if (!user) return;

    await updateUserSex(input.db, user.id, sex);
    await ctx.answerCallbackQuery({ text: "Sex saved" });
    await showProfile(ctx, input.db);
    await tryPendingHelp(ctx, input.db);
  });

  bot.callbackQuery(/^profile:available:[01]$/, async (ctx) => {
    const user = await registeredUser(ctx, input.db);
    if (!user) return;

    await updateUserAvailability(input.db, user.id, ctx.callbackQuery.data.endsWith(":1"));
    await ctx.answerCallbackQuery({ text: "Availability saved" });
    await showProfile(ctx, input.db);
    await tryPendingHelp(ctx, input.db);
  });

  bot.callbackQuery(/^profile:edit:(nid|dob|address|island)$/, async (ctx) => {
    const field = ctx.callbackQuery.data.split(":").at(-1);
    if (!field) return;

    if (field === "nid") ctx.session.flow = { kind: "profile_nid" };
    else if (field === "dob") ctx.session.flow = { kind: "profile_dob" };
    else if (field === "address") ctx.session.flow = { kind: "profile_address" };
    else ctx.session.flow = { kind: "profile_island" };
    await ctx.answerCallbackQuery();
    await ctx.reply(
      field === "dob"
        ? "Send your date of birth as YYYY-MM-DD."
        : `Send your ${field}.`,
    );
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (await handleProfileText(ctx, input.db, text)) return;
    if (await handleRequestText(ctx, input.db, text)) return;

    await ctx.reply("Choose an option from the menu.", { reply_markup: mainMenuKeyboard() });
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "This action is no longer available." });
  });

  return bot;
}
