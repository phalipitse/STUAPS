const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
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
  attachment: { filename: string; attachmentId: string } | null;
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

function findFirstAttachment(part: GmailPart | undefined): GmailPart | null {
  if (!part) return null;
  if (part.filename && part.body?.attachmentId) {
    const isDocument =
      part.mimeType === "application/pdf" ||
      part.filename.toLowerCase().endsWith(".pdf") ||
      part.filename.toLowerCase().endsWith(".csv");
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
      ? { filename: attachmentPart.filename!, attachmentId: attachmentPart.body!.attachmentId! }
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
