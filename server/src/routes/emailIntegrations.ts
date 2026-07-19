import { Router } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailConnections, detectedStatements, invoices, students, employees, sentEmails } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import {
  isGmailConfigured,
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getGoogleUserEmail,
  searchGmailMessages,
  getGmailMessage,
  getGmailAttachment,
  sendGmailMessage,
} from "../lib/googleOAuth.js";
import { parseInvoiceCsv, CsvParseError } from "../lib/csvParser.js";
import { extractPdfText, parseStatementText, summarizeForPreview } from "../lib/pdfStatementParser.js";
import { importParsedCsvInvoice, importParsedPdfStatement } from "../lib/invoiceImport.js";
import {
  classifyRosterFile,
  parseStudentSpreadsheet,
  parseEmployeeSpreadsheet,
  extractDocxText,
  UnsupportedRosterFileError,
} from "../lib/rosterUpload.js";
import {
  isClaudeConfigured,
  extractStudentsFromDocument,
  extractStudentsFromText,
  extractEmployeesFromDocument,
  extractEmployeesFromText,
} from "../lib/claudeExtraction.js";
import { classifyDocumentKind } from "../lib/emailDocumentClassifier.js";

export const emailIntegrationsRouter = Router();
emailIntegrationsRouter.use(requireAuth, requireRole("admin"), requireActiveSubscription);

const outboundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function originOf(req: { protocol: string; get: (h: string) => string | undefined }) {
  return `${req.protocol}://${req.get("host")}`;
}

function redirectUriOf(req: { protocol: string; get: (h: string) => string | undefined }) {
  return `${originOf(req)}/api/email-integrations/gmail/callback`;
}

/** A fresh access token for the tenant's connection, refreshing it (and persisting the new expiry) if needed. */
async function getValidAccessToken(connection: typeof emailConnections.$inferSelect): Promise<string> {
  const stillValid =
    connection.encryptedAccessToken &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000;

  if (stillValid) {
    return decryptSecret(connection.encryptedAccessToken!);
  }

  const refreshToken = decryptSecret(connection.encryptedRefreshToken);
  const tokens = await refreshAccessToken(refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await db
    .update(emailConnections)
    .set({
      encryptedAccessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
    })
    .where(eq(emailConnections.id, connection.id));
  return tokens.access_token;
}

emailIntegrationsRouter.get("/status", async (req, res) => {
  const [connection] = await db
    .select()
    .from(emailConnections)
    .where(
      and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
    );

  res.json({
    gmailConfigured: isGmailConfigured(),
    connection: connection
      ? {
          id: connection.id,
          emailAddress: connection.emailAddress,
          watchKeywords: connection.watchKeywords,
          lastScannedAt: connection.lastScannedAt,
        }
      : null,
  });
});

emailIntegrationsRouter.get("/connect/gmail", (req, res) => {
  if (!isGmailConfigured()) {
    return res.status(400).json({ error: "Gmail integration is not configured on this server yet" });
  }
  const state = randomBytes(24).toString("hex");
  req.session.gmailOAuthState = state;
  const url = buildGoogleAuthUrl(redirectUriOf(req), state);
  res.json({ url });
});

emailIntegrationsRouter.get("/connect/gmail/callback", async (req, res) => {
  const clientOrigin = originOf(req);
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== "string" || state !== req.session.gmailOAuthState) {
      return res.redirect(`${clientOrigin}/email-inbox?error=invalid_state`);
    }
    req.session.gmailOAuthState = undefined;

    const tokens = await exchangeCodeForTokens(code, redirectUriOf(req));
    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on the *first* consent for this app+account;
      // if the tenant reconnects without revoking access first, prompt to redo it via
      // Google's account permissions page so we get a fresh one.
      return res.redirect(`${clientOrigin}/email-inbox?error=no_refresh_token`);
    }
    const emailAddress = await getGoogleUserEmail(tokens.access_token);

    const [existing] = await db
      .select()
      .from(emailConnections)
      .where(
        and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
      );

    const values = {
      tenantId: req.session.tenantId!,
      provider: "gmail" as const,
      emailAddress,
      encryptedRefreshToken: encryptSecret(tokens.refresh_token),
      encryptedAccessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      connectedByUserId: req.session.userId!,
    };

    if (existing) {
      await db.update(emailConnections).set(values).where(eq(emailConnections.id, existing.id));
    } else {
      await db.insert(emailConnections).values(values);
    }

    res.redirect(`${clientOrigin}/email-inbox?connected=1`);
  } catch (err) {
    console.error("Gmail OAuth callback failed:", err);
    res.redirect(`${clientOrigin}/email-inbox?error=connect_failed`);
  }
});

