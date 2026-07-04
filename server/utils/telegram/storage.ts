import { eq, sql } from "drizzle-orm";
import type { StorageAdapter } from "grammy";

import { botSessions, telegramProcessedUpdates } from "../../schema";
import type { AppDb } from "./types";

export function createD1SessionStorage<T>(db: AppDb): StorageAdapter<T> {
  return {
    async delete(key) {
      await db.delete(botSessions).where(eq(botSessions.key, key));
    },
    async read(key) {
      const [row] = await db
        .select({ value: botSessions.value })
        .from(botSessions)
        .where(eq(botSessions.key, key))
        .limit(1);

      if (!row) return undefined;
      return JSON.parse(row.value) as T;
    },
    async write(key, value) {
      const json = JSON.stringify(value);
      const [row] = await db
        .select({ key: botSessions.key })
        .from(botSessions)
        .where(eq(botSessions.key, key))
        .limit(1);

      if (row) {
        await db
          .update(botSessions)
          .set({ updatedAt: sql`unixepoch()`, value: json })
          .where(eq(botSessions.key, key));
        return;
      }

      await db.insert(botSessions).values({ key, value: json });
    },
  };
}

export async function markTelegramUpdateProcessed(db: AppDb, updateId: number) {
  const [row] = await db
    .select({ updateId: telegramProcessedUpdates.updateId })
    .from(telegramProcessedUpdates)
    .where(eq(telegramProcessedUpdates.updateId, updateId))
    .limit(1);

  if (row) return false;

  await db.insert(telegramProcessedUpdates).values({ updateId });
  return true;
}
