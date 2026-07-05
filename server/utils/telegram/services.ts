import { and, eq, or, sql, type SQL } from "drizzle-orm";

import { bloodTypeValues, DAY_MS, EPOCH_STRING } from "../../../shared/utils/const";
import {
  blacklist,
  bloodRequests,
  donorResponses,
  users,
  type BloodRequest,
  type NewUser,
  type User,
} from "../../schema";
import { epochDate } from "./format";
import type { AppDb, BloodType, RequestDraft } from "./types";

export type TelegramContactInput = {
  first_name?: string;
  last_name?: string;
  phone_number: string;
  user_id?: number;
};

export type TelegramUserInput = {
  first_name?: string;
  id: number;
  last_name?: string;
  username?: string;
};

export type HelpOfferResult =
  | { status: "accepted"; donor: User; request: BloodRequest; requester?: User }
  | { status: "already_accepted"; donor: User; request: BloodRequest; requester?: User }
  | { status: "blacklisted" }
  | { status: "cooldown"; donor: User }
  | { status: "not_registered" }
  | { status: "profile_incomplete"; donor: User }
  | { status: "request_closed"; request: BloodRequest }
  | { status: "request_not_found" }
  | { status: "wrong_blood_type"; donor: User; request: BloodRequest };

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("960") && digits.length > 7) return digits.slice(3);
  return digits;
}

export function isBloodType(value: string): value is BloodType {
  return bloodTypeValues.includes(value as (typeof bloodTypeValues)[number]) && value !== "";
}

function dateValue(value: Date | number | null | undefined) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value * 1000);
  return epochDate;
}

export function isCompleteDonorProfile(user: User) {
  return Boolean(
    user.bloodType &&
      user.phone &&
      user.nid &&
      user.sex &&
      user.address &&
      user.island &&
      user.isAvailable &&
      dateValue(user.dob).getTime() !== epochDate.getTime(),
  );
}

export function isInDonationCooldown(user: User) {
  const lastDonatedAt = dateValue(user.lastDonatedAt);
  if (lastDonatedAt.getTime() <= epochDate.getTime()) return false;
  return Date.now() - lastDonatedAt.getTime() < 90 * DAY_MS;
}

export async function findUserByTelegramId(db: AppDb, telegramUserId: number) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);

  return user;
}

export async function isBlacklisted(
  db: AppDb,
  input: { phone?: string | null; telegramUserId?: number; username?: string | null },
) {
  const conditions: SQL[] = [];

  if (input.phone) conditions.push(eq(blacklist.phone, input.phone));
  if (input.telegramUserId) conditions.push(eq(blacklist.telegram, String(input.telegramUserId)));
  if (input.username) {
    conditions.push(eq(blacklist.telegram, input.username));
    conditions.push(eq(blacklist.telegram, `@${input.username}`));
  }

  if (!conditions.length) return false;

  const [row] = await db
    .select({ phone: blacklist.phone })
    .from(blacklist)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);

  return Boolean(row);
}

export async function upsertTelegramContactUser(
  db: AppDb,
  contact: TelegramContactInput,
  from: TelegramUserInput,
) {
  const phone = normalizePhone(contact.phone_number);
  const telegramUsername = from.username || null;
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
    [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
    from.username ||
    `Telegram ${from.id}`;
  const existingByTelegram = await findUserByTelegramId(db, from.id);
  const updateValues = {
    name,
    phone,
    telegramUsername,
    updatedAt: sql`unixepoch()`,
  };

  if (existingByTelegram) {
    await db
      .update(users)
      .set(updateValues)
      .where(eq(users.id, existingByTelegram.id));

    return {
      ...existingByTelegram,
      name,
      phone,
      telegramUsername,
      updatedAt: new Date(),
    };
  }

  const [existingByPhone] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existingByPhone) {
    await db
      .update(users)
      .set({ ...updateValues, telegramUserId: from.id })
      .where(eq(users.id, existingByPhone.id));

    return {
      ...existingByPhone,
      name,
      phone,
      telegramUserId: from.id,
      telegramUsername,
      updatedAt: new Date(),
    };
  }

  const user: NewUser = {
    address: "",
    bloodType: "",
    dob: new Date(EPOCH_STRING),
    island: "",
    isAvailable: false,
    lastDonatedAt: new Date(EPOCH_STRING),
    name,
    notes: "",
    phone,
    sex: "",
    telegramUserId: from.id,
    telegramUsername,
  };

  const [created] = await db.insert(users).values(user).returning();
  if (!created) throw new Error("Failed to create Telegram user");
  return created;
}

