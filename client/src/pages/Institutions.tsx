import { useState, type FormEvent } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";
import { SOUTH_AFRICAN_UNIVERSITIES, OTHER_INSTITUTION_OPTION } from "../lib/southAfricanUniversities";

export function Institutions() {
  const { institutions, refresh } = useInstitutions();
  const [selected, setSelected] = useState("");
  const [customName, setCustomName] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOther = selected === OTHER_INSTITUTION_OPTION;
  const name = isOther ? customName : selected;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/institutions", { name, invoicePrefix });
      setSelected("");
      setCustomName("");
      setInvoicePrefix("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create institution");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h1>Institutions</h1>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Prefix</th>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          {institutions.map((inst) => (
            <tr key={inst.id}>
              <td>{inst.invoicePrefix}</td>
              <td>{inst.name}</td>
            </tr>
          ))}
          {institutions.length === 0 && (
            <tr>
              <td colSpan={2} className="muted">
                No institutions yet — add one below.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <h2>Add institution</h2>
      <form className="inline-form" onSubmit={handleSubmit}>
        <label>
          University / institution
          <select value={selected} onChange={(e) => setSelected(e.target.value)} required>
            <option value="" disabled>
              Select…
            </option>
            {SOUTH_AFRICAN_UNIVERSITIES.map((uni) => (
              <option key={uni} value={uni}>
                {uni}
              </option>
            ))}
            <option value={OTHER_INSTITUTION_OPTION}>{OTHER_INSTITUTION_OPTION}</option>
          </select>
        </label>
        {isOther && (
          <label>
            Institution name
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} required />
          </label>
        )}
        <label>
          Invoice prefix
          <input
            value={invoicePrefix}
            onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
            placeholder="e.g. TUT"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add institution"}
        </button>
      </form>
    </div>
  );
}
