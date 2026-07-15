import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db/index.js";
import { authRouter } from "./routes/auth.js";
import { registerRouter } from "./routes/register.js";
import { institutionsRouter } from "./routes/institutions.js";
import { propertiesRouter } from "./routes/properties.js";
import { studentsRouter } from "./routes/students.js";
import { invoicesRouter } from "./routes/invoices.js";
import { reportsRouter } from "./routes/reports.js";
import { adminRouter } from "./routes/admin.js";
import { teamRouter } from "./routes/team.js";
import { billingRouter, paystackWebhookHandler } from "./routes/billing.js";
import { emailIntegrationsRouter } from "./routes/emailIntegrations.js";
import { financialStatementsRouter } from "./routes/financialStatements.js";
import { payrollRouter } from "./routes/payroll.js";
import { waitlistRouter } from "./routes/waitlist.js";

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  // Vercel terminates TLS at the edge and forwards requests to this
  // serverless function over plain HTTP, so without this Express can't tell
  // the original connection was HTTPS. express-session's secure-cookie check
  // relies on that signal — without it, it silently drops the Set-Cookie
  // header on every response in production, which is why login appeared to
  // succeed but every following request came back unauthenticated.
  app.set("trust proxy", 1);

  app.use(
    cors({
      // In production the client and API are served from the same Vercel
      // deployment (same origin), so reflecting the request's own origin is
      // safe and avoids having to hardcode a URL we don't know until after
      // the first deploy. In dev, lock it to the Vite dev server.
      origin: process.env.CLIENT_ORIGIN ?? (process.env.NODE_ENV === "production" ? true : "http://localhost:5173"),
      credentials: true,
    })
  );
  // Paystack needs the exact raw request bytes to verify the webhook signature,
  // so this must be registered before the global JSON body parser below.
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    paystackWebhookHandler
  );

  app.use(express.json());

  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET ?? "dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/session", authRouter);
  app.use("/api/register", registerRouter);
  app.use("/api/waitlist", waitlistRouter);
  app.use("/api/institutions", institutionsRouter);
  app.use("/api/properties", propertiesRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/invoices", invoicesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/team", teamRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/email-integrations", emailIntegrationsRouter);
  app.use("/api/financial-statements", financialStatementsRouter);
  app.use("/api/payroll", payrollRouter);

  // Centralized error handler — keeps ForbiddenError/CsvParseError messages
  // out of routes and off the client's back for anything unexpected.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.publicMessage ?? "Internal server error" });
  });

  return app;
}
