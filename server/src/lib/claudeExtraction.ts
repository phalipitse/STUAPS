import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

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

async function runExtraction(content: MessageParam["content"]): Promise<ExtractedExpense> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 500,
    tools: [RECORD_EXPENSE_TOOL],
    tool_choice: { type: "tool", name: "record_expense" },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find((block): block is ToolUseBlock => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return structured expense data");
  }
  return toolUse.input as ExtractedExpense;
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** Extracts expense fields from a photographed/scanned source document (receipt, invoice, statement). */
export async function extractExpenseFromDocument(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedExpense> {
  const today = new Date().toISOString().slice(0, 10);
  const isPdf = mimeType === "application/pdf";

  if (!isPdf && !SUPPORTED_IMAGE_TYPES.includes(mimeType as SupportedImageType)) {
    throw new Error("Unsupported file type — use a JPEG/PNG/GIF/WEBP image or a PDF");
  }

  const documentBlock: MessageParam["content"][number] = isPdf
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

  return runExtraction([
    documentBlock,
    {
      type: "text",
      text: `Today's date is ${today}. This is a source document (receipt, invoice, or statement) for a business expense. Extract the expense details using the record_expense tool.`,
    },
  ]);
}

/** Extracts expense fields from a spoken (transcribed) description of a document or expense. */
export async function extractExpenseFromText(text: string): Promise<ExtractedExpense> {
  const today = new Date().toISOString().slice(0, 10);
  return runExtraction([
    {
      type: "text",
      text: `Today's date is ${today}. A user spoke the following description of a business expense: "${text}". Extract the expense details using the record_expense tool.`,
    },
  ]);
}
