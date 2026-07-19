const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getClientConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not configured");
  }
  return { clientId, clientSecret };
}

export function isGmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = getClientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getClientConfig();
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getClientConfig();
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Google userinfo (${res.status})`);
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("Google userinfo response had no email");
  return data.email;
}

export interface GmailMessageSummary {
  id: string;
  sender: string;
  subject: string;
  receivedAt: Date | null;
  attachment: { filename: string; attachmentId: string; mimeType: string } | null;
}

/** Searches the connected mailbox for messages matching a Gmail search query. */
export async function searchGmailMessages(
  accessToken: string,
  query: string
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, maxResults: "25" });
  const res = await fetch(`${GMAIL_API_BASE}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail search failed (${res.status})`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

// Statement PDFs/CSVs, plus the file types the roster-upload pipeline can
// already parse (spreadsheets, Word docs, images) — broadened from PDF/CSV
// only so student and employee list attachments get surfaced too, not
// silently skipped.
const SUPPORTED_ATTACHMENT_EXTENSIONS = [
  ".pdf",
  ".csv",
  ".xlsx",
  ".xls",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
];

function findFirstAttachment(part: GmailPart | undefined): GmailPart | null {
  if (!part) return null;
  if (part.filename && part.body?.attachmentId) {
    const name = part.filename.toLowerCase();
    const isDocument =
      (part.mimeType?.startsWith("image/") ?? false) ||
      SUPPORTED_ATTACHMENT_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (isDocument) return part;
  }
  for (const child of part.parts ?? []) {
    const found = findFirstAttachment(child);
    if (found) return found;
  }
  return null;
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageSummary> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail get message failed (${res.status})`);
  const data = (await res.json()) as {
    id: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: { name: string; value: string }[] };
  };

  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const attachmentPart = findFirstAttachment(data.payload);

  return {
    id: data.id,
    sender: header("From"),
    subject: header("Subject"),
    receivedAt: data.internalDate ? new Date(Number(data.internalDate)) : null,
    attachment: attachmentPart
      ? {
          filename: attachmentPart.filename!,
          attachmentId: attachmentPart.body!.attachmentId!,
          mimeType: attachmentPart.mimeType ?? "application/octet-stream",
        }
      : null,
  };
}

export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail get attachment failed (${res.status})`);
  const data = (await res.json()) as { data: string };
  // Gmail attachment payloads are base64url-encoded.
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** MIME "encoded-word" form so non-ASCII subjects survive intact. */
function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Sends an email from the connected Gmail account, with an optional single
 * attachment. Builds a minimal RFC 2822 multipart/mixed message and posts it
 * to Gmail's messages.send endpoint (requires the gmail.send scope).
 */
export async function sendGmailMessage(
  accessToken: string,
  params: { to: string; subject: string; bodyText: string; attachment?: OutboundAttachment }
): Promise<{ id: string }> {
  const boundary = `stuaps_${randomBoundary()}`;
  const lines: string[] = [
    `To: ${params.to}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.bodyText,
  ];

  if (params.attachment) {
    lines.push(
      "",
      `--${boundary}`,
      `Content-Type: ${params.attachment.mimeType}; name="${params.attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
      "",
      params.attachment.content.toString("base64")
    );
  }

  lines.push("", `--${boundary}--`, "");
  const raw = toBase64Url(Buffer.from(lines.join("\r\n"), "utf-8"));

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${text}`);
  }
  return (await res.json()) as { id: string };
}

function randomBoundary(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}
