import { InlineKeyboard, Keyboard } from "grammy";

import { bloodTypeValues, donorStatusValues } from "../../../shared/utils/const";
import type { User } from "../../schema";
import type { BloodType, TelegramSession } from "./types";

const bloodTypes = bloodTypeValues.filter(Boolean) as BloodType[];

export function mainMenuKeyboard(status: User["status"]) {
  const keyboard = new Keyboard().text("Request Blood").danger();
  if (donorStatusValues.some((value) => value === status)) keyboard.row().text("My Donor Profile");
  if (status === "Non-Donor") keyboard.row().text("Register as Donor");
  return keyboard.resized();
}

export function contactKeyboard() {
  return new Keyboard()
    .requestContact("START")
    .resized()
    .oneTime()
    .placeholder("Share your phone number");
}

export function bloodRequestKeyboard(status: User["status"]) {
  const keyboard = new InlineKeyboard();
  bloodTypes.forEach((bloodType, index) => {
    if (index > 0 && index % 2 === 0) keyboard.row();
    keyboard.text(bloodType, `request:type:${bloodType}`);
  });
  if (donorStatusValues.some((value) => value === status))
    keyboard.row().text("My Donor Profile", "donor:profile");
  return keyboard;
}

export function registrationKeyboard(step: TelegramSession["registrationStep"]) {
  const keyboard = new Keyboard();
  if (step === "phone") keyboard.requestContact("Share Phone");
  if (step === "bloodType") {
    bloodTypes.forEach((bloodType, index) => {
      if (index > 0 && index % 2 === 0) keyboard.row();
      keyboard.text(bloodType);
    });
  }
  if (step === "sex") keyboard.text("Male").text("Female");
  if (step === "phone" || step === "bloodType" || step === "sex") keyboard.row();
  return keyboard.text("Cancel Registration").resized();
}

export function helpKeyboard(requestId: number, botUsername: string) {
  return new InlineKeyboard().url(
    "I Can Help",
    `https://t.me/${botUsername}?start=help_${requestId}`,
  );
}
