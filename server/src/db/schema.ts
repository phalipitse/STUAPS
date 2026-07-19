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

export const addonStatusEnum = pgEnum("addon_status", [
  "active",
  "past_due",
  "cancelled",
]);

export const emailProviderEnum = pgEnum("email_provider", ["gmail"]);

export const detectedDocumentKindEnum = pgEnum("detected_document_kind", [
  "statement",
  "student_roster",
  "employee_roster",
  "unknown",
]);

export const detectedStatementStatusEnum = pgEnum("detected_statement_status", [
  "pending",
  "approved",
  "rejected",
  "import_failed",
]);

export const payslipLineTypeEnum = pgEnum("payslip_line_type", ["earning", "deduction"]);

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
  paystackCustomerCode: varchar("paystack_customer_code", { length: 255 }),
  paystackSubscriptionCode: varchar("paystack_subscription_code", { length: 255 }),
  // Premium add-on (financial statements + payroll): a second, independent Paystack
  // subscription so it can be billed monthly even for tenants on the annual base
  // plan (subscriptions can't mix billing intervals within themselves).
  addonStatus: addonStatusEnum("addon_status"),
  addonPaystackSubscriptionCode: varchar("addon_paystack_subscription_code", { length: 255 }),
  // "monthly" | "annual" — which base plan interval the tenant is on, set from
  // Paystack checkout metadata once the base subscription activates. Determines
  // which of the two premium add-on prices applies (R200/mo vs R150/mo extra).
  billingPlan: varchar("billing_plan", { length: 16 }),
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
// Bookkeeping (Premium add-on: financial statements)
// ---------------------------------------------------------------------------

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  // Tenant-wide, not per-institution — these are the accommodation provider's
  // own business expenses (rent, salaries, ...), distinct from the per-institution
  // student invoices the rest of the app reconciles.
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // false = accrued but not yet paid (an accounts-payable liability on the
  // balance sheet); true = already paid (a cash outflow on the cash flow statement).
  paid: boolean("paid").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Payroll (Premium add-on): employees and generated payslips
// ---------------------------------------------------------------------------

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  idNumber: varchar("id_number", { length: 32 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }),
  startDate: date("start_date"),
  monthlySalary: numeric("monthly_salary", { precision: 12, scale: 2 }).notNull(),
  // Soft-deactivate rather than delete, so past payslips keep a valid employee reference.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payslips = pgTable(
  "payslips",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // First day of the pay period's month, e.g. 2026-07-01 for July 2026.
    periodStart: date("period_start").notNull(),
    // Snapshot of the employee's monthly salary at the time this payslip was
    // generated — deliberately not a live reference, so a later salary change
    // doesn't rewrite history.
    grossSalary: numeric("gross_salary", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    employeePeriodUnique: uniqueIndex("payslips_employee_period_unique").on(
      t.employeeId,
      t.periodStart
    ),
  })
);

export const payslipLineItems = pgTable("payslip_line_items", {
  id: serial("id").primaryKey(),
  payslipId: integer("payslip_id")
    .notNull()
    .references(() => payslips.id, { onDelete: "cascade" }),
  // No built-in PAYE/UIF calculation — deductions (and any extra earnings like
  // overtime or a bonus) are manual line items the admin enters per payslip.
  type: payslipLineTypeEnum("type").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
});

// ---------------------------------------------------------------------------
// Email inbox integration (Gmail/Outlook statement detection)
// ---------------------------------------------------------------------------

export const emailConnections = pgTable(
  "email_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: emailProviderEnum("provider").notNull().default("gmail"),
    emailAddress: varchar("email_address", { length: 255 }).notNull(),
    // Refresh/access tokens are AES-256-GCM encrypted at rest (lib/crypto.ts) —
    // never stored or logged in plaintext.
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    encryptedAccessToken: text("encrypted_access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    // Comma-separated sender keywords/domains to watch for, e.g. "nsfas.org.za,fundi.co.za".
    watchKeywords: text("watch_keywords").notNull().default("nsfas.org.za"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    connectedByUserId: integer("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProviderUnique: uniqueIndex("email_connections_tenant_provider_unique").on(
      t.tenantId,
      t.provider
    ),
  })
);

