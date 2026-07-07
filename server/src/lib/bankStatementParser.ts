// Bank statement CSV parser — unlike the invoice CSV (one fixed export format),
// every bank exports transaction history differently, so this detects columns
// by common header names instead of assuming an exact layout.

export interface ParsedBankTransaction {
  date: string; // ISO yyyy-mm-dd, or the raw string if it couldn't be parsed
  description: string;
  amount: number; // negative = money out (debit), positive = money in (credit)
  dateParsed: boolean;
}

export class BankStatementParseError extends Error {}

const DATE_HEADERS = ["date", "transaction date", "posting date", "value date"];
const DESCRIPTION_HEADERS = ["description", "narration", "details", "transaction description", "particulars"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "debit amount"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "credit amount"];

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
      // ignore
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function findColumn(header: string[], candidates: string[]): number {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Best-effort date parsing across the handful of formats SA bank exports commonly use. */
function parseTransactionDate(raw: string): { iso: string; parsed: boolean } {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { iso: trimmed, parsed: true };

  // DD/MM/YYYY or DD-MM-YYYY — the common SA convention (ambiguous with US MM/DD, resolved as DD/MM).
  const slashOrDash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashOrDash) {
    const [, d, m, y] = slashOrDash;
    return { iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, parsed: true };
  }

  // "01 Jul 2026" or "Jul 01 2026"
  const withMonthName = trimmed.match(/^(\d{1,2})\s+(\w{3})\w*\s+(\d{4})$/);
  if (withMonthName) {
    const [, d, monRaw, y] = withMonthName;
    const mon = MONTHS[monRaw.toLowerCase()];
    if (mon) return { iso: `${y}-${mon}-${d.padStart(2, "0")}`, parsed: true };
  }
  const monthNameFirst = trimmed.match(/^(\w{3})\w*\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthNameFirst) {
    const [, monRaw, d, y] = monthNameFirst;
    const mon = MONTHS[monRaw.toLowerCase()];
    if (mon) return { iso: `${y}-${mon}-${d.padStart(2, "0")}`, parsed: true };
  }

  return { iso: trimmed, parsed: false };
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[R\s,]/g, "").replace(/^\((.+)\)$/, "-$1");
  return Number(cleaned);
}

export function parseBankStatementCsv(csvContent: string): ParsedBankTransaction[] {
  const rows = parseCsvRows(csvContent.trim());
  if (rows.length < 2) {
    throw new BankStatementParseError("CSV has no data rows");
  }

  const header = rows[0];
  const dateCol = findColumn(header, DATE_HEADERS);
  const descCol = findColumn(header, DESCRIPTION_HEADERS);
  const amountCol = findColumn(header, AMOUNT_HEADERS);
  const debitCol = findColumn(header, DEBIT_HEADERS);
  const creditCol = findColumn(header, CREDIT_HEADERS);

  if (dateCol === -1) throw new BankStatementParseError("Could not find a date column");
  if (descCol === -1) throw new BankStatementParseError("Could not find a description column");
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    throw new BankStatementParseError("Could not find an amount, debit, or credit column");
  }

  const transactions: ParsedBankTransaction[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => cell.trim() === "")) continue;

    const description = row[descCol]?.trim() ?? "";
    let amount: number;
    if (amountCol !== -1 && row[amountCol]?.trim()) {
      amount = toNumber(row[amountCol]);
    } else {
      const debit = debitCol !== -1 && row[debitCol]?.trim() ? Math.abs(toNumber(row[debitCol])) : 0;
      const credit = creditCol !== -1 && row[creditCol]?.trim() ? Math.abs(toNumber(row[creditCol])) : 0;
      amount = credit - debit;
    }
    if (Number.isNaN(amount)) continue;

    const { iso, parsed } = parseTransactionDate(row[dateCol] ?? "");
    transactions.push({ date: iso, description, amount, dateParsed: parsed });
  }

  return transactions;
}
