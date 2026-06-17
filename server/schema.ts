import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  bloodTypeValues,
  donorResponseStatusValues,
  requestStatusValues,
  staffRoleValues,
} from "../shared/utils/const";

const timestampColumns = () => ({
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegramUserId: integer("telegram_user_id").unique(),
    telegramUsername: text("telegram_username").unique(),
    name: text("name").notNull(),
    phone: text("phone").unique(),
    bloodType: text("blood_type", { enum: bloodTypeValues }).notNull().default(""),
    nid: text("nid").unique(),
    sex: text("sex", { enum: ["m", "f"] }).notNull(),
    dob: integer("dob", { mode: "timestamp" }).notNull(),
    address: text("address").notNull().default(""),
    island: text("island").notNull().default(""),
    isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(false),
    lastDonatedAt: integer("last_donated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`0`),
    notes: text("notes").notNull().default(""),
    ...timestampColumns(),
  },
  (table) => [
    index("users_blood_type_idx").on(table.bloodType),
    index("users_is_available_idx").on(table.isAvailable),
    index("users_last_donated_at_idx").on(table.lastDonatedAt),
  ],
);

export const bloodRequests = sqliteTable(
  "blood_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    bloodType: text("blood_type", { enum: bloodTypeValues }).notNull(),
    location: text("location").notNull().default(""),
    island: text("island").notNull().default(""),
    unitsNeeded: integer("units_needed").notNull().default(1),
    urgent: integer("urgent", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: requestStatusValues }).notNull().default("open"),
    notes: text("notes").notNull().default(""),
    ...timestampColumns(),
  },
  (table) => [
    index("blood_requests_blood_type_idx").on(table.bloodType),
    index("blood_requests_status_idx").on(table.status),
  ],
);

export const staff = sqliteTable(
  "staff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    role: text("role", { enum: staffRoleValues }).notNull().default("nurse"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [
    index("staff_role_idx").on(table.role),
    index("staff_is_active_idx").on(table.isActive),
  ],
);

export const donorResponses = sqliteTable(
  "donor_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: integer("request_id")
      .notNull()
      .references(() => bloodRequests.id),
    donorId: integer("donor_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: donorResponseStatusValues }).notNull().default("contacted"),
    respondedAt: integer("responded_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    notes: text("notes").notNull().default(""),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("donor_responses_request_id_donor_id_unique").on(table.requestId, table.donorId),
    index("donor_responses_request_id_idx").on(table.requestId),
    index("donor_responses_donor_id_idx").on(table.donorId),
    index("donor_responses_status_idx").on(table.status),
  ],
);

export const donations = sqliteTable(
  "donations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    donorId: integer("donor_id")
      .notNull()
      .references(() => users.id),
    requestId: integer("request_id").references(() => bloodRequests.id),
    recordedByStaffId: integer("recorded_by_staff_id").references(() => staff.id),
    donatedAt: integer("donated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    notes: text("notes").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("donations_donor_id_idx").on(table.donorId),
    index("donations_request_id_idx").on(table.requestId),
    index("donations_recorded_by_staff_id_idx").on(table.recordedByStaffId),
    index("donations_donated_at_idx").on(table.donatedAt),
  ],
);

export const blacklist = sqliteTable("blacklist", {
  phone: text("phone").unique(),
  telegram: text("telegram").unique(),
  reason: text("reason").notNull().default(""),
});

export const usersRelations = relations(users, ({ many }) => ({
  responses: many(donorResponses),
  donations: many(donations),
}));

export const bloodRequestsRelations = relations(bloodRequests, ({ many }) => ({
  responses: many(donorResponses),
  donations: many(donations),
}));

export const staffRelations = relations(staff, ({ many }) => ({
  recordedDonations: many(donations),
}));

export const donorResponsesRelations = relations(donorResponses, ({ one }) => ({
  request: one(bloodRequests, {
    fields: [donorResponses.requestId],
    references: [bloodRequests.id],
  }),
  donor: one(users, {
    fields: [donorResponses.donorId],
    references: [users.id],
  }),
}));

export const donationsRelations = relations(donations, ({ one }) => ({
  donor: one(users, {
    fields: [donations.donorId],
    references: [users.id],
  }),
  request: one(bloodRequests, {
    fields: [donations.requestId],
    references: [bloodRequests.id],
  }),
  recordedByStaff: one(staff, {
    fields: [donations.recordedByStaffId],
    references: [staff.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BloodRequest = typeof bloodRequests.$inferSelect;
export type NewBloodRequest = typeof bloodRequests.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type DonorResponse = typeof donorResponses.$inferSelect;
export type NewDonorResponse = typeof donorResponses.$inferInsert;
export type Donation = typeof donations.$inferSelect;
export type NewDonation = typeof donations.$inferInsert;