emailIntegrationsRouter.delete("/connect/gmail", async (req, res) => {
  await db
    .delete(emailConnections)
    .where(
      and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
    );
  res.json({ ok: true });
});

const watchKeywordsSchema = z.object({
  watchKeywords: z.string().min(1),
});

emailIntegrationsRouter.patch("/connect/gmail", async (req, res) => {
  const parsed = watchKeywordsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "watchKeywords is required" });
  }
  const [connection] = await db
    .select()
    .from(emailConnections)
    .where(
      and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
    );
  if (!connection) return res.status(404).json({ error: "Gmail is not connected" });

  await db
    .update(emailConnections)
    .set({ watchKeywords: parsed.data.watchKeywords })
    .where(eq(emailConnections.id, connection.id));
  res.json({ ok: true });
});

/** Builds a Gmail search query from the tenant's comma-separated sender keywords/domains. */
function buildSearchQuery(watchKeywords: string): string {
  const senders = watchKeywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `from:${k}`)
    .join(" OR ");
  return `(${senders}) has:attachment newer_than:180d`;
}

emailIntegrationsRouter.post("/scan", async (req, res, next) => {
  try {
    const [connection] = await db
      .select()
      .from(emailConnections)
      .where(
        and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
      );
    if (!connection) return res.status(404).json({ error: "Gmail is not connected" });

    const accessToken = await getValidAccessToken(connection);
    const query = buildSearchQuery(connection.watchKeywords);
    const messageIds = await searchGmailMessages(accessToken, query);

    let newCount = 0;
    for (const messageId of messageIds) {
      const [already] = await db
        .select({ id: detectedStatements.id })
        .from(detectedStatements)
        .where(
          and(
            eq(detectedStatements.emailConnectionId, connection.id),
            eq(detectedStatements.providerMessageId, messageId)
          )
        );
      if (already) continue;

      const message = await getGmailMessage(accessToken, messageId);
      if (!message.attachment) continue;

      await db.insert(detectedStatements).values({
        tenantId: req.session.tenantId!,
        emailConnectionId: connection.id,
        providerMessageId: message.id,
        providerAttachmentId: message.attachment.attachmentId,
        sender: message.sender,
        subject: message.subject,
        receivedAt: message.receivedAt,
        attachmentFilename: message.attachment.filename,
        attachmentMimeType: message.attachment.mimeType,
        documentKind: classifyDocumentKind(message.attachment.filename, message.subject),
        status: "pending",
      });
      newCount++;
    }

    await db
      .update(emailConnections)
      .set({ lastScannedAt: new Date() })
      .where(eq(emailConnections.id, connection.id));

    res.json({ newCount, scannedMessages: messageIds.length });
  } catch (err) {
    next(err);
  }
});

emailIntegrationsRouter.get("/detected", async (req, res) => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = await db
    .select()
    .from(detectedStatements)
    .where(
      statusFilter
        ? and(
            eq(detectedStatements.tenantId, req.session.tenantId!),
            eq(detectedStatements.status, statusFilter as (typeof detectedStatements.status.enumValues)[number])
          )
        : eq(detectedStatements.tenantId, req.session.tenantId!)
    )
    .orderBy(desc(detectedStatements.createdAt));
  res.json(rows);
});

