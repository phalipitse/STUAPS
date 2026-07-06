import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailConnections, detectedStatements, invoices } from "../db/schema.js";
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
} from "../lib/googleOAuth.js";
import { parseInvoiceCsv, CsvParseError } from "../lib/csvParser.js";
import { extractPdfText, parseStatementText, summarizeForPreview } from "../lib/pdfStatementParser.js";
import { importParsedCsvInvoice, importParsedPdfStatement } from "../lib/invoiceImport.js";

export const emailIntegrationsRouter = Router();
emailIntegrationsRouter.use(requireAuth, requireRole("admin"), requireActiveSubscription);

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

    res.setHeader(
      "Content-Type",
      statement.attachmentFilename?.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "text/csv"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${statement.attachmentFilename ?? "statement"}"`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

const approveSchema = z.object({
  institutionId: z.number().int().positive(),
});

emailIntegrationsRouter.post("/detected/:id/approve", async (req, res, next) => {
  try {
    const parsed = approveSchema.safeParse({ institutionId: Number(req.body.institutionId) });
    if (!parsed.success) {
      return res.status(400).json({ error: "institutionId is required" });
    }
    const statement = await loadTenantDetectedStatement(Number(req.params.id), req.session.tenantId!);
    if (!statement) return res.status(404).json({ error: "Not found" });
    if (statement.status !== "pending") {
      return res.status(409).json({ error: `Already ${statement.status}` });
    }

    await assertInstitutionAccessible(parsed.data.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

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

    const isCsv = statement.attachmentFilename?.toLowerCase().endsWith(".csv");
    const invoiceDate = (statement.receivedAt ?? new Date()).toISOString().slice(0, 10);
    let importedInvoiceId: number | null = null;
    let preview: string;

    if (isCsv) {
      try {
        const csvParsed = parseInvoiceCsv(buffer.toString("utf-8"));
        importedInvoiceId = await importParsedCsvInvoice(parsed.data.institutionId, csvParsed);
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
          institutionId: parsed.data.institutionId,
          invoiceNumber,
          invoiceDate,
          dueDate: invoiceDate,
          lines,
          totalAmount,
        });
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
