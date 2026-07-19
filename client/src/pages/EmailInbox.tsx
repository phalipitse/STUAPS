import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";

interface ConnectionStatus {
  gmailConfigured: boolean;
  connection: {
    id: number;
    emailAddress: string;
    watchKeywords: string;
    lastScannedAt: string | null;
  } | null;
}

type DocumentKind = "statement" | "student_roster" | "employee_roster" | "unknown";

interface DetectedStatement {
  id: number;
  sender: string;
  subject: string | null;
  receivedAt: string | null;
  attachmentFilename: string | null;
  documentKind: DocumentKind;
  status: "pending" | "approved" | "rejected" | "import_failed";
  parsedPreview: string | null;
  importedInvoiceId: number | null;
}

interface SentEmail {
  id: number;
  toAddress: string;
  subject: string;
  attachmentFilename: string | null;
  createdAt: string;
}

const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  statement: "Funder statement",
  student_roster: "Student roster",
  employee_roster: "Employee list",
  unknown: "Unrecognized",
};

const NEEDS_INSTITUTION: Record<DocumentKind, boolean> = {
  statement: true,
  student_roster: true,
  employee_roster: false,
  unknown: false,
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "That connection attempt expired — try connecting again.",
  no_refresh_token:
    "Google didn't return a long-lived permission this time — remove Stuaps from your Google account's third-party access page, then reconnect.",
  connect_failed: "Could not connect to Gmail. Please try again.",
};