async function loadTenantDetectedStatement(id: number, tenantId: number) {
  const [row] = await db
    .select()
    .from(detectedStatements)
    .where(and(eq(detectedStatements.id, id), eq(detectedStatements.tenantId, tenantId)));
  return row ?? null;
}

emailIntegrationsRouter.get("/detected/:id/download", async (req, res, next) => {
  try {
    const statement = await loadTenantDetectedStatement(Number(req.params.id), req.session.tenantId!);
    if (!statement) return res.status(404).json({ error: "Not found" });
    if (!statement.providerAttachmentId) {
      return res.status(404).json({ error: "No attachment on this email" });
    }

    const [connection] = await db
      .select()
      .from(emailConnections)
      .where(eq(emailConnections.id, statement.emailConnectionId));
    if (!connection) return res.status(404).json({ error: "Gmail connection no longer exists" });

    const accessToken = await getValidAccessToken(connection);
    const buffer = await getGmailAttachment(
      accessToken,
      statement.providerMessageId,
      statement.providerAttachmentId
    );

    res.setHeader("Content-Type", statement.attachmentMimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.attachmentFilename ?? "statement"}"`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/** Parses a roster attachment (student or employee list) the same way the bulk-upload preview does. */
async function parseRosterAttachment(
  kind: "student_roster" | "employee_roster",
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ students: Awaited<ReturnType<typeof parseStudentSpreadsheet>> } | { employees: Awaited<ReturnType<typeof parseEmployeeSpreadsheet>> }> {
  const fileKind = classifyRosterFile(filename, mimeType);
  const isSpreadsheet = fileKind === "spreadsheet-csv" || fileKind === "spreadsheet-xlsx";

  if (kind === "student_roster") {
    if (isSpreadsheet) {
      return { students: await parseStudentSpreadsheet(buffer, fileKind === "spreadsheet-csv") };
    }
    if (!isClaudeConfigured()) throw new UnsupportedRosterFileError("AI document scanning is not configured on this server");
    if (fileKind === "docx") return { students: await extractStudentsFromText(await extractDocxText(buffer)) };
    return { students: await extractStudentsFromDocument(buffer, mimeType) };
  }

  if (isSpreadsheet) {
    return { employees: await parseEmployeeSpreadsheet(buffer, fileKind === "spreadsheet-csv") };
  }
  if (!isClaudeConfigured()) throw new UnsupportedRosterFileError("AI document scanning is not configured on this server");
  if (fileKind === "docx") return { employees: await extractEmployeesFromText(await extractDocxText(buffer)) };
  return { employees: await extractEmployeesFromDocument(buffer, mimeType) };
}

/** Imports a parsed roster attachment directly (the admin's "Approve" click is the confirmation), returning a summary string. */
async function importRosterAttachment(
  statement: typeof detectedStatements.$inferSelect,
  buffer: Buffer,
  tenantId: number,
  institutionId: number | undefined
): Promise<string> {
  const kind = statement.documentKind as "student_roster" | "employee_roster";
  if (kind === "student_roster" && !institutionId) {
    throw new Error("institutionId is required to import a student roster");
  }

  const parsed = await parseRosterAttachment(
    kind,
    buffer,
    statement.attachmentFilename ?? "attachment",
    statement.attachmentMimeType ?? "application/octet-stream"
  );

  let created = 0;
  let updated = 0;

  if ("students" in parsed) {
    for (const row of parsed.students) {
      const [existing] = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.institutionId, institutionId!), eq(students.studentNumber, row.studentNumber)));
      if (existing) {
        await db
          .update(students)
          .set({ name: row.name, surname: row.surname, residence: row.residence, campus: row.campus })
          .where(eq(students.id, existing.id));
        updated++;
      } else {
        await db.insert(students).values({ institutionId: institutionId!, ...row });
        created++;
      }
    }
    return `Imported ${created} new student(s), updated ${updated} existing (from email attachment).`;
  }

  for (const row of parsed.employees) {
    const [existing] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.idNumber, row.idNumber)));
    if (existing) {
      await db
        .update(employees)
        .set({
          name: row.name,
          jobTitle: row.jobTitle ?? null,
          ...(row.monthlySalary !== undefined ? { monthlySalary: row.monthlySalary.toString() } : {}),
        })
        .where(eq(employees.id, existing.id));
      updated++;
    } else {
      if (row.monthlySalary === undefined) continue; // required for a new employee
      await db.insert(employees).values({
        tenantId,
        name: row.name,
        idNumber: row.idNumber,
        jobTitle: row.jobTitle ?? null,
        monthlySalary: row.monthlySalary.toString(),
      });
      created++;
    }
  }
  return `Imported ${created} new employee(s), updated ${updated} existing (from email attachment).`;
}

