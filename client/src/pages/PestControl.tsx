import { useEffect, useState, type FormEvent } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";

type Status = "never" | "overdue" | "due_soon" | "ok";

interface Treatment {
  id: number;
  treatedOn: string;
  companyName: string | null;
  notes: string | null;
}

interface PropertyPestControl {
  propertyId: number;
  propertyName: string;
  address: string | null;
  lastTreatedOn: string | null;
  lastCompanyName: string | null;
  nextDueOn: string | null;
  status: Status;
  treatments: Treatment[];
}

const STATUS_LABEL: Record<Status, string> = {
  never: "No record",
  overdue: "Overdue",
  due_soon: "Due soon",
  ok: "Up to date",
};

function findPestControlUrl(property: PropertyPestControl) {
  const near = property.address ?? property.propertyName;
  return `https://www.google.com/maps/search/${encodeURIComponent(`pest control near ${near}`)}`;
}

export function PestControl() {
  const { selectedId } = useInstitutions();
  const [rows, setRows] = useState<PropertyPestControl[]>([]);
  const [loggingFor, setLoggingFor] = useState<number | null>(null);
  const [treatedOn, setTreatedOn] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    if (!selectedId) return;
    setRows(await api.get<PropertyPestControl[]>(`/pest-control?institutionId=${selectedId}`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function startLogging(propertyId: number) {
    setLoggingFor(propertyId);
    setTreatedOn(new Date().toISOString().slice(0, 10));
    setCompanyName("");
    setNotes("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loggingFor === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/pest-control", {
        propertyId: loggingFor,
        treatedOn,
        companyName: companyName || undefined,
        notes: notes || undefined,
      });
      setLoggingFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log this treatment");
    } finally {
      setSubmitting(false);
    }
  }

  if (!selectedId) {
    return (
      <div className="page">
        <p className="muted">Add an institution first.</p>
      </div>
    );
  }

  const needsAttention = rows.filter((r) => r.status === "overdue" || r.status === "never");

  return (
    <div className="page">
      <h1>Pest control</h1>
      <p className="muted">
        Accommodation providers are required to have pest control done three times a year, so each
        property is due again four months after its last treatment.
      </p>

      {needsAttention.length > 0 && (
        <p className="error">
          {needsAttention.length} propert{needsAttention.length === 1 ? "y needs" : "ies need"} pest
          control booked.
        </p>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Last treated</th>
              <th>Next due</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.propertyId}
                className={r.status === "overdue" || r.status === "never" ? "row-outstanding" : ""}
              >
                <td>{r.propertyName}</td>
                <td>
                  {r.lastTreatedOn ?? "—"}
                  {r.lastCompanyName && <div className="muted small">{r.lastCompanyName}</div>}
                </td>
                <td>{r.nextDueOn ?? "—"}</td>
                <td>
                  <span className={`status-pill status-pest-${r.status}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td>
                  <a href={findPestControlUrl(r)} target="_blank" rel="noreferrer">
                    Find pest control nearby
                  </a>
                  {" · "}
                  <button className="link-button" onClick={() => startLogging(r.propertyId)}>
                    Log treatment
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No properties yet — add one on the Properties page first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loggingFor !== null && (
        <>
          <h2>Log a treatment</h2>
          <form className="inline-form" onSubmit={handleSubmit}>
            <label>
              Date treated
              <input
                type="date"
                value={treatedOn}
                onChange={(e) => setTreatedOn(e.target.value)}
                required
              />
            </label>
            <label>
              Pest control company
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </label>
            <label>
              Notes
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save treatment"}
            </button>
            <button type="button" className="link-button" onClick={() => setLoggingFor(null)}>
              Cancel
            </button>
          </form>
        </>
      )}
    </div>
  );
}
