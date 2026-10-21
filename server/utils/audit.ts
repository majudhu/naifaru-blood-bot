import { sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getRequestHeader, type H3Event } from "h3";
import type { User } from "#auth-utils";
import type { AuditAction, AuditEntity } from "../../shared/utils/audit";
import { auditLogs } from "../schema";
import type { useDb } from "./db";

type AuditActor = {
  id: number | null;
  name: string;
  role: User["role"] | null;
};

type AuditEntry = {
  action: AuditAction;
  entityType: AuditEntity;
  entityId: number | SQL | null;
  details?: Record<string, unknown>;
};

function auditQuery(
  db: ReturnType<typeof useDb>,
  event: H3Event,
  actor: AuditActor,
  entry: AuditEntry,
  condition: SQL,
) {
  // INSERT ... SELECT follows the auditLogs column order, including its generated
  // ID and timestamp. Use an insert builder so Drizzle can prepare it in a D1 batch.
  return db.insert(auditLogs).select(sql`
    SELECT NULL, ${actor.id}, ${actor.name}, ${actor.role}, ${entry.action}, ${entry.entityType},
      ${entry.entityId}, ${JSON.stringify(entry.details ?? {})},
      ${getRequestHeader(event, "cf-connecting-ip") ?? null}, unixepoch()
    WHERE ${condition}
  `);
}

export async function recordAuditLog(
  db: ReturnType<typeof useDb>,
  event: H3Event,
  actor: AuditActor,
  entry: AuditEntry,
) {
  await auditQuery(db, event, actor, entry, sql`1`);
}

export async function auditMutation<T extends BatchItem<"sqlite">>(
  db: ReturnType<typeof useDb>,
  event: H3Event,
  actor: User,
  entry: AuditEntry,
  mutation: T,
): Promise<T["_"]["result"]> {
  // D1 batches are atomic. changes() refers to the immediately preceding mutation,
  // so missing rows and stale edits never produce a successful audit entry.
  const [result] = await db.batch([
    mutation,
    auditQuery(db, event, actor, entry, sql`changes() > 0`),
  ]);
  return result;
}
