import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../server/utils/telegram/types";
import type { User } from "../../server/schema";
import {
  acceptHelpOffer,
  createBloodRequest,
  findReadyDonors,
  upsertTelegramContactUser,
} from "../../server/utils/telegram/services";
import {
  formatChannelRequest,
  formatDonorContact,
  formatMatchingRequestNotification,
  formatReadyDonorMessages,
  TELEGRAM_MESSAGE_LENGTH_LIMIT,
} from "../../server/utils/telegram/format";
import { assertTelegramWebhookSecret } from "../../server/utils/telegram/config";
import { markTelegramUpdateProcessed } from "../../server/utils/telegram/storage";
import { DATE_NIL } from "../../shared/utils/const";
import { createDbMock, expectHttpError } from "./api-test-utils";

function dbMock() {
  return createDbMock() as unknown as AppDb & ReturnType<typeof createDbMock>;
}

function user(overrides: Partial<User> = {}): User {
  return {
    address: "Harbour Road",
    bloodType: "O+",
    createdAt: new Date("2026-01-01"),
    dob: new Date("1990-01-01"),
    id: 7,
    island: "Naifaru",
    isAvailable: true,
    lastDonatedAt: new Date(DATE_NIL),
    name: "Aisha",
    nid: "A123456",
    notes: "",
    phone: "7771234",
    sex: "f",
    telegramUserId: 12345,
    telegramUsername: "aisha",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("Telegram webhook security", () => {
  it("accepts matching webhook secrets and rejects mismatches", () => {
    expect(() => assertTelegramWebhookSecret("secret", "secret")).not.toThrow();

    try {
      assertTelegramWebhookSecret("wrong", "secret");
      throw new Error("Expected secret check to reject");
    } catch (error) {
      expectHttpError(error, 401);
    }
  });

  it("tracks processed update ids", async () => {
    const db = dbMock();
    db.queueSelect([]);
    const insert = db.queueInsert([]);

    await expect(markTelegramUpdateProcessed(db, 10)).resolves.toBe(true);
    expect(insert.values).toHaveBeenCalledWith({ updateId: 10 });

    db.queueSelect([{ updateId: 10 }]);

    await expect(markTelegramUpdateProcessed(db, 10)).resolves.toBe(false);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});

describe("Telegram contact onboarding", () => {
  it("creates a requester profile from a shared Telegram contact", async () => {
    const db = dbMock();
    db.queueSelect([]);
    db.queueSelect([]);
    const created = user({
      bloodType: "",
      dob: new Date(DATE_NIL),
      id: 12,
      isAvailable: false,
      lastDonatedAt: new Date(DATE_NIL),
      name: "Ali Rasheed",
      phone: "7770000",
      sex: "",
      telegramUserId: 99,
      telegramUsername: "ali",
    });
    const insert = db.queueInsert([created]);

    await expect(
      upsertTelegramContactUser(
        db,
        { first_name: "Ali", last_name: "Rasheed", phone_number: "+9607770000" },
        { id: 99, username: "ali" },
      ),
    ).resolves.toEqual(created);

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        bloodType: "",
        dob: new Date(DATE_NIL),
        lastDonatedAt: new Date(DATE_NIL),
        isAvailable: false,
        name: "Ali Rasheed",
        phone: "7770000",
        sex: "",
        telegramUserId: 99,
        telegramUsername: "ali",
      }),
    );
  });
});

describe("Telegram blood requests", () => {
  it("creates a request and formats channel posts without public phone numbers", async () => {
    const db = dbMock();
    const requester = user({ id: 3, phone: "9991111" });
    const request = {
      bloodType: "O+" as const,
      createdAt: new Date("2026-01-01"),
      id: 21,
      island: "Naifaru",
      location: "",
      notes: "",
      status: "open" as const,
      telegramChatId: null,
      telegramMessageId: null,
      unitsNeeded: 1,
      updatedAt: new Date("2026-01-01"),
      urgent: false,
      userId: requester.id,
    };
    const insert = db.queueInsert([request]);

    await expect(
      createBloodRequest(db, requester, {
        bloodType: "O+",
      }),
    ).resolves.toEqual(request);

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        bloodType: "O+",
        location: "",
        unitsNeeded: 1,
        urgent: false,
        userId: requester.id,
      }),
    );

    const channelText = formatChannelRequest(request);
    expect(channelText).toContain("Blood group: <b>O+</b>");
    expect(channelText).not.toContain("Location");
    expect(channelText).not.toContain("Units");
    expect(channelText).not.toContain("Urgent");
    expect(channelText).not.toContain("9991111");

    const notificationText = formatMatchingRequestNotification(requester, request);
    expect(notificationText).toContain("<b>Someone needs blood — can you help?</b>");
    expect(notificationText).toContain("Requester: Aisha");
    expect(notificationText).toContain("Blood group: <b>O+</b>");
    expect(notificationText).toContain("Phone: <code>9991111</code>");

    const [readyDonorText] = formatReadyDonorMessages(
      [
        user({ name: "Fathimath & Ali", phone: "7772222" }),
        user({ name: "Hassan", phone: "9993333" }),
      ],
      request,
    );
    expect(readyDonorText).toContain("Available O+ donors");
    expect(readyDonorText).toContain(
      "1. Fathimath &amp; Ali / <code>7772222</code>\n2. Hassan / <code>9993333</code>",
    );
    expect(formatReadyDonorMessages([], request)[0]).toContain(
      "No available donors were found for <b>O+</b>.",
    );

    const offerText = formatDonorContact(
      user({ name: "New Helper", phone: "7778888", telegramUsername: null }),
    );
    expect(offerText).toContain("A donor offered to help.");
    expect(offerText).toContain("Name: New Helper");
    expect(offerText).toContain("Phone: <code>7778888</code>");
  });

  it("keeps adding donors while the message remains within Telegram's limit", () => {
    const request = { bloodType: "O+" as const };
    const donors = Array.from({ length: 51 }, (_, index) =>
      user({
        id: index + 1,
        name: `Donor ${index + 1}`,
        phone: `777${String(index).padStart(4, "0")}`,
      }),
    );

    const messages = formatReadyDonorMessages(donors, request);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.match(/^\d+\. .* \/ /gm)).toHaveLength(51);
    expect(messages[0]).toContain("1. Donor 1");
    expect(messages[0]).toContain("51. Donor 51");
  });

  it("starts a new batch before the Telegram character limit", () => {
    const request = { bloodType: "O+" as const };
    const donors = Array.from({ length: 50 }, (_, index) =>
      user({
        id: index + 1,
        name: `Donor ${index + 1} ${"& long name ".repeat(8)}`,
        phone: `777${String(index).padStart(4, "0")}`,
      }),
    );

    const messages = formatReadyDonorMessages(donors, request);

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= TELEGRAM_MESSAGE_LENGTH_LIMIT)).toBe(true);
    expect(messages.join("\n")).toContain("1. Donor 1");
    expect(messages.join("\n")).toContain("50. Donor 50");

    const [pathologicalMessage] = formatReadyDonorMessages(
      [user({ name: "&".repeat(5_000), phone: "7".repeat(5_000) })],
      request,
    );
    expect(pathologicalMessage?.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LENGTH_LIMIT);
    expect(pathologicalMessage).toMatch(/…<\/code>$/);
  });

  it("finds ready donors with mobile and Telegram contact details in one query", async () => {
    const db = dbMock();
    const readyDonors = [
      {
        id: 1,
        name: "Aisha",
        phone: "7771234",
        telegramUserId: 444,
        telegramUsername: null,
      },
      {
        id: 2,
        name: "Hassan",
        phone: "9991234",
        telegramUserId: null,
        telegramUsername: "donor",
      },
      {
        id: 3,
        name: "Fathimath",
        phone: "7779999",
        telegramUserId: null,
        telegramUsername: null,
      },
    ];
    const select = db.queueSelect(readyDonors);

    await expect(
      findReadyDonors(db, {
        bloodType: "O+",
        requesterId: 3,
      }),
    ).resolves.toEqual(readyDonors);

    expect(select.where).toHaveBeenCalledTimes(1);
    expect(select.orderBy).toHaveBeenCalledTimes(1);
  });
});

