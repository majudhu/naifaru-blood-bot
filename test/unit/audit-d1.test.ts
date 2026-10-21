import type {} from "../../_cloudflare/env";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../../server/utils/db";
import { auditMutation, recordAuditLog } from "../../server/utils/audit";
import { auditLogs, staff } from "../../server/schema";

describe("audit writes in the D1 runtime", () => {
  let platform: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: ReturnType<typeof createDb>;
  const actor = { id: 1, name: "Admin", role: "admin" as const };
  const event = {} as Parameters<typeof auditMutation>[1];

  beforeAll(async () => {
    platform = await getPlatformProxy<Env>({ persist: false, remoteBindings: false });
    db = createDb(platform.env.DB);
    for (const name of ["0000_polite_angel", "0006_audit-logs"]) {
      const migration = readFileSync(new URL(`../../drizzle/${name}.sql`, import.meta.url), "utf8");
      await platform.env.DB.batch(
        unstable_splitSqlQuery(migration).map((query) => platform.env.DB.prepare(query)),
      );
    }
  }, 20_000);

  afterAll(async () => {
    await platform?.dispose();
  });
  beforeEach(async () => {
    await db.delete(auditLogs);
  });

  it("records the created record ID rather than the audit ID", async () => {
    await recordAuditLog(db, event, actor, { action: "login", entityType: "staff", entityId: 1 });
    await recordAuditLog(db, event, actor, { action: "logout", entityType: "staff", entityId: 1 });
    const [created] = await auditMutation(
      db,
      event,
      actor,
      {
        action: "create",
        entityType: "staff",
        entityId: sql`last_insert_rowid()`,
        details: { username: "new-nurse" },
      },
      db
        .insert(staff)
        .values({ username: "new-nurse", password: "private-hash" })
        .returning({ id: staff.id }),
    );
    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, "create"));
    expect(entry).toMatchObject({
      actorId: 1,
      actorName: "Admin",
      actorRole: "admin",
      entityId: created!.id,
      details: { username: "new-nurse" },
      ipAddress: null,
    });
    expect(entry!.id).not.toBe(created!.id);
    expect(entry!.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(entry)).not.toContain("private-hash");
  });

  it("only logs updates and deletes that actually affect a row", async () => {
    const entry = { action: "update" as const, entityType: "staff" as const, entityId: 1 };
    const missing = await auditMutation(
      db,
      event,
      actor,
      entry,
      db.update(staff).set({ username: "missing" }).where(eq(staff.id, 999)),
    );
    expect(missing.meta.changes).toBe(0);
    expect(await db.select().from(auditLogs)).toEqual([]);

    await auditMutation(
      db,
      event,
      actor,
      entry,
      db.update(staff).set({ username: "renamed-admin" }).where(eq(staff.id, 1)),
    );
    await auditMutation(
      db,
      event,
      actor,
      { ...entry, action: "delete" },
      db.delete(staff).where(eq(staff.id, 1)),
    );
    await auditMutation(
      db,
      event,
      actor,
      { ...entry, action: "delete" },
      db.delete(staff).where(eq(staff.id, 1)),
    );
    const entries = await db.select().from(auditLogs).orderBy(auditLogs.id);
    expect(entries.map((log) => log.action)).toEqual(["update", "delete"]);
    expect(entries.map((log) => log.actorName)).toEqual(["Admin", "Admin"]);
  });

  it("rolls back the mutation when the audit insert fails", async () => {
    await platform.env.DB.prepare(`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs
      BEGIN SELECT RAISE(ABORT, 'Audit write rejected'); END`).run();
    try {
      await expect(
        auditMutation(
          db,
          event,
          actor,
          {
            action: "create",
            entityType: "staff",
            entityId: sql`last_insert_rowid()`,
          },
          db.insert(staff).values({ username: "rolled-back", password: "private-hash" }),
        ),
      ).rejects.toThrow("Audit write rejected");
      expect(await db.select().from(staff).where(eq(staff.username, "rolled-back"))).toEqual([]);
      expect(await db.select().from(auditLogs)).toEqual([]);
    } finally {
      await platform.env.DB.prepare("DROP TRIGGER reject_audit").run();
    }
  });
});
