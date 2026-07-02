import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const event = createEvent({ session: { user: { id: 3, role: "nurse" } } });

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
        role: "nurse",
        username: "  new-nurse  ",
      },
      db,
    });

    await expect(handler(event)).resolves.toEqual({ id: 9 });

    expect(autoImportMocks.hashPassword).toHaveBeenCalledWith("password123");
    expect(insert.values).toHaveBeenCalledWith({
      isActive: true,
      password: "hashed:password123",
      role: "nurse",
      username: "new-nurse",
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
  it("rejects user access without a staff role", async () => {
    const { default: handler } = await import("../../server/api/users.get");

    await expectRejectsWithStatus(handler(createEvent({ session: { user: {} } })), 403);
  });

  it("returns paginated users with the total", async () => {
    const { default: handler } = await import("../../server/api/users.get");
    const db = createDbMock();
    const listQuery = db.queueSelect([
      { bloodType: "A+", id: 1, isAvailable: true, name: "Aisha" },
    ]);
    db.queueSelect([{ count: 41 }]);
    db.queueSelect([{ count: 30 }]);
    db.queueSelect([{ count: 3 }]);
    const event = createEvent({
      db,
      query: { page: "3", search: "ai", status: "ready", type: "A+" },
    });

    await expect(handler(event)).resolves.toEqual({
      data: [{ bloodType: "A+", id: 1, isAvailable: true, name: "Aisha" }],
      total: 41,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(20);
    expect(listQuery.offset).toHaveBeenCalledWith(40);
  });

  it("normalizes nullable and date fields when creating users", async () => {
    const { default: handler } = await import("../../server/api/users.post");
    const db = createDbMock();
    const insert = db.queueInsert([{ id: 12 }]);
    const event = createEvent({ body: validUserBody, db });

    await expect(handler(event)).resolves.toEqual({ id: 12 });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dob: new Date("1990-03-04"),
        isAvailable: false,
        nid: null,
        notes: "",
        phone: null,
        telegramUsername: null,
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
    db.queueUpdate({ meta: { changes: 0 } });
    await expectRejectsWithStatus(
      handler(createEvent({ body: validUserBody, db, params: { id: "404" } })),
      404,
    );
  });
});

describe("requests API", () => {
  it("returns paginated blood requests", async () => {
    const { default: handler } = await import("../../server/api/requests.get");
    const db = createDbMock();
    const listQuery = db.queueSelect([{ bloodType: "O+", id: 4, urgent: true }]);
    db.queueSelect([{ count: 22 }]);
    const event = createEvent({
      db,
      query: { page: "2", priority: "1", search: "health", status: "open", type: "O+" },
    });

    await expect(handler(event)).resolves.toEqual({
      data: [{ bloodType: "O+", id: 4, urgent: true }],
      total: 22,
    });

    expect(listQuery.limit).toHaveBeenCalledWith(20);
    expect(listQuery.offset).toHaveBeenCalledWith(20);
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
    });

    const missingDb = createDbMock();
    missingDb.queueSelect([]);
    await expectRejectsWithStatus(
      handler(createEvent({ db: missingDb, params: { id: "404" } })),
      404,
    );
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
  it("rejects dashboard access without a staff role", async () => {
    const { default: handler } = await import("../../server/api/dashboard");

    await expectRejectsWithStatus(handler(createEvent({ session: { user: {} } })), 403);
  });

  it("returns donor counts and ready groups", async () => {
    const { default: handler } = await import("../../server/api/dashboard");
    const groups = [{ ready: 4, total: 8, type: "A+" }];
    const db = createDbMock();
    db.queueSelect([{ count: 30 }]);
    db.queueSelect([{ count: 5 }]);
    db.queueSelect([{ count: 18 }]);
    db.queueSelect(groups);

    await expect(handler(createEvent({ db }))).resolves.toEqual({
      donors: 30,
      groups,
      new: 5,
      ready: 18,
    });
  });
});