describe("Telegram donor matching", () => {
  it("accepts any registered contact regardless of donor eligibility", async () => {
    const db = dbMock();
    const donor = user({
      address: "",
      bloodType: "A+",
      dob: new Date(DATE_NIL),
      id: 10,
      island: "",
      isAvailable: false,
      lastDonatedAt: new Date("2099-01-01"),
      nid: null,
      sex: "",
      telegramUserId: 100,
    });
    const requester = user({ id: 11, name: "Mohamed", telegramUserId: 200 });
    const request = {
      bloodType: "O+" as const,
      createdAt: new Date("2026-01-01"),
      id: 30,
      island: "Naifaru",
      location: "Hospital",
      notes: "",
      status: "open" as const,
      telegramChatId: -1001,
      telegramMessageId: 5,
      unitsNeeded: 1,
      updatedAt: new Date("2026-01-01"),
      urgent: false,
      userId: requester.id,
    };

    db.queueSelect([donor]);
    db.queueSelect([request]);
    db.queueSelect([requester]);
    db.queueSelect([]);
    const insert = db.queueInsert([]);

    await expect(
      acceptHelpOffer(db, { donorTelegramUserId: 100, requestId: request.id }),
    ).resolves.toMatchObject({
      donor,
      request,
      requester,
      status: "accepted",
    });

    expect(insert.values).toHaveBeenCalledWith({
      donorId: donor.id,
      notes: "",
      requestId: request.id,
      status: "accepted",
    });
  });

  it("requests a mobile number, handles duplicates, and identifies unregistered users", async () => {
    const request = {
      bloodType: "O+" as const,
      createdAt: new Date("2026-01-01"),
      id: 30,
      island: "",
      location: "Hospital",
      notes: "",
      status: "open" as const,
      telegramChatId: null,
      telegramMessageId: null,
      unitsNeeded: 1,
      updatedAt: new Date("2026-01-01"),
      urgent: false,
      userId: null,
    };

    const missingPhoneDb = dbMock();
    missingPhoneDb.queueSelect([user({ phone: null, telegramUserId: 100 })]);
    missingPhoneDb.queueSelect([request]);

    await expect(
      acceptHelpOffer(missingPhoneDb, { donorTelegramUserId: 100, requestId: request.id }),
    ).resolves.toMatchObject({ status: "profile_incomplete" });

    const duplicateDb = dbMock();
    const duplicateDonor = user({ telegramUserId: 100 });
    duplicateDb.queueSelect([duplicateDonor]);
    duplicateDb.queueSelect([request]);
    duplicateDb.queueSelect([{ donorId: duplicateDonor.id, requestId: request.id }]);

    await expect(
      acceptHelpOffer(duplicateDb, { donorTelegramUserId: 100, requestId: request.id }),
    ).resolves.toMatchObject({ status: "already_accepted" });
    expect(duplicateDb.insert).not.toHaveBeenCalled();

    const missingDb = dbMock();
    missingDb.queueSelect([]);

    await expect(
      acceptHelpOffer(missingDb, { donorTelegramUserId: 404, requestId: request.id }),
    ).resolves.toEqual({ status: "not_registered" });
  });
});