export const detectedStatements = pgTable(
  "detected_statements",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    emailConnectionId: integer("email_connection_id")
      .notNull()
      .references(() => emailConnections.id, { onDelete: "cascade" }),
    providerMessageId: varchar("provider_message_id", { length: 255 }).notNull(),
    providerAttachmentId: varchar("provider_attachment_id", { length: 255 }),
    sender: varchar("sender", { length: 255 }).notNull(),
    subject: text("subject"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    attachmentFilename: varchar("attachment_filename", { length: 255 }),
    attachmentMimeType: varchar("attachment_mime_type", { length: 255 }),
    // Best-effort guess from the filename/subject — "statement" is the default
    // for backward compatibility with rows detected before this column existed.
    documentKind: detectedDocumentKindEnum("document_kind").notNull().default("statement"),
    status: detectedStatementStatusEnum("status").notNull().default("pending"),
    // Best-effort PDF parse preview, filled in once an admin approves — never
    // relied on blindly; see lib/pdfStatementParser.ts for the extraction heuristic.
    parsedPreview: text("parsed_preview"),
    importedInvoiceId: integer("imported_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    connectionMessageUnique: uniqueIndex("detected_statements_connection_message_unique").on(
      t.emailConnectionId,
      t.providerMessageId
    ),
  })
);

// Audit trail of documents sent out through a tenant's connected Gmail —
// e.g. an outstanding-balance report or a payslip emailed to a recipient
// from inside Stuaps. We record metadata only, never the attachment bytes.
export const sentEmails = pgTable("sent_emails", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  emailConnectionId: integer("email_connection_id")
    .notNull()
    .references(() => emailConnections.id, { onDelete: "cascade" }),
  sentByUserId: integer("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
  toAddress: varchar("to_address", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 998 }).notNull(),
  attachmentFilename: varchar("attachment_filename", { length: 255 }),
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  institutions: many(institutions),
  expenses: many(expenses),
  employees: many(employees),
  payslips: many(payslips),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
  payslips: many(payslips),
}));

export const payslipsRelations = relations(payslips, ({ one, many }) => ({
  tenant: one(tenants, { fields: [payslips.tenantId], references: [tenants.id] }),
  employee: one(employees, { fields: [payslips.employeeId], references: [employees.id] }),
  lineItems: many(payslipLineItems),
}));

export const payslipLineItemsRelations = relations(payslipLineItems, ({ one }) => ({
  payslip: one(payslips, { fields: [payslipLineItems.payslipId], references: [payslips.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  tenant: one(tenants, { fields: [expenses.tenantId], references: [tenants.id] }),
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

export const emailConnectionsRelations = relations(emailConnections, ({ one, many }) => ({
  tenant: one(tenants, { fields: [emailConnections.tenantId], references: [tenants.id] }),
  detectedStatements: many(detectedStatements),
  sentEmails: many(sentEmails),
}));

export const detectedStatementsRelations = relations(detectedStatements, ({ one }) => ({
  tenant: one(tenants, { fields: [detectedStatements.tenantId], references: [tenants.id] }),
  emailConnection: one(emailConnections, {
    fields: [detectedStatements.emailConnectionId],
    references: [emailConnections.id],
  }),
}));

export const sentEmailsRelations = relations(sentEmails, ({ one }) => ({
  tenant: one(tenants, { fields: [sentEmails.tenantId], references: [tenants.id] }),
  emailConnection: one(emailConnections, {
    fields: [sentEmails.emailConnectionId],
    references: [emailConnections.id],
  }),
}));

// ---------------------------------------------------------------------------
// Marketing site waitlist — separate from the real self-serve registration
// flow (which already gives a working 14-day trial with no waitlist). This
// is a lightweight, lower-friction "notify me" capture for the public
// landing page, mainly for prospects outside the current market.
// ---------------------------------------------------------------------------

export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    companyName: varchar("company_name", { length: 255 }),
    country: varchar("country", { length: 64 }),
    propertyCount: varchar("property_count", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("waitlist_signups_email_idx").on(table.email),
  })
);
