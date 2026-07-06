import { useEffect, useState } from "react";
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

interface DetectedStatement {
  id: number;
  sender: string;
  subject: string | null;
  receivedAt: string | null;
  attachmentFilename: string | null;
  status: "pending" | "approved" | "rejected" | "import_failed";
  parsedPreview: string | null;
  importedInvoiceId: number | null;
}

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
  const [keywords, setKeywords] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const [s, rows] = await Promise.all([
      api.get<ConnectionStatus>("/email-integrations/status"),
      api.get<DetectedStatement[]>("/email-integrations/detected"),
    ]);
    setStatus(s);
    setKeywords(s.connection?.watchKeywords ?? "");
    setStatements(rows);
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
    await api.delete("/email-integrations/connect/gmail");
    await refresh();
  }

  async function saveKeywords() {
    await api.patch("/email-integrations/connect/gmail", { watchKeywords: keywords });
    await refresh();
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

  async function approve(id: number) {
    const institutionId = selectedInstitution[id] ?? institutions[0]?.id;
    if (!institutionId) {
      setError("Add an institution first so approved statements have somewhere to import into.");
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await api.post<{ preview: string }>(`/email-integrations/detected/${id}/approve`, {
        institutionId,
      });
      setNotice(res.preview);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import this statement");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    setBusyId(id);
    try {
      await api.post(`/email-integrations/detected/${id}/reject`);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (!status) return <div className="page">Loading…</div>;

  const pending = statements.filter((s) => s.status === "pending");
  const reviewed = statements.filter((s) => s.status !== "pending");

  return (
    <div className="page">
      <h1>Email inbox</h1>
      <p className="muted">
        Connect Gmail so Stuaps can watch for statement emails from NSFAS or other student
        funders. Nothing is imported automatically — every detected email waits for your approval
        before it touches your reconciliation data.
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
                    <td>
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
                      <button onClick={() => approve(s.id)} disabled={busyId === s.id}>
                        Approve &amp; import
                      </button>{" "}
                      <button onClick={() => reject(s.id)} disabled={busyId === s.id}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
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
        </>
      )}
    </div>
  );
}
