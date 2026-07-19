import { Readable } from "stream";
import ExcelJS from "exceljs";
import mammoth from "mammoth";

/** Normalizes a header cell for loose matching: lowercase, strip spaces/punctuation. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Reads the first worksheet of an .xlsx/.xls file, or a .csv file, into an
 * array of row objects keyed by normalized header name. Row 1 is always
 * treated as the header row.
 */
async function readSpreadsheetRows(buffer: Buffer, isCsv: boolean): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  let worksheet: ExcelJS.Worksheet;
  if (isCsv) {
    worksheet = await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const first = workbook.worksheets[0];
    if (!first) return [];
    worksheet = first;
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cell.value);
  });

  const rows: Record<string, string>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;
    const record: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cell.text?.trim() ?? "";
      if (value) hasValue = true;
      record[header] = value;
    });
    if (hasValue) rows.push(record);
  }
  return rows;
}

/** Finds the first matching normalized-header value in a row for a set of accepted aliases. */
function pickColumn(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    if (row[alias]) return row[alias];
  }
  return undefined;
}

export interface RosterRow {
  studentNumber: string;
  name: string;
  surname: string;
  residence?: string;
  campus?: string;
}

const STUDENT_NUMBER_ALIASES = ["studentnumber", "studentno", "studno", "number", "id", "studentid"];
const NAME_ALIASES = ["name", "firstname", "first"];
const SURNAME_ALIASES = ["surname", "lastname", "last"];
const RESIDENCE_ALIASES = ["residence", "building", "res"];
const CAMPUS_ALIASES = ["campus"];

/** Deterministically parses a student roster from an .xlsx/.xls/.csv file — no AI involved. */
export async function parseStudentSpreadsheet(buffer: Buffer, isCsv: boolean): Promise<RosterRow[]> {
  const rows = await readSpreadsheetRows(buffer, isCsv);
  const result: RosterRow[] = [];
  for (const row of rows) {
    const studentNumber = pickColumn(row, STUDENT_NUMBER_ALIASES);
    const name = pickColumn(row, NAME_ALIASES);
    const surname = pickColumn(row, SURNAME_ALIASES);
    if (!studentNumber || !name || !surname) continue;
    result.push({
      studentNumber,
      name,
      surname,
      residence: pickColumn(row, RESIDENCE_ALIASES),
      campus: pickColumn(row, CAMPUS_ALIASES),
    });
  }
  return result;
}

export interface EmployeeRow {
  name: string;
  idNumber: string;
  jobTitle?: string;
  monthlySalary?: number;
}

const EMP_NAME_ALIASES = ["name", "fullname", "employeename"];
const ID_NUMBER_ALIASES = ["idnumber", "id", "identitynumber"];
const JOB_TITLE_ALIASES = ["jobtitle", "title", "position", "role"];
const SALARY_ALIASES = ["monthlysalary", "salary", "grosssalary"];

/** Deterministically parses an employee list from an .xlsx/.xls/.csv file — no AI involved. */
export async function parseEmployeeSpreadsheet(buffer: Buffer, isCsv: boolean): Promise<EmployeeRow[]> {
  const rows = await readSpreadsheetRows(buffer, isCsv);
  const result: EmployeeRow[] = [];
  for (const row of rows) {
    const name = pickColumn(row, EMP_NAME_ALIASES);
    const idNumber = pickColumn(row, ID_NUMBER_ALIASES);
    if (!name || !idNumber) continue;
    const salaryRaw = pickColumn(row, SALARY_ALIASES);
    const monthlySalary = salaryRaw ? Number(salaryRaw.replace(/[^0-9.]/g, "")) : undefined;
    result.push({
      name,
      idNumber,
      jobTitle: pickColumn(row, JOB_TITLE_ALIASES),
      monthlySalary: monthlySalary && !Number.isNaN(monthlySalary) ? monthlySalary : undefined,
    });
  }
  return result;
}

/** Extracts plain text from a .docx file, for further (AI-assisted) parsing. */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export type RosterFileKind = "spreadsheet-csv" | "spreadsheet-xlsx" | "docx" | "pdf-or-image";

export class UnsupportedRosterFileError extends Error {}

/** Classifies an uploaded roster/employee-list file by extension + mimetype. */
export function classifyRosterFile(filename: string, mimetype: string): RosterFileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || mimetype === "text/csv") return "spreadsheet-csv";
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel"
  ) {
    return "spreadsheet-xlsx";
  }
  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (ext === "pdf" || mimetype === "application/pdf" || mimetype.startsWith("image/")) {
    return "pdf-or-image";
  }
  throw new UnsupportedRosterFileError(
    "Unsupported file type — use a CSV, Excel (.xlsx), Word (.docx), PDF, or image file."
  );
}
