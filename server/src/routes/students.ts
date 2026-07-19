import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { students } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { assertInstitutionAccessible, ForbiddenError } from "../lib/tenantScope.js";
import {
  classifyRosterFile,
  parseStudentSpreadsheet,
  extractDocxText,
  UnsupportedRosterFileError,
  type RosterRow,
} from "../lib/rosterUpload.js";
import { isClaudeConfigured, extractStudentsFromDocument, extractStudentsFromText } from "../lib/claudeExtraction.js";

export const studentsRouter = Router();
studentsRouter.use(requireAuth, requireActiveSubscription);

const rosterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

studentsRouter.get("/", async (req, res, next) => {
  try {
    const institutionId = Number(req.query.institutionId);
    if (!institutionId) {
      return res.status(400).json({ error: "institutionId query param is required" });
    }
    await assertInstitutionAccessible(institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });
    const rows = await db.select().from(students).where(eq(students.institutionId, institutionId));
    res.json(rows);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  residence: z.string().optional(),
  campus: z.string().optional(),
});

studentsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const [existing] = await db
      .select()
      .from(students)
      .where(eq(students.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Student not found" });
    await assertInstitutionAccessible(existing.institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    const [row] = await db
      .update(students)
      .set(parsed.data)
      .where(eq(students.id, existing.id))
      .returning();
    res.json(row);
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});

/**
 * Parses an uploaded roster file (CSV/Excel deterministically, Word/PDF/image
 * via Claude) and returns a preview — nothing is written to the database
 * until the admin reviews and confirms via POST /import.
 */
studentsRouter.post(
  "/upload-preview",
  requireRole("admin"),
  rosterUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "A file is required" });
      }

      let kind;
      try {
        kind = classifyRosterFile(req.file.originalname, req.file.mimetype);
      } catch (err) {
        if (err instanceof UnsupportedRosterFileError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }

      let rows: RosterRow[];
      if (kind === "spreadsheet-csv" || kind === "spreadsheet-xlsx") {
        rows = await parseStudentSpreadsheet(req.file.buffer, kind === "spreadsheet-csv");
      } else {
        if (!isClaudeConfigured()) {
          return res
            .status(400)
            .json({ error: "Scanning Word/PDF/image rosters is not configured on this server yet — use a CSV or Excel file instead" });
        }
        if (kind === "docx") {
          const text = await extractDocxText(req.file.buffer);
          rows = await extractStudentsFromText(text);
        } else {
          rows = await extractStudentsFromDocument(req.file.buffer, req.file.mimetype);
        }
      }

      res.json({ rows });
    } catch (err) {
      next(err);
    }
  }
);

const importSchema = z.object({
  institutionId: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        studentNumber: z.string().min(1),
        name: z.string().min(1),
        surname: z.string().min(1),
        residence: z.string().optional(),
        campus: z.string().optional(),
      })
    )
    .min(1)
    .max(2000),
});

/** Bulk-creates (or updates, if the student number already exists) students from a reviewed roster upload. */
studentsRouter.post("/import", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const { institutionId, rows } = parsed.data;
    await assertInstitutionAccessible(institutionId, {
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      role: req.session.role!,
    });

    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const [existing] = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.institutionId, institutionId), eq(students.studentNumber, row.studentNumber)));

      if (existing) {
        await db
          .update(students)
          .set({ name: row.name, surname: row.surname, residence: row.residence, campus: row.campus })
          .where(eq(students.id, existing.id));
        updated++;
      } else {
        await db.insert(students).values({
          institutionId,
          studentNumber: row.studentNumber,
          name: row.name,
          surname: row.surname,
          residence: row.residence,
          campus: row.campus,
        });
        created++;
      }
    }

    res.status(201).json({ created, updated });
  } catch (err) {
    if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
    next(err);
  }
});
