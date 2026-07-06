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

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
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

  app.use("/api/auth", authRouter);
  app.use("/api/register", registerRouter);
  app.use("/api/institutions", institutionsRouter);
  app.use("/api/properties", propertiesRouter);
  app.use("/api/students", studentsRouter);
  app.use("/api/invoices", invoicesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/team", teamRouter);

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