export async function updateUserBloodType(db: AppDb, userId: number, bloodType: BloodType) {
  await db
    .update(users)
    .set({ bloodType, updatedAt: sql`unixepoch()` })
    .where(eq(users.id, userId));
}

export async function updateUserSex(db: AppDb, userId: number, sex: "m" | "f") {
  await db
    .update(users)
    .set({ sex, updatedAt: sql`unixepoch()` })
    .where(eq(users.id, userId));
}

export async function updateUserAvailability(db: AppDb, userId: number, isAvailable: boolean) {
  await db
    .update(users)
    .set({ isAvailable, updatedAt: sql`unixepoch()` })
    .where(eq(users.id, userId));
}

export async function updateUserTextField(
  db: AppDb,
  userId: number,
  field: "address" | "island" | "nid",
  value: string,
) {
  await db
    .update(users)
    .set({ [field]: value, updatedAt: sql`unixepoch()` })
    .where(eq(users.id, userId));
}

export async function updateUserDob(db: AppDb, userId: number, dob: Date) {
  await db
    .update(users)
    .set({ dob, updatedAt: sql`unixepoch()` })
    .where(eq(users.id, userId));
}

export async function createBloodRequest(db: AppDb, user: User, draft: Required<RequestDraft> & {
  urgent: boolean;
}) {
  const [request] = await db
    .insert(bloodRequests)
    .values({
      bloodType: draft.bloodType,
      island: user.island || "",
      location: draft.location,
      notes: "",
      status: "open",
      unitsNeeded: draft.unitsNeeded,
      urgent: draft.urgent,
      userId: user.id,
    })
    .returning();

  if (!request) throw new Error("Failed to create blood request");
  return request;
}

export async function recordChannelMessage(
  db: AppDb,
  requestId: number,
  message: { chatId: number; messageId: number },
) {
  await db
    .update(bloodRequests)
    .set({
      telegramChatId: message.chatId,
      telegramMessageId: message.messageId,
      updatedAt: sql`unixepoch()`,
    })
    .where(eq(bloodRequests.id, requestId));
}

export async function acceptHelpOffer(
  db: AppDb,
  input: { donorTelegramUserId: number; requestId: number },
): Promise<HelpOfferResult> {
  const donor = await findUserByTelegramId(db, input.donorTelegramUserId);
  if (!donor) return { status: "not_registered" };

  if (
    await isBlacklisted(db, {
      phone: donor.phone,
      telegramUserId: input.donorTelegramUserId,
      username: donor.telegramUsername,
    })
  )
    return { status: "blacklisted" };

  const [request] = await db
    .select()
    .from(bloodRequests)
    .where(eq(bloodRequests.id, input.requestId))
    .limit(1);

  if (!request) return { status: "request_not_found" };
  if (request.status !== "open") return { request, status: "request_closed" };

  if (!isCompleteDonorProfile(donor)) return { donor, status: "profile_incomplete" };
  if (donor.bloodType !== request.bloodType) return { donor, request, status: "wrong_blood_type" };
  if (isInDonationCooldown(donor)) return { donor, status: "cooldown" };

  const [requester] = request.userId
    ? await db.select().from(users).where(eq(users.id, request.userId)).limit(1)
    : [];
  const [existing] = await db
    .select()
    .from(donorResponses)
    .where(and(eq(donorResponses.requestId, input.requestId), eq(donorResponses.donorId, donor.id)))
    .limit(1);

  if (existing) return { donor, request, requester, status: "already_accepted" };

  await db.insert(donorResponses).values({
    donorId: donor.id,
    notes: "",
    requestId: request.id,
    status: "accepted",
  });

  return { donor, request, requester, status: "accepted" };
}
