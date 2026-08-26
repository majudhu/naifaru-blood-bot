import type { BloodRequest, User } from "../../schema";

export const TELEGRAM_MESSAGE_LENGTH_LIMIT = 4096;

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

export function formatReadyDonorMessages(
  donors: Pick<User, "name" | "phone">[],
  request: Pick<BloodRequest, "bloodType">,
) {
  if (donors.length === 0) {
    return [`No available donors were found for <b>${escapeHtml(request.bloodType)}</b>.`];
  }

  const heading = `<b>Available ${escapeHtml(request.bloodType)} donors</b>`;
  const maximumEntryLength = TELEGRAM_MESSAGE_LENGTH_LIMIT - heading.length - 2;
  const messages: string[] = [];
  let entries: string[] = [];

  for (const [index, donor] of donors.entries()) {
    const entry = formatReadyDonorEntry(donor, index + 1, maximumEntryLength);
    const candidate = [heading, ...entries, entry].join("\n\n");

    if (candidate.length > TELEGRAM_MESSAGE_LENGTH_LIMIT) {
      messages.push([heading, ...entries].join("\n\n"));
      entries = [entry];
    } else {
      entries.push(entry);
    }
  }

  messages.push([heading, ...entries].join("\n\n"));
  return messages;
}

function formatReadyDonorEntry(
  donor: Pick<User, "name" | "phone">,
  position: number,
  maximumLength: number,
) {
  const prefix = `${position}. `;
  const mobilePrefix = "\nMobile: ";
  const codePrefix = donor.phone ? "<code>" : "";
  const codeSuffix = donor.phone ? "</code>" : "";
  const escapedName = escapeHtml(donor.name);
  const escapedPhone = donor.phone ? escapeHtml(donor.phone) : "not provided";
  const fixedLength = prefix.length + mobilePrefix.length + codePrefix.length + codeSuffix.length;
  const availableContentLength = maximumLength - fixedLength;

  let name = escapedName;
  let phone = escapedPhone;
  if (name.length + phone.length > availableContentLength) {
    const phoneLength = Math.min(phone.length, Math.floor(availableContentLength / 2));
    phone = truncateEscapedHtml(donor.phone ?? "not provided", phoneLength);
    name = truncateEscapedHtml(donor.name, availableContentLength - phone.length);
  }

  return `${prefix}${name}${mobilePrefix}${codePrefix}${phone}${codeSuffix}`;
}

function truncateEscapedHtml(value: string, maximumLength: number) {
  const escaped = escapeHtml(value);
  if (escaped.length <= maximumLength) return escaped;
  if (maximumLength <= 0) return "";

  const contentLimit = maximumLength - 1;
  let output = "";
  for (const character of value) {
    const escapedCharacter = escapeHtml(character);
    if (output.length + escapedCharacter.length > contentLimit) break;
    output += escapedCharacter;
  }

  return `${output}…`;
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
