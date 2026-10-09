import { and, eq, sql } from "drizzle-orm";

import { users, type User } from "../../schema";
import { isBloodType } from "./services";
import type { AppDb, TelegramSession } from "./types";

export type RegistrationTextStep = Exclude<
  TelegramSession["registrationStep"],
  "phone" | undefined
>;

export const registrationPrompts = {
  phone: "Please share your own phone number using the Share Phone button.",
  name: "What is your full name?",
  bloodType: "Select your blood type.",
  nid: "What is your national ID or passport number?",
  sex: "Select your sex.",
  address: "What is your current address?",
} as const;

export const nextRegistrationStep = {
  phone: "name",
  name: "bloodType",
  bloodType: "nid",
  nid: "sex",
  sex: "address",
} as const;

export function isRegistrationComplete(user: User) {
  return Boolean(
    user.name.trim() &&
    user.phone &&
    isBloodType(user.bloodType) &&
    user.nid?.trim() &&
    (user.sex === "m" || user.sex === "f") &&
    user.address.trim(),
  );
}

export async function saveRegistrationAnswer(
  db: AppDb,
  user: User,
  step: RegistrationTextStep,
  text: string,
): Promise<{ user: User } | { message: string }> {
  if (user.status !== "Non-Donor") return { message: "Registration is no longer in progress." };

  let value = text.trim();
  if (!value) return { message: "This information is required. Please enter a value." };

  if (step === "bloodType") {
    value = value.toUpperCase();
    if (!isBloodType(value)) return { message: "Please select a blood type from the buttons." };
  }
  if (step === "sex") {
    const sex = value.toLowerCase();
    if (sex === "m" || sex === "male") value = "m";
    else if (sex === "f" || sex === "female") value = "f";
    else return { message: "Please select Male or Female." };
  }
  if (step === "nid") {
    value = value.toUpperCase();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nid, value))
      .limit(1);
    if (existing && existing.id !== user.id)
      return { message: "This ID is already registered. Please contact an admin to resolve it." };
  }

  const details = { ...user, [step]: value };
  if (step === "address" && !isRegistrationComplete(details))
    return { message: "Some required details are missing. Please cancel and use /register again." };

  const [saved] = await db
    .update(users)
    .set({
      [step]: value,
      ...(step === "address" ? { status: "pending" as const } : {}),
      updatedAt: sql`unixepoch()`,
    })
    .where(and(eq(users.id, user.id), eq(users.status, "Non-Donor")))
    .returning();

  if (!saved)
    return { message: "Your registration has changed. Use /register to check its status." };
  return { user: saved };
}
