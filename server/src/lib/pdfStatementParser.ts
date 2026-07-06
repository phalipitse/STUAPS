// Best-effort extraction for funder (NSFAS etc.) statement PDFs. Layouts vary by
// funder and change over time without notice, so this is a heuristic, not a
// guaranteed-correct parser — every result is surfaced to an admin for review
// before anything is imported into the recon engine.

const AMOUNT_PATTERN = /R?\s?(-?\d+(?:[ ,]\d{3})*\.\d{2})/;
const REFERENCE_PATTERN = /\b(\d{6,12})\b/;
const TOTAL_LINE_PATTERN =
  /(grand\s+total|total\s+(due|amount|payable)?|balance\s+due)\s*[:\-]?\s*R?\s?([\d ,]+\.\d{2})/i;

export interface ParsedStatementLine {
  reference: string | null;
  description: string;
  amount: number;
}

export interface ParsedStatement {
  lines: ParsedStatementLine[];
  totalAmount: number | null;
  confidence: "structured" | "total-only" | "unparsed";
}

function toNumber(raw: string): number {
  return Number(raw.replace(/[ ,]/g, ""));
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export function parseStatementText(rawText: string): ParsedStatement {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lineItems: ParsedStatementLine[] = [];
  let totalAmount: number | null = null;

  for (const line of lines) {
    const totalMatch = line.match(TOTAL_LINE_PATTERN);
    if (totalMatch) {
      if (totalAmount === null) totalAmount = toNumber(totalMatch[3]);
      continue; // don't also count the total line as a charge line
    }

    const amountMatch = line.match(AMOUNT_PATTERN);
    if (!amountMatch) continue;
    const amount = toNumber(amountMatch[1]);
    if (Number.isNaN(amount) || amount === 0) continue;

    const refMatch = line.match(REFERENCE_PATTERN);
    const description = line
      .replace(amountMatch[0], "")
      .replace(refMatch?.[0] ?? "", "")
      .replace(/\s+/g, " ")
      .trim();
    if (!description) continue;

    lineItems.push({ reference: refMatch ? refMatch[1] : null, description, amount });
  }

  const confidence: ParsedStatement["confidence"] =
    lineItems.length > 0 ? "structured" : totalAmount !== null ? "total-only" : "unparsed";

  return { lines: lineItems, totalAmount, confidence };
}

export function summarizeForPreview(statement: ParsedStatement): string {
  if (statement.confidence === "unparsed") {
    return "Could not extract line items or a total from this attachment — download the original and enter it manually.";
  }
  if (statement.confidence === "total-only") {
    return `Found a total of R${statement.totalAmount?.toFixed(2)} but no itemised lines — imported as a single charge. Review the original attachment for the breakdown.`;
  }
  return `Extracted ${statement.lines.length} line item(s)${
    statement.totalAmount !== null ? `, total R${statement.totalAmount.toFixed(2)}` : ""
  }. Review before relying on this for reconciliation.`;
}
