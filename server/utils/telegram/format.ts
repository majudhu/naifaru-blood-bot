import { EPOCH_STRING } from "../../../shared/utils/const";
import type { BloodRequest, User } from "../../schema";

export const epochDate = new Date(EPOCH_STRING);

export function escapeHtml(value: string | number | boolean | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatPhoneLink(phone: string | null) {
  return phone ? `<code>${escapeHtml(phone)}</code>` : "not provided";
}

export function formatChannelRequest(request: Pick<BloodRequest, "bloodType">) {
  return ["<b>BLOOD REQUEST</b>", `Blood group: <b>${escapeHtml(request.bloodType)}</b>`].join(
    "\n",
  );
}

export function formatMatchingRequestNotification(
  requester: Pick<User, "name" | "phone">,
  request: Pick<BloodRequest, "bloodType">,
) {
  return [
    "<b>Someone needs blood — can you help?</b>",
    `Requester: ${escapeHtml(requester.name)}`,
    `Blood group: <b>${escapeHtml(request.bloodType)}</b>`,
    `Phone: ${formatPhoneLink(requester.phone ?? null)}`,
  ].join("\n");
}

export function formatReadyDonors(
  donors: Pick<User, "name" | "phone">[],
  request: Pick<BloodRequest, "bloodType">,
) {
  if (donors.length === 0) {
    return `No available donors were found for <b>${escapeHtml(request.bloodType)}</b>.`;
  }

  return [
    `<b>Available ${escapeHtml(request.bloodType)} donors</b>`,
    ...donors.map(
      (donor, index) =>
        `${index + 1}. ${escapeHtml(donor.name)}\nMobile: ${formatPhoneLink(donor.phone)}`,
    ),
  ].join("\n\n");
}

export function formatDonorContact(donor: User) {
  return [
    "<b>A donor offered to help.</b>",
    `Name: ${escapeHtml(donor.name)}`,
    `Phone: ${formatPhoneLink(donor.phone ?? null)}`,
    donor.telegramUsername ? `Telegram: @${escapeHtml(donor.telegramUsername)}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatRequesterContact(requester: User) {
  return [
    "<b>Thanks for helping.</b>",
    `Requester: ${escapeHtml(requester.name)}`,
    `Phone: ${formatPhoneLink(requester.phone ?? null)}`,
  ].join("\n");
}
