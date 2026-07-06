import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "cancelled",
]);

export const userRoleEnum = pgEnum("user_role", ["admin", "staff"]);

export const otpTypeEnum = pgEnum("otp_type", ["email", "sms"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "outstanding",
  "paid",
  "partial",
]);

// ---------------------------------------------------------------------------
// Tenants (accommodation providers) and users
// ---------------------------------------------------------------------------

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  contactCell: varchar("contact_cell", { length: 32 }),
  province: varchar("province", { length: 64 }),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .notNull()
    .default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  isSuperAdminTenant: boolean("is_super_admin_tenant").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("admin"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    // Institution IDs this user (if staff) is scoped to. Empty = all institutions in tenant.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usernameUnique: uniqueIndex("users_username_unique").on(t.username),
  })
);

export const userInstitutionAccess = pgTable(
  "user_institution_access",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
  },
  (t) => ({
    userInstitutionUnique: uniqueIndex("user_institution_unique").on(
      t.userId,
      t.institutionId
    ),
  })
);

// ---------------------------------------------------------------------------
// OTP verifications (Phase 2 registration)
// ---------------------------------------------------------------------------

export const otpVerifications = pgTable(
  "otp_verifications",
  {
    id: serial("id").primaryKey(),
    // Opaque token returned to the client by /register/start and required by
    // /register/verify — avoids matching rows by contact when a code was sent
    // to both email and SMS for the same registration attempt.
    registrationToken: varchar("registration_token", { length: 64 }).notNull(),
    contact: varchar("contact", { length: 255 }).notNull(), // email address or cell number
    type: otpTypeEnum("type").notNull(),
    codeHash: text("code_hash").notNull(),
    // Pending registration payload, stored so verify can create the tenant without resubmission
    registrationPayload: text("registration_payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIndex: uniqueIndex("otp_verifications_token_type_unique").on(t.registrationToken, t.type),
  })
);

// ---------------------------------------------------------------------------
// Institutions & properties
// ---------------------------------------------------------------------------

export const institutions = pgTable(
  "institutions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    invoicePrefix: varchar("invoice_prefix", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantPrefixUnique: uniqueIndex("institutions_tenant_prefix_unique").on(
      t.tenantId,
      t.invoicePrefix
    ),
  })
);

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  capacity: integer("capacity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Students, invoices, line items
// ---------------------------------------------------------------------------

export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    studentNumber: varchar("student_number", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    surname: varchar("surname", { length: 255 }).notNull(),
    residence: varchar("residence", { length: 255 }),
    campus: varchar("campus", { length: 255 }),
    firstSeenInvoiceId: integer("first_seen_invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    institutionStudentUnique: uniqueIndex("students_institution_number_unique").on(
      t.institutionId,
      t.studentNumber
    ),
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    accountNo: varchar("account_no", { length: 64 }),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: invoiceStatusEnum("status").notNull().default("outstanding"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    institutionInvoiceUnique: uniqueIndex("invoices_institution_number_unique").on(
      t.institutionId,
      t.invoiceNumber
    ),
  })
);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  studentId: integer("student_id").references(() => students.id, {
    onDelete: "set null",
  }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unitAmount: numeric("unit_amount", { precision: 12, scale: 4 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  isFee: boolean("is_fee").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  institutions: many(institutions),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  institutionAccess: many(userInstitutionAccess),
}));

export const institutionsRelations = relations(institutions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [institutions.tenantId], references: [tenants.id] }),
  properties: many(properties),
  students: many(students),
  invoices: many(invoices),
}));

export const propertiesRelations = relations(properties, ({ one }) => ({
  institution: one(institutions, {
    fields: [properties.institutionId],
    references: [institutions.id],
  }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [students.institutionId],
    references: [institutions.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [invoices.institutionId],
    references: [institutions.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  student: one(students, {
    fields: [invoiceLineItems.studentId],
    references: [students.id],
  }),
}));
