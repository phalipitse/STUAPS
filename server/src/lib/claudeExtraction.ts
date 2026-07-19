import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

/** Lazily constructs the Claude client so the app boots (and every non-AI route works) without ANTHROPIC_API_KEY configured. */
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface ExtractedExpense {
  date: string;
  category: string;
  description: string;
  amount: number;
  confidence: "high" | "medium" | "low";
}

const RECORD_EXPENSE_TOOL: Tool = {
  name: "record_expense",
  description: "Structured expense data extracted from a source document or a spoken description.",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Best-guess ISO date (YYYY-MM-DD) this expense relates to.",
      },
      category: {
        type: "string",
        description:
          "Short expense category, e.g. Rent, Salaries, Utilities, Fuel, Maintenance, Insurance, Supplies.",
      },
      description: {
        type: "string",
        description: "Brief human-readable description of what the money was used for.",
      },
      amount: {
        type: "number",
        description: "The Rand amount, numeric only, no currency symbol or thousands separators.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "How confident this extraction is, given how legible/explicit the source was.",
      },
    },
    required: ["date", "category", "description", "amount", "confidence"],
  },
};

async function runExtraction<T>(content: ContentBlockParam[], tool: Tool): Promise<T> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find((block): block is ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return structured data");
  }
  return toolUse.input as T;
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function buildDocumentBlock(buffer: Buffer, mimeType: string): ContentBlockParam {
  const isPdf = mimeType === "application/pdf";
  if (!isPdf && !SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType)) {
    throw new Error("Unsupported file type — use a JPEG/PNG/GIF/WEBP image or a PDF");
  }
  return isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType as SupportedImageType,
          data: buffer.toString("base64"),
        },
      };
}

/** Extracts expense fields from a photographed/scanned source document (receipt, invoice, statement). */
export async function extractExpenseFromDocument(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedExpense> {
  const today = new Date().toISOString().slice(0, 10);
  const documentBlock = buildDocumentBlock(buffer, mimeType);

  return runExtraction<ExtractedExpense>(
    [
      documentBlock,
      {
        type: "text",
        text: `Today's date is ${today}. This is a source document (receipt, invoice, or statement) for a business expense. Extract the expense details using the record_expense tool.`,
      },
    ],
    RECORD_EXPENSE_TOOL
  );
}

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number;
}

const RECORD_TRANSACTIONS_TOOL: Tool = {
  name: "record_transactions",
  description: "A list of bank transactions extracted from a scanned/photographed bank statement.",
  input_schema: {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        description: "Every transaction line visible on the statement, in the order they appear.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "ISO date (YYYY-MM-DD) for this transaction." },
            description: { type: "string", description: "The transaction description/narration as printed." },
            amount: {
              type: "number",
              description:
                "Signed Rand amount: negative for money out (debits/withdrawals/payments), positive for money in (credits/deposits).",
            },
          },
          required: ["date", "description", "amount"],
        },
      },
    },
    required: ["transactions"],
  },
};

/**
 * Extracts a list of transactions from a photographed/scanned bank statement page.
 * Best-effort — layouts vary by bank, and long statements may need to be split
 * into multiple page-by-page uploads for reliable extraction.
 */
