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

export function formatChannelRequest(request: Pick<
  BloodRequest,
  "bloodType" | "location" | "unitsNeeded" | "urgent"
>) {
  return [
    "<b>BLOOD REQUEST</b>",
    `Type: <b>${escapeHtml(request.bloodType)}</b>`,
    `Location: ${escapeHtml(request.location || "Not specified")}`,
    `Units: ${request.unitsNeeded}`,
    `Urgent: ${request.urgent ? "Yes" : "No"}`,
  ].join("\n");
}

export function formatProfile(user: User) {
  const dob =
    user.dob.getTime() === epochDate.getTime()
      ? "Not set"
      : user.dob.toISOString().slice(0, 10);

  return [
    "<b>Your Profile</b>",
    `Name: ${escapeHtml(user.name)}`,
    `Phone: ${formatPhoneLink(user.phone ?? null)}`,
    `Blood Type: ${escapeHtml(user.bloodType || "Not set")}`,
    `Sex: ${user.sex === "m" ? "Male" : user.sex === "f" ? "Female" : "Not set"}`,
    `NID: ${escapeHtml(user.nid || "Not set")}`,
    `DOB: ${dob}`,
    `Address: ${escapeHtml(user.address || "Not set")}`,
    `Island: ${escapeHtml(user.island || "Not set")}`,
    `Donor Available: ${user.isAvailable ? "Yes" : "No"}`,
  ].join("\n");
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
