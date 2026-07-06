// Parses the Xero-style invoice CSV export used by the accommodation providers.
// Each row is either a per-student charge ("STUD # <number>: <name> - <residence>")
// or a fee/deduction line (anything else, e.g. processing/management fees).

const STUDENT_LINE_PATTERN = /^STUD # (\d+): (.+?) - (.+)$/;

export interface ParsedInvoiceHeader {
  invoiceNumber: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  dueDate: string; // ISO yyyy-mm-dd
  total: number;
  accountNo?: string;
}

export interface ParsedStudentLine {
  kind: "student";
  studentNumber: string;
  name: string;
  surname: string;
  residence: string;
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
}

export interface ParsedFeeLine {
  kind: "fee";
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
}

export type ParsedLine = ParsedStudentLine | ParsedFeeLine;

export interface ParsedInvoice {
  header: ParsedInvoiceHeader;
  lines: ParsedLine[];
  computedTotal: number;
  totalMatchesStatedTotal: boolean;
}

export class CsvParseError extends Error {}

const REQUIRED_COLUMNS = [
  "InvoiceNumber",
  "InvoiceDate",
  "DueDate",
  "Total",
  "Description",
  "Quantity",
  "UnitAmount",
] as const;

/** Minimal RFC4180 CSV line splitter — handles quoted fields with embedded commas. */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // ignore, \n handles line end
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  // final field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses "01 Jul 2026" style dates into ISO yyyy-mm-dd. */
function parseInvoiceDate(raw: string): string {
  const months: Record<string, string> = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12",
  };
  const match = raw.trim().match(/^(\d{1,2}) (\w{3}) (\d{4})$/);
  if (!match) {
    throw new CsvParseError(`Unrecognized date format: "${raw}"`);
  }
  const [, day, mon, year] = match;
  const month = months[mon];
  if (!month) {
    throw new CsvParseError(`Unrecognized month in date: "${raw}"`);
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseInvoiceCsv(csvContent: string): ParsedInvoice {
  const rows = parseCsvRows(csvContent.trim());
  if (rows.length < 2) {
    throw new CsvParseError("CSV has no data rows");
  }

  const header = rows[0];
  const colIndex = (name: string) => {
    const idx = header.indexOf(name);
    if (idx === -1) {
      throw new CsvParseError(`Missing required column: ${name}`);
    }
    return idx;
  };
  for (const col of REQUIRED_COLUMNS) colIndex(col);

  const idx = {
    invoiceNumber: colIndex("InvoiceNumber"),
    invoiceDate: colIndex("InvoiceDate"),
    dueDate: colIndex("DueDate"),
    total: colIndex("Total"),
    description: colIndex("Description"),
    quantity: colIndex("Quantity"),
    unitAmount: colIndex("UnitAmount"),
  };

  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));
  if (dataRows.length === 0) {
    throw new CsvParseError("CSV has no data rows");
  }

  const lines: ParsedLine[] = [];
  let computedTotal = 0;

  for (const row of dataRows) {
    const description = row[idx.description]?.trim() ?? "";
    const quantity = Number(row[idx.quantity]);
    const unitAmount = Number(row[idx.unitAmount]);
    if (Number.isNaN(quantity) || Number.isNaN(unitAmount)) {
      throw new CsvParseError(`Invalid quantity/unit amount on row: ${description}`);
    }
    const lineTotal = round2(quantity * unitAmount);
    computedTotal = round2(computedTotal + lineTotal);

    const match = description.match(STUDENT_LINE_PATTERN);
    if (match) {
      const [, studentNumber, fullName, residence] = match;
      const nameParts = fullName.trim().split(/\s+/);
      // Convention observed in source data: last token is the given name(s) prefix
      // is not reliable, so keep the full string as `name` and best-effort split.
      const surname = nameParts[0];
      const name = nameParts.slice(1).join(" ") || nameParts[0];
      lines.push({
        kind: "student",
        studentNumber,
        name,
        surname,
        residence: residence.trim(),
        description,
        quantity,
        unitAmount,
        lineTotal,
      });
    } else {
      lines.push({
        kind: "fee",
        description,
        quantity,
        unitAmount,
        lineTotal,
      });
    }
  }

  const statedTotal = Number(dataRows[0][idx.total]);
  const header0: ParsedInvoiceHeader = {
    invoiceNumber: dataRows[0][idx.invoiceNumber].trim(),
    invoiceDate: parseInvoiceDate(dataRows[0][idx.invoiceDate]),
    dueDate: parseInvoiceDate(dataRows[0][idx.dueDate]),
    total: statedTotal,
  };

  return {
    header: header0,
    lines,
    computedTotal,
    totalMatchesStatedTotal: round2(statedTotal) === computedTotal,
  };
}