const approveSchema = z.object({
  institutionId: z.number().int().positive().optional(),
});

emailIntegrationsRouter.post("/detected/:id/approve", async (req, res, next) => {
  try {
    const rawInstitutionId = req.body.institutionId;
    const parsed = approveSchema.safeParse({
      institutionId:
        rawInstitutionId === undefined || rawInstitutionId === null || rawInstitutionId === ""
          ? undefined
          : Number(rawInstitutionId),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "institutionId is invalid" });
    }
    const statement = await loadTenantDetectedStatement(Number(req.params.id), req.session.tenantId!);
    if (!statement) return res.status(404).json({ error: "Not found" });
    if (statement.status !== "pending") {
      return res.status(409).json({ error: `Already ${statement.status}` });
    }

    const needsInstitution = statement.documentKind === "statement" || statement.documentKind === "student_roster";
    if (needsInstitution && !parsed.data.institutionId) {
      return res.status(400).json({ error: "institutionId is required for this document type" });
    }
    if (parsed.data.institutionId) {
      await assertInstitutionAccessible(parsed.data.institutionId, {
        tenantId: req.session.tenantId!,
        userId: req.session.userId!,
        role: req.session.role!,
      });
    }

    let importedInvoiceId: number | null = null;
    let preview: string;

    if (statement.documentKind === "unknown") {
      // No import pipeline to try — skip the Gmail round-trip entirely, this is
      // just an acknowledgement so the email drops out of the pending queue.
      preview =
        "Unrecognized document type — download it and import manually from the Students, Payroll, or accounting pages.";
    } else {
      const [connection] = await db
        .select()
        .from(emailConnections)
        .where(eq(emailConnections.id, statement.emailConnectionId));
      if (!connection) return res.status(404).json({ error: "Gmail connection no longer exists" });

      const accessToken = await getValidAccessToken(connection);
      const buffer = await getGmailAttachment(
        accessToken,
        statement.providerMessageId,
        statement.providerAttachmentId!
      );

      if (statement.documentKind === "student_roster" || statement.documentKind === "employee_roster") {
        try {
          preview = await importRosterAttachment(
            statement,
            buffer,
            req.session.tenantId!,
            parsed.data.institutionId
          );
        } catch (err) {
          if (err instanceof UnsupportedRosterFileError) {
            preview = `Could not parse this attachment: ${err.message}. Download the original and import it manually.`;
          } else {
            throw err;
          }
        }
      } else {
        const isCsv = statement.attachmentFilename?.toLowerCase().endsWith(".csv");
        const invoiceDate = (statement.receivedAt ?? new Date()).toISOString().slice(0, 10);

        if (isCsv) {
          try {
            const csvParsed = parseInvoiceCsv(buffer.toString("utf-8"));
            importedInvoiceId = await importParsedCsvInvoice(parsed.data.institutionId!, csvParsed);
            preview = `Imported as invoice ${csvParsed.header.invoiceNumber} (CSV attachment, parsed the same way as a manual upload).`;
          } catch (err) {
            if (err instanceof CsvParseError) {
              preview = `Could not parse the CSV attachment: ${err.message}. Download the original and upload it manually.`;
            } else {
              throw err;
            }
          }
        } else {
          const text = await extractPdfText(buffer);
          const pdfParsed = parseStatementText(text);
          preview = summarizeForPreview(pdfParsed);

          if (pdfParsed.confidence !== "unparsed") {
            const invoiceNumber = `EMAIL-${statement.id}`;
            const lines =
              pdfParsed.lines.length > 0
                ? pdfParsed.lines
                : [{ reference: null, description: "Statement total (see original attachment)", amount: pdfParsed.totalAmount! }];
            const totalAmount = pdfParsed.totalAmount ?? lines.reduce((s, l) => s + l.amount, 0);
            importedInvoiceId = await importParsedPdfStatement({
              institutionId: parsed.data.institutionId!,
              invoiceNumber,
              invoiceDate,
              dueDate: invoiceDate,
              lines,
              totalAmount,
            });
          }
        }
      }
    }

    await db
      .update(detectedStatements)
      .set({
        status: "approved",
        parsedPreview: preview,
        importedInvoiceId,
        reviewedByUserId: req.session.userId!,
        reviewedAt: new Date(),
      })
      .where(eq(detectedStatements.id, statement.id));

    const [invoice] = importedInvoiceId
      ? await db.select().from(invoices).where(eq(invoices.id, importedInvoiceId))
      : [null];

    res.json({ preview, invoice });
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

emailIntegrationsRouter.post("/detected/:id/reject", async (req, res) => {
  const statement = await loadTenantDetectedStatement(Number(req.params.id), req.session.tenantId!);
  if (!statement) return res.status(404).json({ error: "Not found" });
  if (statement.status !== "pending") {
    return res.status(409).json({ error: `Already ${statement.status}` });
  }

  await db
    .update(detectedStatements)
    .set({ status: "rejected", reviewedByUserId: req.session.userId!, reviewedAt: new Date() })
    .where(eq(detectedStatements.id, statement.id));
  res.json({ ok: true });
});

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  bodyText: z.string().min(1).max(5000),
});

