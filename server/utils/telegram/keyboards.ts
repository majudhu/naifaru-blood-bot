import { InlineKeyboard, Keyboard } from "grammy";

import { bloodTypeValues } from "../../../shared/utils/const";
import type { BloodType } from "./types";

const bloodTypes = bloodTypeValues.filter(Boolean) as BloodType[];

export function mainMenuKeyboard() {
  return new Keyboard().text("Request Blood").resized().persistent();
}

export function contactKeyboard() {
  return new Keyboard()
    .requestContact("START")
    .resized()
    .oneTime()
    .placeholder("Share your phone number");
}

export function bloodRequestKeyboard() {
  const keyboard = new InlineKeyboard();
  bloodTypes.forEach((bloodType, index) => {
    if (index > 0 && index % 2 === 0) keyboard.row();
    keyboard.text(bloodType, `request:type:${bloodType}`);
  });
  return keyboard;
}

export function helpKeyboard(requestId: number, botUsername: string) {
  return new InlineKeyboard().url(
    "I Can Help",
    `https://t.me/${botUsername}?start=help_${requestId}`,
  );
}
