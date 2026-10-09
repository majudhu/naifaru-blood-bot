import { and, eq, gt, isNotNull, lte, notExists } from "drizzle-orm";
import type { Api } from "grammy";

import { cooldownReminders, users } from "../../schema";
import { DATE_NIL, DAY_MS } from "../../../shared/utils/const";
import { mainMenuKeyboard } from "./keyboards";
import type { CooldownReminderJob } from "./notifications";
import type { AppDb } from "./types";

export const COOLDOWN_REMINDER_CRON = "0 4 * * *";

function eligibleDonor(now: Date) {
  return and(
    eq(users.status, "Donor"),
    isNotNull(users.telegramUserId),
    gt(users.lastDonatedAt, new Date(DATE_NIL)),
    lte(users.lastDonatedAt, new Date(now.getTime() - 90 * DAY_MS)),
  );
}

function unreminded(db: AppDb) {
  return notExists(
    db
      .select()
      .from(cooldownReminders)
      .where(
        and(
          eq(cooldownReminders.userId, users.id),
          eq(cooldownReminders.donatedAt, users.lastDonatedAt),
        ),
      ),
  );
}

export async function enqueueCooldownReminders(
  db: AppDb,
  queue: Env["TELEGRAM_DONOR_NOTIFICATIONS"],
  now: Date,
) {
  const donors = await db
    .select({ userId: users.id, donatedAt: users.lastDonatedAt })
    .from(users)
    .where(and(eligibleDonor(now), unreminded(db)));
  for (let index = 0; index < donors.length; index += 100) {
    await queue.sendBatch(
      donors.slice(index, index + 100).map((donor) => ({
        body: {
          type: "cooldown_reminder",
          userId: donor.userId,
          donatedAt: donor.donatedAt.getTime() / 1000,
        } satisfies CooldownReminderJob,
        contentType: "json",
      })),
    );
  }
}

export async function completeCooldownReminder(db: AppDb, job: CooldownReminderJob) {
  await db
    .insert(cooldownReminders)
    .values({
      userId: job.userId,
      donatedAt: new Date(job.donatedAt * 1000),
    })
    .onConflictDoNothing();
}

export async function sendCooldownReminder(
  api: Api,
  db: AppDb,
  job: CooldownReminderJob,
  now = new Date(),
) {
  const [donor] = await db
    .select({ telegramUserId: users.telegramUserId })
    .from(users)
    .where(
      and(
        eq(users.id, job.userId),
        eq(users.lastDonatedAt, new Date(job.donatedAt * 1000)),
        eligibleDonor(now),
        unreminded(db),
      ),
    )
    .limit(1);
  if (!donor?.telegramUserId) return false;
  await api.sendMessage(
    donor.telegramUserId,
    "Your 90-day wait is over. You could help save a life by donating blood again. Thank you for being part of Naifaru Blood Donors!",
    { reply_markup: mainMenuKeyboard("Donor") },
  );
  await completeCooldownReminder(db, job);
  return true;
}