/**
 * Sends a document (e.g. an outstanding-balance report or payslip PDF) from
 * the tenant's connected Gmail account, with an optional single attachment.
 * Every send is logged to sentEmails for an audit trail.
 */
emailIntegrationsRouter.post("/send", outboundUpload.single("attachment"), async (req, res, next) => {
  try {
    const parsed = sendSchema.safeParse({
      to: req.body.to,
      subject: req.body.subject,
      bodyText: req.body.bodyText,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const [connection] = await db
      .select()
      .from(emailConnections)
      .where(
        and(eq(emailConnections.tenantId, req.session.tenantId!), eq(emailConnections.provider, "gmail"))
      );
    if (!connection) return res.status(404).json({ error: "Gmail is not connected" });

    const accessToken = await getValidAccessToken(connection);
    let sent: { id: string };
    try {
      sent = await sendGmailMessage(accessToken, {
        to: parsed.data.to,
        subject: parsed.data.subject,
        bodyText: parsed.data.bodyText,
        attachment: req.file
          ? { filename: req.file.originalname, mimeType: req.file.mimetype, content: req.file.buffer }
          : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("403") || message.toLowerCase().includes("insufficient")) {
        return res.status(400).json({
          error:
            "Gmail hasn't granted sending permission for this connection yet — disconnect and reconnect Gmail to allow sending.",
        });
      }
      throw err;
    }

    await db.insert(sentEmails).values({
      tenantId: req.session.tenantId!,
      emailConnectionId: connection.id,
      sentByUserId: req.session.userId!,
      toAddress: parsed.data.to,
      subject: parsed.data.subject,
      attachmentFilename: req.file?.originalname ?? null,
      providerMessageId: sent.id,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

emailIntegrationsRouter.get("/sent", async (req, res) => {
  const rows = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.tenantId, req.session.tenantId!))
    .orderBy(desc(sentEmails.createdAt));
  res.json(rows);
});
