import { useEffect, useState, type FormEvent } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";

interface TeamMember {
  id: number;
  username: string;
  email: string | null;
  role: "admin" | "staff";
  institutionIds: number[];
}

export function Team() {
  const { institutions } = useInstitutions();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [institutionIds, setInstitutionIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const rows = await api.get<TeamMember[]>("/team");
    setMembers(rows);
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleInstitution(id: number) {
    setInstitutionIds((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id]
    );
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/team", { username, email, password, institutionIds });
      setUsername("");
      setEmail("");
      setPassword("");
      setInstitutionIds([]);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add staff member");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateAccess(member: TeamMember, id: number) {
    const next = member.institutionIds.includes(id)
      ? member.institutionIds.filter((i) => i !== id)
      : [...member.institutionIds, id];
    await api.patch(`/team/${member.id}/access`, { institutionIds: next });
    await refresh();
  }

  async function removeMember(id: number) {
    await api.delete(`/team/${id}`);
    await refresh();
  }

  return (
    <div className="page">
      <h1>Team</h1>

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>Institution access</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.username}</td>
              <td>{m.email ?? "—"}</td>
              <td>{m.role}</td>
              <td>
                {m.role === "admin" ? (
                  <span className="muted">All institutions</span>
                ) : m.institutionIds.length === 0 ? (
                  <span className="muted">All institutions (no restrictions set)</span>
                ) : (
                  institutions
                    .filter((inst) => m.institutionIds.includes(inst.id))
                    .map((inst) => inst.invoicePrefix)
                    .join(", ")
                )}
              </td>
              <td>
                {m.role === "staff" && (
                  <>
                    {institutions.map((inst) => (
                      <label key={inst.id} className="small" style={{ marginRight: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={m.institutionIds.includes(inst.id)}
                          onChange={() => updateAccess(m, inst.id)}
                        />{" "}
                        {inst.invoicePrefix}
                      </label>
                    ))}
                    <button onClick={() => removeMember(m.id)}>Remove</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No team members yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <h2>Add staff member</h2>
      <form className="inline-form" onSubmit={handleCreate}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <fieldset>
          <legend className="small">Institution access (none checked = all)</legend>
          {institutions.map((inst) => (
            <label key={inst.id} className="small" style={{ marginRight: "0.75rem" }}>
              <input
                type="checkbox"
                checked={institutionIds.includes(inst.id)}
                onChange={() => toggleInstitution(inst.id)}
              />{" "}
              {inst.invoicePrefix}
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add staff member"}
        </button>
      </form>
    </div>
  );
}