export function EmailInbox() {
  const { institutions } = useInstitutions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statements, setStatements] = useState<DetectedStatement[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [keywords, setKeywords] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sendTo, setSendTo] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  async function refresh() {
    const [s, rows, sent] = await Promise.all([
      api.get<ConnectionStatus>("/email-integrations/status"),
      api.get<DetectedStatement[]>("/email-integrations/detected"),
      api.get<SentEmail[]>("/email-integrations/sent"),
    ]);
    setStatus(s);
    setKeywords(s.connection?.watchKeywords ?? "");
    setStatements(rows);
    setSentEmails(sent);
  }

  useEffect(() => {
    refresh();
    const connected = searchParams.get("connected");
    const errParam = searchParams.get("error");
    if (connected) setNotice("Gmail connected — click \"Scan now\" to look for statement emails.");
    if (errParam) setError(ERROR_MESSAGES[errParam] ?? "Something went wrong connecting Gmail.");
    if (connected || errParam) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGmail() {
    setError(null);
    try {
      const res = await api.get<{ url: string }>("/email-integrations/connect/gmail");
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start Gmail connection");
    }
  }

  async function disconnectGmail() {
    if (!confirm("Disconnect Gmail? Detected statements already reviewed stay on record.")) return;
    setError(null);
    try {
      await api.delete("/email-integrations/connect/gmail");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disconnect Gmail");
    }
  }

  async function saveKeywords() {
    setError(null);
    try {
      await api.patch("/email-integrations/connect/gmail", { watchKeywords: keywords });
      setNotice("Watch senders saved.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save watch senders");
    }
  }

  async function scanNow() {
    setScanning(true);
    setError(null);
    try {
      const res = await api.post<{ newCount: number }>("/email-integrations/scan");
      setNotice(
        res.newCount === 0
          ? "No new statement emails found."
          : `Found ${res.newCount} new email(s) with attachments — review them below.`
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function approve(statement: DetectedStatement) {
    const id = statement.id;
    const needsInstitution = NEEDS_INSTITUTION[statement.documentKind];
    const institutionId = selectedInstitution[id] ?? institutions[0]?.id;
    if (needsInstitution && !institutionId) {
      setError("Add an institution first so this can be imported somewhere.");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await api.post<{ preview: string }>(`/email-integrations/detected/${id}/approve`, {
        institutionId: needsInstitution ? institutionId : undefined,
      });
      setNotice(res.preview);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import this attachment");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/email-integrations/detected/${id}/reject`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject this statement");
    } finally {
      setBusyId(null);
    }
  }

  async function sendEmail(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("to", sendTo);
      form.append("subject", sendSubject);
      form.append("bodyText", sendBody);
      if (sendFile) form.append("attachment", sendFile);
      await api.upload("/email-integrations/send", form);
      setNotice(`Sent to ${sendTo}.`);
      setSendTo("");
      setSendSubject("");
      setSendBody("");
      setSendFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send this email");
    } finally {
      setSending(false);
    }
  }

  if (!status) return <div className="page">Loading…</div>;

  const pending = statements.filter((s) => s.status === "pending");
  const reviewed = statements.filter((s) => s.status !== "pending");

  return (
    <div className="page">
      <h1>Email inbox</h1>
      <p className="muted">
        Connect Gmail so Stuaps can watch for statement, student roster, and employee list emails
        from funders and your own team. Nothing is imported automatically — every detected email
        waits for your approval before it touches your data. You can also send documents (like an
        outstanding-balance report or a payslip) straight from Stuaps using the connected account.
      </p>

      {!status.gmailConfigured && (
        <p className="error">Gmail integration hasn't been set up on this server yet.</p>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}

      {status.gmailConfigured && !status.connection && (
        <div className="inline-form">
          <button onClick={connectGmail}>Connect Gmail</button>
        </div>
      )}

      {status.connection && (
        <>
          <div className="kpi-row">
            <div className="kpi-tile">
              <span className="kpi-label">Connected account</span>
              <span className="kpi-value">{status.connection.emailAddress}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Last scanned</span>
              <span className="kpi-value">
                {status.connection.lastScannedAt
                  ? new Date(status.connection.lastScannedAt).toLocaleString()
                  : "Never"}
              </span>
            </div>
          </div>

          <div className="inline-form">
            <label>
              Watch senders (comma-separated domains)
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </label>
            <button onClick={saveKeywords}>Save</button>
            <button onClick={scanNow} disabled={scanning}>
              {scanning ? "Scanning…" : "Scan now"}
            </button>
            <button className="link-button" onClick={disconnectGmail}>
              Disconnect
            </button>
          </div>

          <h2>Awaiting approval ({pending.length})</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Attachment</th>
                  <th>Type</th>
                  <th>Import into</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td>{s.receivedAt ? new Date(s.receivedAt).toLocaleDateString() : "—"}</td>
                    <td>{s.sender}</td>
                    <td>{s.subject ?? "—"}</td>
                    <td>{s.attachmentFilename ?? "—"}</td>
                    <td>{DOCUMENT_KIND_LABEL[s.documentKind]}</td>
                    <td>
                      {NEEDS_INSTITUTION[s.documentKind] ? (
                        <select
                          value={selectedInstitution[s.id] ?? institutions[0]?.id ?? ""}
                          onChange={(e) =>
                            setSelectedInstitution((cur) => ({ ...cur, [s.id]: Number(e.target.value) }))
                          }
                        >
                          {institutions.map((inst) => (
                            <option key={inst.id} value={inst.id}>
                              {inst.invoicePrefix}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <a
                        className="link-button"
                        href={`/api/email-integrations/detected/${s.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>{" "}
                      <button onClick={() => approve(s)} disabled={busyId === s.id}>
                        {s.documentKind === "unknown" ? "Mark reviewed" : "Approve & import"}
                      </button>{" "}
                      <button onClick={() => reject(s.id)} disabled={busyId === s.id}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nothing waiting for review.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {reviewed.length > 0 && (
            <>
              <h2>Reviewed</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>From</th>
                      <th>Subject</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewed.map((s) => (
                      <tr key={s.id}>
                        <td>{s.receivedAt ? new Date(s.receivedAt).toLocaleDateString() : "—"}</td>
                        <td>{s.sender}</td>
                        <td>{s.subject ?? "—"}</td>
                        <td>
                          <span className={`status-pill status-${s.status}`}>{s.status}</span>
                        </td>
                        <td className="muted">{s.parsedPreview ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2>Send a document</h2>
          <p className="muted">
            Email a report, invoice, or payslip to a tenant, funder, or student from{" "}
            {status.connection.emailAddress}.
          </p>
          <form className="inline-form" onSubmit={sendEmail}>
            <label>
              To
              <input
                type="email"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                required
              />
            </label>
            <label>
              Subject
              <input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} required />
            </label>
            <label>
              Message
              <textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} required />
            </label>
            <label>
              Attachment (optional)
              <input
                type="file"
                onChange={(e) => setSendFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </button>
          </form>

          {sentEmails.length > 0 && (
            <>
              <h2>Sent</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sent</th>
                      <th>To</th>
                      <th>Subject</th>
                      <th>Attachment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentEmails.map((m) => (
                      <tr key={m.id}>
                        <td>{new Date(m.createdAt).toLocaleString()}</td>
                        <td>{m.toAddress}</td>
                        <td>{m.subject}</td>
                        <td>{m.attachmentFilename ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