export async function extractTransactionsFromBankStatement(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedTransaction[]> {
  const documentBlock = buildDocumentBlock(buffer, mimeType);

  const result = await runExtraction<{ transactions: ExtractedTransaction[] }>(
    [
      documentBlock,
      {
        type: "text",
        text: "This is a page from a bank statement. Extract every transaction line using the record_transactions tool — do not summarize or skip rows.",
      },
    ],
    RECORD_TRANSACTIONS_TOOL
  );
  return result.transactions;
}

/** Extracts expense fields from a spoken (transcribed) description of a document or expense. */
export async function extractExpenseFromText(text: string): Promise<ExtractedExpense> {
  const today = new Date().toISOString().slice(0, 10);
  return runExtraction<ExtractedExpense>(
    [
      {
        type: "text",
        text: `Today's date is ${today}. A user spoke the following description of a business expense: "${text}". Extract the expense details using the record_expense tool.`,
      },
    ],
    RECORD_EXPENSE_TOOL
  );
}

export interface ExtractedStudent {
  studentNumber: string;
  name: string;
  surname: string;
  residence?: string;
  campus?: string;
}

const RECORD_STUDENTS_TOOL: Tool = {
  name: "record_students",
  description: "A list of students extracted from a roster document (PDF, scanned page, or free-text list).",
  input_schema: {
    type: "object",
    properties: {
      students: {
        type: "array",
        description: "Every student row found, in the order they appear. Skip rows that are clearly not students (headers, totals, blank rows).",
        items: {
          type: "object",
          properties: {
            studentNumber: { type: "string", description: "The student's student/ID number, as printed." },
            name: { type: "string", description: "First name(s)." },
            surname: { type: "string", description: "Surname/last name." },
            residence: { type: "string", description: "Residence or building name, if shown." },
            campus: { type: "string", description: "Campus name, if shown." },
          },
          required: ["studentNumber", "name", "surname"],
        },
      },
    },
    required: ["students"],
  },
};

/** Extracts a student roster from a photographed/scanned document (PDF page or image). */
export async function extractStudentsFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedStudent[]> {
  const documentBlock = buildDocumentBlock(buffer, mimeType);
  const result = await runExtraction<{ students: ExtractedStudent[] }>(
    [
      documentBlock,
      {
        type: "text",
        text: "This is a page from a student roster/list. Extract every student row using the record_students tool — do not summarize or skip rows.",
      },
    ],
    RECORD_STUDENTS_TOOL
  );
  return result.students;
}

/** Extracts a student roster from free-form text (e.g. text extracted from a Word document). */
export async function extractStudentsFromText(text: string): Promise<ExtractedStudent[]> {
  const result = await runExtraction<{ students: ExtractedStudent[] }>(
    [
      {
        type: "text",
        text: `The following text was extracted from a student roster document. Extract every student row using the record_students tool — do not summarize or skip rows.\n\n---\n${text}`,
      },
    ],
    RECORD_STUDENTS_TOOL
  );
  return result.students;
}

export interface ExtractedEmployee {
  name: string;
  idNumber: string;
  jobTitle?: string;
  monthlySalary?: number;
}

const RECORD_EMPLOYEES_TOOL: Tool = {
  name: "record_employees",
  description: "A list of employees extracted from a staff/payroll document.",
  input_schema: {
    type: "object",
    properties: {
      employees: {
        type: "array",
        description: "Every employee row found, in the order they appear. Skip rows that are clearly not employees (headers, totals, blank rows).",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Full name." },
            idNumber: { type: "string", description: "The employee's ID number, as printed." },
            jobTitle: { type: "string", description: "Job title, if shown." },
            monthlySalary: {
              type: "number",
              description: "Monthly salary in Rand, numeric only, if shown.",
            },
          },
          required: ["name", "idNumber"],
        },
      },
    },
    required: ["employees"],
  },
};

/** Extracts an employee list from a photographed/scanned document (PDF page or image). */
export async function extractEmployeesFromDocument(buffer: Buffer, mimeType: string): Promise<ExtractedEmployee[]> {
  const documentBlock = buildDocumentBlock(buffer, mimeType);
  const result = await runExtraction<{ employees: ExtractedEmployee[] }>(
    [
      documentBlock,
      {
        type: "text",
        text: "This is a page from a staff/employee list. Extract every employee row using the record_employees tool — do not summarize or skip rows.",
      },
    ],
    RECORD_EMPLOYEES_TOOL
  );
  return result.employees;
}

/** Extracts an employee list from free-form text (e.g. text extracted from a Word document). */
export async function extractEmployeesFromText(text: string): Promise<ExtractedEmployee[]> {
  const result = await runExtraction<{ employees: ExtractedEmployee[] }>(
    [
      {
        type: "text",
        text: `The following text was extracted from a staff/employee list document. Extract every employee row using the record_employees tool — do not summarize or skip rows.\n\n---\n${text}`,
      },
    ],
    RECORD_EMPLOYEES_TOOL
  );
  return result.employees;
}
