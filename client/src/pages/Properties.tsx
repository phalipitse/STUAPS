import { useEffect, useState, type FormEvent } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";

interface Property {
  id: number;
  name: string;
  address: string | null;
  capacity: number | null;
}

export function Properties() {
  const { selectedId } = useInstitutions();
  const [properties, setProperties] = useState<Property[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    if (!selectedId) return;
    const rows = await api.get<Property[]>(`/properties?institutionId=${selectedId}`);
    setProperties(rows);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/properties", {
        institutionId: selectedId,
        name,
        address: address || undefined,
        capacity: capacity ? Number(capacity) : undefined,
      });
      setName("");
      setAddress("");
      setCapacity("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add property");
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

  return (
    <div className="page">
      <h1>Properties</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Capacity</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.address ?? "—"}</td>
              <td>{p.capacity ?? "—"}</td>
            </tr>
          ))}
          {properties.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No properties yet — add one below.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Add property</h2>
      <form className="inline-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add property"}
        </button>
      </form>
    </div>
  );
}
