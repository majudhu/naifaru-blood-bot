import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { DATE_NIL, PER_PAGE } from "../../shared/utils/const";
import * as schema from "../../server/schema";
import {
  autoImportMocks,
  createDbMock,
  createEvent,
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

function auditQueries(db: ReturnType<typeof createDbMock>) {
  return db.auditSelect.mock.calls.map(([query]) => new SQLiteSyncDialect().sqlToQuery(query));
}

const userBody = {
  name: "Aisha",
  address: "Harbour Road",
  bloodType: "A+",
  dob: "1990-03-04",
  island: "Naifaru",
  nid: "",
  phone: "",
  sex: "f",
  telegramUsername: "",
};

describe("web action audit coverage", () => {
  it.each([
    ["../../server/api/users.post", "create", "user", userBody],
    ["../../server/api/users/[id].put", "update", "user", userBody],
    [
      "../../server/api/requests.post",
      "create",
      "request",
      {
        userId: null,
        bloodType: "A+",
        location: "Hospital",
        island: "Naifaru",
        unitsNeeded: 1,
        urgent: false,
        status: "open",
        notes: "",
      },
    ],
    [
      "../../server/api/requests/[id].put",
      "update",
      "request",
      {
        userId: null,
        bloodType: "A+",
        location: "Hospital",
        island: "Naifaru",
        unitsNeeded: 1,
        urgent: false,
        status: "fulfilled",
        notes: "",
      },
    ],
    [
      "../../server/api/staff.post",
      "create",
      "staff",
      {
        username: "nurse",
        password: "private-password",
        role: "nurse",
        isActive: true,
      },
    ],
    [
      "../../server/api/staff/[id].put",
      "update",
      "staff",
      {
        username: "nurse",
        password: "private-password",
        role: "nurse",
        isActive: false,
      },
    ],
    ["../../server/api/staff/[id].delete", "delete", "staff", undefined],
    ["../../server/api/donations/[id].delete", "delete", "donation", undefined],
  ])(
    "audits %s with a server-controlled actor and no passwords",
    async (path, action, entity, body) => {
      const { default: handler } = await import(path as string);
      const db = createDbMock();
      db.queueSelect([
        { lastDonatedAt: new Date(DATE_NIL), status: "Non-Donor", telegramUserId: null },
      ]);
      db.queueInsert([{ id: 9 }]);
      db.queueUpdate({ meta: { changes: 1 } });
      db.queueDelete({ meta: { changes: 1 } });
      const event = createEvent({
        db,
        body: body ? { ...body, actorId: 999, actorName: "Spoofed" } : undefined,
        params: { id: "9" },
        headers: { "cf-connecting-ip": "192.0.2.1" },
      });

      await handler(event);

      expect(db.batch).toHaveBeenCalledOnce();
      const [query] = auditQueries(db);
      expect(query!.sql).toContain("SELECT NULL");
      expect(query!.sql).toContain("WHERE changes() > 0");
      expect(query!.params.slice(0, 5)).toEqual([1, "Admin", "admin", action, entity]);
      expect(query!.params.at(-1)).toBe("192.0.2.1");
      expect(JSON.stringify(query!.params)).not.toMatch(/private-password|hashed:|Spoofed/);
      expect(query!.params).not.toContain(999);
    },
  );

  it("audits donation creation as well as the user date change", async () => {
    const { default: handler } = await import("../../server/api/users/[id].put");
    const db = createDbMock();
    db.queueSelect([
      { lastDonatedAt: new Date(DATE_NIL), status: "Non-Donor", telegramUserId: null },
    ]);
    db.queueUpdate({ meta: { changes: 1 } });
    await handler(
      createEvent({ db, params: { id: "9" }, body: { ...userBody, lastDonatedAt: "2026-10-01" } }),
    );
    expect(auditQueries(db).map((query) => query.params.slice(3, 5))).toEqual([
      ["update", "user"],
      ["create", "donation"],
    ]);
  });

  it("does not audit rejected user input", async () => {
    const { default: handler } = await import("../../server/api/staff.post");
    const event = createEvent({ body: { username: "nurse", password: "short", role: "nurse" } });
    await expect(handler(event)).rejects.toThrow(/Invalid length/);
    expect(event.db.batch).not.toHaveBeenCalled();
    expect(event.db.auditSelect).not.toHaveBeenCalled();
  });

  it("does not audit forbidden mutations", async () => {
    const { default: handler } = await import("../../server/api/staff/[id].delete");
    const event = createEvent({ params: { id: "9" }, session: { user: { id: 3, role: "nurse" } } });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(event.db.batch).not.toHaveBeenCalled();
    expect(event.db.auditSelect).not.toHaveBeenCalled();
  });

  it("propagates a failed audit batch instead of reporting success", async () => {
    const { default: handler } = await import("../../server/api/staff/[id].delete");
    const event = createEvent({ params: { id: "9" } });
    event.db.batch.mockRejectedValueOnce(new Error("Audit write failed"));
    await expect(handler(event)).rejects.toThrow("Audit write failed");
  });

  it("records successful and failed sign-ins without credentials", async () => {
    const { default: handler } = await import("../../server/api/login.post");
    const event = createEvent({ body: { username: "nurse", password: "private-password" } });
    event.db.queueSelect([{ id: 7, password: "stored-hash", role: "nurse" }]);
    autoImportMocks.verifyPassword.mockResolvedValueOnce(true);
    await handler(event);
    expect(auditQueries(event.db)[0]!.params.slice(0, 6)).toEqual([
      7,
      "nurse",
      "nurse",
      "login",
      "staff",
      7,
    ]);

    event.db.queueSelect([]);
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(auditQueries(event.db)[1]!.params.slice(0, 6)).toEqual([
      null,
      "nurse",
      null,
      "login_failed",
      "staff",
      null,
    ]);
    expect(JSON.stringify(auditQueries(event.db))).not.toMatch(/private-password|stored-hash/);
  });

  it("records sign-outs through the auth session clear hook", async () => {
    type ClearHook = (session: TestEvent["session"], event: TestEvent) => Promise<void>;
    const hook = vi.fn<(name: string, callback: ClearHook) => void>();
    vi.stubGlobal("sessionHooks", { hook });
    vi.stubGlobal("defineNitroPlugin", (callback: () => void) => {
      callback();
    });
    await import("../../server/plugins/audit");
    const event = createEvent();
    expect(hook.mock.calls[0]![0]).toBe("clear");
    await hook.mock.calls[0]![1](event.session, event);
    expect(auditQueries(event.db)[0]!.params.slice(0, 6)).toEqual([
      1,
      "Admin",
      "admin",
      "logout",
      "staff",
      1,
    ]);
    await hook.mock.calls[0]![1]({ user: undefined } as never, event);
    expect(event.db.auditSelect).toHaveBeenCalledOnce();
  });
});

describe("read-only admin audit API", () => {
  it.each(["nurse", "lab"])("rejects %s before querying logs", async (role) => {
    const { default: handler } = await import("../../server/api/audit-logs.get");
    const event = createEvent({ session: { user: { id: 3, role } } });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(event.db.select).not.toHaveBeenCalled();
  });

  it("requires authentication before querying logs", async () => {
    const { default: handler } = await import("../../server/api/audit-logs.get");
    autoImportMocks.requireUserSession.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    const event = createEvent();
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(event.db.select).not.toHaveBeenCalled();
  });

  it("paginates newest first and uses the same filters for rows and total", async () => {
    const { default: handler } = await import("../../server/api/audit-logs.get");
    const db = createDbMock();
    const rows = [{ id: 8, actorName: "Admin", action: "update", entityType: "user" }];
    const list = db.queueSelect(rows);
    const total = db.queueSelect([{ count: 31 }]);
    await expect(
      handler(
        createEvent({
          db,
          query: { page: "2", search: "Aisha", action: "update", entity: "user" },
        }),
      ),
    ).resolves.toEqual({ data: rows, total: 31 });
    expect(list.from).toHaveBeenCalledWith(schema.auditLogs);
    expect(list.limit).toHaveBeenCalledWith(PER_PAGE);
    expect(list.offset).toHaveBeenCalledWith(PER_PAGE);
    expect(total.where).toHaveBeenCalledWith(list.where.mock.calls[0]![0]);
    const dialect = new SQLiteSyncDialect();
    expect(dialect.sqlToQuery(list.where.mock.calls[0]![0] as SQL).params).toEqual([
      "%Aisha%",
      "%Aisha%",
      "%Aisha%",
      "update",
      "user",
    ]);
    expect(
      list.orderBy.mock.calls[0]!.map((order) => dialect.sqlToQuery(order as SQL).sql),
    ).toEqual(['"audit_logs"."created_at" desc', '"audit_logs"."id" desc']);
    expect(db.auditSelect).not.toHaveBeenCalled();
  });

  it("returns an empty first page with default filters", async () => {
    const { default: handler } = await import("../../server/api/audit-logs.get");
    const db = createDbMock();
    const list = db.queueSelect([]);
    db.queueSelect([{ count: 0 }]);
    await expect(handler(createEvent({ db }))).resolves.toEqual({ data: [], total: 0 });
    expect(list.where).toHaveBeenCalledWith(undefined);
    expect(list.offset).toHaveBeenCalledWith(0);
  });

  it.each([
    { page: "0" },
    { page: "-1" },
    { page: "1.5" },
    { page: "Infinity" },
    { page: "9007199254740992" },
    { action: "fake" },
    { entity: "fake" },
    { search: "a".repeat(201) },
  ])("rejects invalid filters %j", async (query) => {
    const { default: handler } = await import("../../server/api/audit-logs.get");
    const event = createEvent({ query });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(event.db.select).not.toHaveBeenCalled();
  });
});
