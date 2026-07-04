import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../server/utils/telegram/types";
import type { User } from "../../server/schema";
import {
  acceptHelpOffer,
  createBloodRequest,
  upsertTelegramContactUser,
} from "../../server/utils/telegram/services";
import { formatChannelRequest } from "../../server/utils/telegram/format";
import { assertTelegramWebhookSecret } from "../../server/utils/telegram/config";
import { markTelegramUpdateProcessed } from "../../server/utils/telegram/storage";
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
    lastDonatedAt: new Date("1970-01-01"),
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
  it("accepts missing expected secrets and rejects mismatches", () => {
    expect(() => assertTelegramWebhookSecret(undefined, undefined)).not.toThrow();
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
      dob: new Date("1970-01-01"),
      id: 12,
      isAvailable: false,
      lastDonatedAt: new Date("1970-01-01"),
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
      location: "Naifaru Health Centre",
      notes: "",
      status: "open" as const,
      telegramChatId: null,
      telegramMessageId: null,
      unitsNeeded: 2,
      updatedAt: new Date("2026-01-01"),
      urgent: true,
      userId: requester.id,
    };
    const insert = db.queueInsert([request]);

    await expect(
      createBloodRequest(db, requester, {
        bloodType: "O+",
        location: "Naifaru Health Centre",
        unitsNeeded: 2,
        urgent: true,
      }),
    ).resolves.toEqual(request);

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        bloodType: "O+",
        location: "Naifaru Health Centre",
        unitsNeeded: 2,
        urgent: true,
        userId: requester.id,
      }),
    );

    const channelText = formatChannelRequest(request);
    expect(channelText).toContain("Naifaru Health Centre");
    expect(channelText).not.toContain("9991111");
  });
});

describe("Telegram donor matching", () => {
  it("accepts a compatible donor and records the donor response", async () => {
    const db = dbMock();
    const donor = user({ id: 10, telegramUserId: 100 });
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
    db.queueSelect([]);
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

  it("rejects wrong blood type, cooldown, duplicates, and missing registrations", async () => {
    const wrongDb = dbMock();
    const donor = user({ bloodType: "A+", telegramUserId: 100 });
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
    wrongDb.queueSelect([donor]);
    wrongDb.queueSelect([]);
    wrongDb.queueSelect([request]);

    await expect(
      acceptHelpOffer(wrongDb, { donorTelegramUserId: 100, requestId: request.id }),
    ).resolves.toMatchObject({ status: "wrong_blood_type" });

    const cooldownDb = dbMock();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03"));
    cooldownDb.queueSelect([user({ lastDonatedAt: new Date("2026-06-01"), telegramUserId: 100 })]);
    cooldownDb.queueSelect([]);
    cooldownDb.queueSelect([request]);

    await expect(
      acceptHelpOffer(cooldownDb, { donorTelegramUserId: 100, requestId: request.id }),
    ).resolves.toMatchObject({ status: "cooldown" });

    const duplicateDb = dbMock();
    const duplicateDonor = user({ telegramUserId: 100 });
    duplicateDb.queueSelect([duplicateDonor]);
    duplicateDb.queueSelect([]);
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
