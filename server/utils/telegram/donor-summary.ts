import { count, eq, inArray, sql } from "drizzle-orm";
import type { Api } from "grammy";

import { bloodTypeValues, donorStatusValues } from "../../../shared/utils/const";
import { users, type User } from "../../schema";
import { escapeHtml } from "./format";
import type { AppDb, TelegramConfig } from "./types";

export type DonorSummaryGroup = {
  bloodType: (typeof bloodTypeValues)[number];
  total: number;
  waiting: number;
  temporary: number;
  reserved: number;
};

type SummaryDonor = Pick<User, "name" | "bloodType">;

export function formatDonorSummary(donor: SummaryDonor, groups: DonorSummaryGroup[]) {
  const totals = groups.reduce(
    (total, group) => ({
      total: total.total + group.total,
      waiting: total.waiting + group.waiting,
      temporary: total.temporary + group.temporary,
      reserved: total.reserved + group.reserved,
    }),
    { total: 0, waiting: 0, temporary: 0, reserved: 0 },
  );

  const shortDetail = (value: string) =>
    escapeHtml(value.replace(/\s+/g, " ").trim().slice(0, 180));
  return [
    `New donor: <b>${shortDetail(donor.name)} ${escapeHtml(donor.bloodType || "Unknown")}</b>`,
    `Total: ${totals.total}, Donor: ${totals.total - totals.temporary - totals.reserved}, Cooldown: ${totals.waiting} ⏳, Temp: ${totals.temporary} 🕒, Reserved: ${totals.reserved} 🔒`,
    ...bloodTypeValues
      .filter((bloodType) => bloodType !== "" || groups.some((group) => group.bloodType === ""))
      .map((bloodType) => {
        const group = groups.find((group) => group.bloodType === bloodType);
        return `${bloodType || "Unknown"}: ${group?.total ?? 0} • ${group?.waiting ?? 0} ⏳ • ${group?.temporary ?? 0} 🕒 • ${group?.reserved ?? 0} 🔒`;
      }),
  ].join("\n");
}

export async function sendDonorSummary(
  api: Api,
  config: TelegramConfig,
  db: AppDb,
  userId: number,
) {
  const [donor] = await db
    .select({
      name: users.name,
      bloodType: users.bloodType,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!donor) return;
  const groups = await db
    .select({
      bloodType: users.bloodType,
      total: count(),
      waiting:
        sql<number>`sum(case when ${users.lastDonatedAt} > unixepoch('now', '-90 days') then 1 else 0 end)`.mapWith(
          Number,
        ),
      temporary:
        sql<number>`sum(case when ${users.status} = 'Temporary' then 1 else 0 end)`.mapWith(Number),
      reserved: sql<number>`sum(case when ${users.status} = 'Reserved' then 1 else 0 end)`.mapWith(
        Number,
      ),
    })
    .from(users)
    .where(inArray(users.status, donorStatusValues))
    .groupBy(users.bloodType);
  await api.sendMessage(config.adminGroupId, formatDonorSummary(donor, groups), {
    parse_mode: "HTML",
  });
}
