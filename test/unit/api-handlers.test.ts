import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DATE_NIL, PER_PAGE } from "../../shared/utils/const";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import * as schema from "../../server/schema";
import {
  autoImportMocks,
  createDbMock,
  createEvent,
  expectHttpError,
  installApiTestGlobals,
  type TestEvent,
} from "./api-test-utils";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  installApiTestGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const validUserBody = {
  address: "Harbour Road",
  bloodType: "A+",
  dob: "1990-03-04",
  island: "Naifaru",
  name: "Aisha",
  nid: "",
  phone: "",
  sex: "f",
  telegramUsername: "",
};

const validRequestBody = {
  bloodType: "O+",
  island: "Naifaru",
  location: "Health Centre",
  notes: "Surgery",
  status: "open",
  unitsNeeded: 2,
  urgent: true,
  userId: null,
};

async function expectRejectsWithStatus(run: Promise<unknown>, statusCode: number) {
  try {
    await run;
    throw new Error("Expected handler to reject");
  } catch (error) {
    expectHttpError(error, statusCode);
  }
}

describe("login API", () => {
  it("sets a staff user session for valid credentials", async () => {
    const { default: handler } = await import("../../server/api/login.post");
    const db = createDbMock();
    db.queueSelect([{ id: 7, password: "stored-hash", role: "admin" }]);
    autoImportMocks.verifyPassword.mockResolvedValue(true);
    const event = createEvent({
      body: { password: "password123", username: "admin" },
      db,
      session: { user: {} },
    });

    await expect(handler(event)).resolves.toBeNull();

    expect(autoImportMocks.verifyPassword).toHaveBeenCalledWith("stored-hash", "password123");
    expect(autoImportMocks.setUserSession).toHaveBeenCalledWith(event, {
      user: { id: 7, name: "admin", role: "admin" },
    });
    expect(event.writtenSession).toEqual({ user: { id: 7, name: "admin", role: "admin" } });
  });

  it("rejects bad credentials", async () => {
    const { default: handler } = await import("../../server/api/login.post");
    const db = createDbMock();
    db.queueSelect([{ id: 7, password: "stored-hash", role: "admin" }]);
    const event = createEvent({
      body: { password: "password123", username: "admin" },
      db,
      session: { user: {} },
    });

    await expectRejectsWithStatus(handler(event), 401);

    expect(autoImportMocks.setUserSession).not.toHaveBeenCalled();
  });

  it("validates the login body before querying staff", async () => {
    const { default: handler } = await import("../../server/api/login.post");
    const db = createDbMock();
    const event = createEvent({
      body: { password: "short", username: "ab" },
      db,
      session: { user: {} },
    });

    await expect(handler(event)).rejects.toBeInstanceOf(Error);

    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("staff API", () => {
  it("only lets admins list staff and hides passwords", async () => {
    const { default: handler } = await import("../../server/api/staff.get");
    const staff = [{ id: 2, isActive: true, role: "nurse", username: "nurse" }];
    const db = createDbMock();
    db.query.staff.findMany.mockResolvedValue(staff);
    const event = createEvent({ db });

    await expect(handler(event)).resolves.toEqual(staff);

    expect(db.query.staff.findMany).toHaveBeenCalledWith({ columns: { password: false } });
  });

  it("rejects non-admin staff list access", async () => {
    const { default: handler } = await import("../../server/api/staff.get");
    const event = createEvent({ session: { user: { id: 3, role: "lab" } } });

    await expectRejectsWithStatus(handler(event), 403);
  });

  it("hashes staff passwords before inserting", async () => {
    const { default: handler } = await import("../../server/api/staff.post");
    const db = createDbMock();
    const insert = db.queueInsert([{ id: 9 }]);
    const event = createEvent({
      body: {
        isActive: true,
        password: "password123",
        role: "lab",
        username: "  new-lab  ",
      },
      db,
    });

    await expect(handler(event)).resolves.toEqual({ id: 9 });

    expect(autoImportMocks.hashPassword).toHaveBeenCalledWith("password123");
    expect(insert.values).toHaveBeenCalledWith({
      isActive: true,
      password: "hashed:password123",
      role: "lab",
      username: "new-lab",
    });
  });

  it("guards admins from changing their own role or active status", async () => {
    const { default: handler } = await import("../../server/api/staff/[id].put");
    const shared: Partial<TestEvent> = {
      params: { id: "7" },
      session: { user: { id: 7, role: "admin" } },
    };

    await expectRejectsWithStatus(
      handler(
        createEvent({
          ...shared,
          body: { isActive: true, role: "nurse", username: "admin" },
        }),
      ),
      400,
    );
    await expectRejectsWithStatus(
      handler(
        createEvent({
          ...shared,
          body: { isActive: false, role: "admin", username: "admin" },
        }),
      ),
      400,
    );
  });

  it("hashes optional passwords on staff update", async () => {
    const { default: handler } = await import("../../server/api/staff/[id].put");
    const db = createDbMock();
    const update = db.queueUpdate({ meta: { changes: 1 } });
    const event = createEvent({
      body: {
        isActive: true,
        password: "newpass123",
        role: "admin",
        username: "admin",
      },
      db,
      params: { id: "8" },
    });

    await expect(handler(event)).resolves.toBeNull();

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        password: "hashed:newpass123",
        role: "admin",
        username: "admin",
      }),
    );
  });

  it("returns 404 when staff update and delete affect no rows", async () => {
    const { default: updateHandler } = await import("../../server/api/staff/[id].put");
    const dbForUpdate = createDbMock();
    dbForUpdate.queueUpdate({ meta: { changes: 0 } });

    await expectRejectsWithStatus(
      updateHandler(
        createEvent({
          body: { isActive: true, role: "nurse", username: "missing" },
          db: dbForUpdate,
          params: { id: "99" },
        }),
      ),
      404,
    );

    vi.resetModules();
    installApiTestGlobals();
    const { default: deleteHandler } = await import("../../server/api/staff/[id].delete");
    const dbForDelete = createDbMock();
    dbForDelete.queueDelete({ meta: { changes: 0 } });

    await expectRejectsWithStatus(
      deleteHandler(createEvent({ db: dbForDelete, params: { id: "99" } })),
      404,
    );
  });

  it("prevents admins from deleting themselves", async () => {
    const { default: handler } = await import("../../server/api/staff/[id].delete");

    await expectRejectsWithStatus(
      handler(
        createEvent({
          params: { id: "7" },
          session: { user: { id: 7, role: "admin" } },
        }),
      ),
      400,
    );
  });
});

describe("users API", () => {
  it.each(["Donor", "Temporary", "Reserved", "Non-Donor"])(
    "accepts user status %s",
    async (status) => {
      const { CreateuserParser } = await import("../../server/api/users.post");
      expect(CreateuserParser({ ...validUserBody, status }).status).toBe(status);
    },
  );

  it.each(["Available", "", true, null])("rejects invalid user status %s", async (status) => {
    const { CreateuserParser } = await import("../../server/api/users.post");
    expect(() => CreateuserParser({ ...validUserBody, status })).toThrow("Invalid type");
  });

  it.each([
    ["non-donors", "Non-Donor"],
    ["Temporary", "Temporary"],
    ["Reserved", "Reserved"],
  ])("filters users by %s", async (filter, status) => {
    const { default: handler } = await import("../../server/api/users.get");
    const db = createDbMock();
    const list = db.queueSelect([]);
    db.queueSelect([{ count: 0 }]);
    await handler(createEvent({ db, query: { status: filter } }));
    const query = new SQLiteSyncDialect().sqlToQuery(list.where.mock.calls[0]![0] as SQL);
    expect(query.sql).toContain('"users"."status" = ?');
    expect(query.params).toEqual([status]);
  });

  it.each(["donors", "ready", "cooldown"])(
    "includes every donor status in the web %s filter",
    async (status) => {
      const { default: handler } = await import("../../server/api/users.get");
      const db = createDbMock();
      const list = db.queueSelect([]);
      db.queueSelect([{ count: 0 }]);
      await handler(createEvent({ db, query: { status } }));
      const query = new SQLiteSyncDialect().sqlToQuery(list.where.mock.calls[0]![0] as SQL);
      expect(query.sql).toContain('"users"."status" <> ?');
      expect(query.params).toEqual(["Non-Donor"]);
    },
  );

  it("returns paginated users with the total", async () => {
    const { default: handler } = await import("../../server/api/users.get");
    const db = createDbMock();
    const listQuery = db.queueSelect([{ bloodType: "A+", id: 1, status: "Donor", name: "Aisha" }]);
    db.queueSelect([{ count: 41 }]);
    db.queueSelect([{ count: 30 }]);
    db.queueSelect([{ count: 3 }]);
    const event = createEvent({
      db,
      query: { page: "3", search: "ai", status: "ready", type: "A+" },
    });

    await expect(handler(event)).resolves.toEqual({
      data: [{ bloodType: "A+", id: 1, status: "Donor", name: "Aisha" }],
      total: 41,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(PER_PAGE);
    expect(listQuery.offset).toHaveBeenCalledWith(40);
  });

  it("creates users and normalizes nullable and date fields", async () => {
    const { default: handler } = await import("../../server/api/users.post");
    const db = createDbMock();
    const insert = db.queueInsert([{ id: 12 }]);
    const event = createEvent({
      body: validUserBody,
      db,
    });

    await expect(handler(event)).resolves.toEqual({ id: 12 });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dob: new Date("1990-03-04"),
        status: "Non-Donor",
        nid: null,
        notes: "",
        phone: null,
        telegramUsername: null,
      }),
    );
  });

  it("stores DATE_NIL when creating a user without date values", async () => {
    const { default: handler } = await import("../../server/api/users.post");
    const db = createDbMock();
    const insert = db.queueInsert([{ id: 13 }]);
    const event = createEvent({ body: { ...validUserBody, dob: "" }, db });

    await expect(handler(event)).resolves.toEqual({ id: 13 });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dob: new Date(DATE_NIL),
        lastDonatedAt: new Date(DATE_NIL),
      }),
    );
  });

  it("gets users by id and reports missing users", async () => {
    const { default: handler } = await import("../../server/api/users/[id].get");
    const db = createDbMock();
    db.queueSelect([{ id: 1, name: "Aisha" }]);

    await expect(handler(createEvent({ db, params: { id: "1" } }))).resolves.toEqual({
      id: 1,
      name: "Aisha",
    });

    const missingDb = createDbMock();
    missingDb.queueSelect([]);
    await expectRejectsWithStatus(
      handler(createEvent({ db: missingDb, params: { id: "404" } })),
      404,
    );
  });

  it("validates user update ids and reports no-row updates", async () => {
    const { default: handler } = await import("../../server/api/users/[id].put");

    await expectRejectsWithStatus(
      handler(createEvent({ body: validUserBody, params: { id: "0" } })),
      400,
    );

    const db = createDbMock();
    db.queueSelect([{ lastDonatedAt: new Date(DATE_NIL) }]);
    db.queueUpdate({ meta: { changes: 0 } });
    await expectRejectsWithStatus(
      handler(createEvent({ body: validUserBody, db, params: { id: "404" } })),
      404,
    );
  });

  it("records a donation when the last donation date changes", async () => {
    const { default: handler } = await import("../../server/api/users/[id].put");
    const db = createDbMock();
    db.queueSelect([{ lastDonatedAt: new Date(DATE_NIL) }]);
    db.queueUpdate({ meta: { changes: 1 } });
    const insert = db.queueInsert([{ id: 99 }]);
    const event = createEvent({
      body: { ...validUserBody, lastDonatedAt: "2026-09-01" },
      db,
      params: { id: "7" },
    });

    await expect(handler(event)).resolves.toBeNull();

    expect(insert.values).toHaveBeenCalledWith({
      donorId: 7,
      bloodType: "A+",
      donatedAt: new Date("2026-09-01"),
    });
  });

  it("does not record a donation when the last donation date is unchanged", async () => {
    const { default: handler } = await import("../../server/api/users/[id].put");
    const db = createDbMock();
    db.queueSelect([{ lastDonatedAt: new Date("2026-09-01") }]);
    db.queueUpdate({ meta: { changes: 1 } });
    const event = createEvent({
      body: { ...validUserBody, lastDonatedAt: "2026-09-01" },
      db,
      params: { id: "7" },
    });

    await expect(handler(event)).resolves.toBeNull();

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("does not record a donation when the last donation date is cleared", async () => {
    const { default: handler } = await import("../../server/api/users/[id].put");
    const db = createDbMock();
    db.queueSelect([{ lastDonatedAt: new Date("2026-09-01") }]);
    db.queueUpdate({ meta: { changes: 1 } });
    const event = createEvent({
      body: { ...validUserBody, lastDonatedAt: "" },
      db,
      params: { id: "7" },
    });

    await expect(handler(event)).resolves.toBeNull();

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("donations API", () => {
  it("returns paginated donations with donor details", async () => {
    const { default: handler } = await import("../../server/api/donations.get");
    const db = createDbMock();
    const listQuery = db.queueSelect([
      {
        bloodType: "A+",
        donatedAt: new Date("2026-09-01"),
        id: 1,
        donor: { id: 7, name: "Aisha" },
      },
    ]);
    const countQuery = db.queueSelect([{ count: 3 }]);
    const event = createEvent({
      db,
      query: { page: "1", search: "aisha", type: "A+" },
    });

    await expect(handler(event)).resolves.toEqual({
      data: [
        {
          bloodType: "A+",
          donatedAt: new Date("2026-09-01"),
          id: 1,
          donor: { id: 7, name: "Aisha" },
        },
      ],
      total: 3,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(PER_PAGE);
    expect(listQuery.offset).toHaveBeenCalledWith(0);
    expect(listQuery.leftJoin).toHaveBeenCalledOnce();
    expect(countQuery.leftJoin).toHaveBeenCalledOnce();
  });

  it("rejects non-admin donations access", async () => {
    const { default: handler } = await import("../../server/api/donations.get");
    const event = createEvent({ session: { user: { id: 3, role: "nurse" } } });

    await expectRejectsWithStatus(handler(event), 403);
  });

  it("lets admins delete only the selected donation entry", async () => {
    const { default: handler } = await import("../../server/api/donations/[id].delete");
    const db = createDbMock();
    const deletion = db.queueDelete({ meta: { changes: 1 } });

    await expect(handler(createEvent({ db, params: { id: "9" } }))).resolves.toBeNull();

    expect(db.delete).toHaveBeenCalledWith(schema.donations);
    const query = new SQLiteSyncDialect().sqlToQuery(deletion.where.mock.calls[0]![0] as SQL);
    expect(query).toMatchObject({ sql: '"donations"."id" = ?', params: [9] });
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each(["nurse", "lab"])("rejects donation deletion by %s staff", async (role) => {
    const { default: handler } = await import("../../server/api/donations/[id].delete");
    const event = createEvent({
      params: { id: "9" },
      session: { user: { id: 3, role } },
    });

    await expectRejectsWithStatus(handler(event), 403);

    expect(event.db.delete).not.toHaveBeenCalled();
  });

  it("requires a session before deleting a donation", async () => {
    const { default: handler } = await import("../../server/api/donations/[id].delete");
    autoImportMocks.requireUserSession.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    const event = createEvent({ params: { id: "9" } });

    await expectRejectsWithStatus(handler(event), 401);

    expect(event.db.delete).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "invalid", "0", "-1", "1.5", "Infinity", "9007199254740992"])(
    "rejects invalid donation ID %s before deleting",
    async (id) => {
      const { default: handler } = await import("../../server/api/donations/[id].delete");
      const event = createEvent({ params: { id } });

      await expectRejectsWithStatus(handler(event), 400);

      expect(event.db.delete).not.toHaveBeenCalled();
    },
  );

  it("reports a missing or already deleted donation", async () => {
    const { default: handler } = await import("../../server/api/donations/[id].delete");
    const db = createDbMock();
    db.queueDelete({ meta: { changes: 0 } });

    await expectRejectsWithStatus(handler(createEvent({ db, params: { id: "404" } })), 404);
  });
});

describe("requests API", () => {
  it("returns paginated blood requests", async () => {
    const { default: handler } = await import("../../server/api/requests.get");
    const db = createDbMock();
    const listQuery = db.queueSelect([{ bloodType: "O+", id: 4, urgent: true }]);
    const countQuery = db.queueSelect([{ count: 22 }]);
    const event = createEvent({
      db,
      query: { page: "2", priority: "1", search: "health", status: "open", type: "O+" },
    });

    await expect(handler(event)).resolves.toEqual({
      data: [{ bloodType: "O+", id: 4, urgent: true }],
      total: 22,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(PER_PAGE);
    expect(listQuery.offset).toHaveBeenCalledWith(PER_PAGE);
    expect(countQuery.where).toHaveBeenCalledWith(listQuery.where.mock.calls[0]![0]);
  });

  it("validates and inserts blood requests", async () => {
    const { default: handler } = await import("../../server/api/requests.post");
    const db = createDbMock();
    const insert = db.queueInsert([{ id: 5 }]);
    const event = createEvent({ body: validRequestBody, db });

    await expect(handler(event)).resolves.toEqual({ id: 5 });

    expect(insert.values).toHaveBeenCalledWith(validRequestBody);
  });

  it("rejects invalid request bodies before insert", async () => {
    const { default: handler } = await import("../../server/api/requests.post");
    const db = createDbMock();
    const event = createEvent({
      body: { ...validRequestBody, unitsNeeded: 0 },
      db,
    });

    await expect(handler(event)).rejects.toBeInstanceOf(Error);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("gets requests by id and reports missing requests", async () => {
    const { default: handler } = await import("../../server/api/requests/[id].get");
    const db = createDbMock();
    db.queueSelect([{ id: 3, location: "Health Centre" }]);

    await expect(handler(createEvent({ db, params: { id: "3" } }))).resolves.toEqual({
      id: 3,
      location: "Health Centre",
      responses: [],
    });

    const missingDb = createDbMock();
    missingDb.queueSelect([]);
    await expectRejectsWithStatus(
      handler(createEvent({ db: missingDb, params: { id: "404" } })),
      404,
    );
    expect(missingDb.select).toHaveBeenCalledTimes(1);
  });

  it("loads only the selected request's donor responses with contact details and all statuses", async () => {
    const { default: handler } = await import("../../server/api/requests/[id].get");
    const db = createDbMock();
    db.queueSelect([{ id: 3, location: "Health Centre" }]);
    const responses = ["contacted", "accepted", "declined", "donated"].map((status, index) => ({
      id: index + 1,
      donorId: index + 10,
      status,
      respondedAt: new Date("2026-09-18T00:00:00Z"),
      notes: "Follow up",
      donor: { id: index + 10, name: "Test donor", phone: "7000000", telegramUsername: null },
    }));
    const responseQuery = db.queueSelect(responses);

    await expect(handler(createEvent({ db, params: { id: "3" } }))).resolves.toMatchObject({
      id: 3,
      responses,
    });
    const dialect = new SQLiteSyncDialect();
    expect(
      dialect.sqlToQuery(
        responseQuery.where.mock.calls[0]![0] as Parameters<typeof dialect.sqlToQuery>[0],
      ),
    ).toMatchObject({
      sql: '"donor_responses"."request_id" = ?',
      params: [3],
    });
    expect(responseQuery.orderBy).toHaveBeenCalledOnce();
  });

  it("validates request update ids and reports no-row updates", async () => {
    const { default: handler } = await import("../../server/api/requests/[id].put");

    await expectRejectsWithStatus(
      handler(createEvent({ body: validRequestBody, params: { id: "0" } })),
      400,
    );

    const db = createDbMock();
    db.queueUpdate({ meta: { changes: 0 } });
    await expectRejectsWithStatus(
      handler(createEvent({ body: validRequestBody, db, params: { id: "404" } })),
      404,
    );
  });
});

describe("dashboard API", () => {
  it("returns donor counts and ready groups", async () => {
    const { default: handler } = await import("../../server/api/dashboard");
    const groups = [{ ready: 4, total: 8, type: "A+" }];
    const db = createDbMock();
    const queries = [
      db.queueSelect([{ count: 30 }]),
      db.queueSelect([{ count: 5 }]),
      db.queueSelect([{ count: 18 }]),
      db.queueSelect(groups),
    ];

    await expect(handler(createEvent({ db }))).resolves.toEqual({
      donors: 30,
      groups,
      new: 5,
      ready: 18,
    });
    for (const select of queries) {
      const query = new SQLiteSyncDialect().sqlToQuery(select.where.mock.calls[0]![0] as SQL);
      expect(query.sql).toContain('"users"."status" <> ?');
      expect(query.params).toEqual(["Non-Donor"]);
    }
  });
});
