import { InlineKeyboard, Keyboard } from "grammy";

import { bloodTypeValues } from "../../../shared/utils/const";
import type { BloodType } from "./types";

const bloodTypes = bloodTypeValues.filter(Boolean) as BloodType[];

export function mainMenuKeyboard() {
  return new Keyboard()
    .text("Request Blood")
    .row()
    .text("Donor Profile")
    .row()
    .text("My Profile")
    .resized()
    .persistent();
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

export function bloodProfileKeyboard() {
  const keyboard = new InlineKeyboard();
  bloodTypes.forEach((bloodType, index) => {
    if (index > 0 && index % 2 === 0) keyboard.row();
    keyboard.text(bloodType, `profile:blood:${bloodType}`);
  });
  return keyboard;
}

export function sexProfileKeyboard() {
  return new InlineKeyboard()
    .text("Male", "profile:sex:m")
    .text("Female", "profile:sex:f");
}

export function unitsKeyboard() {
  return new InlineKeyboard()
    .text("1", "request:units:1")
    .text("2", "request:units:2")
    .row()
    .text("3", "request:units:3")
    .text("4", "request:units:4");
}

export function urgencyKeyboard() {
  return new InlineKeyboard()
    .text("Normal", "request:urgent:0")
    .text("Urgent", "request:urgent:1");
}

export function helpKeyboard(requestId: number, botUsername?: string) {
  if (botUsername) {
    return new InlineKeyboard().url(
      "I Can Help",
      `https://t.me/${botUsername}?start=help_${requestId}`,
    );
  }

  return new InlineKeyboard().text("I Can Help", `help:${requestId}`);
}

export function profileKeyboard() {
  return new InlineKeyboard()
    .text("Blood Type", "profile:edit:blood")
    .text("Sex", "profile:edit:sex")
    .row()
    .text("NID", "profile:edit:nid")
    .text("DOB", "profile:edit:dob")
    .row()
    .text("Address", "profile:edit:address")
    .text("Island", "profile:edit:island")
    .row()
    .text("Available", "profile:available:1")
    .text("Unavailable", "profile:available:0");
}
