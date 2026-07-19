import { useEffect, useRef, useState } from "react";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api, ApiError } from "../lib/api";
import { formatRand } from "../lib/format";

interface StudentBillingSummary {
  studentId: number;
  studentNumber: string;
  name: string;
  surname: string;
  residence: string | null;
  campus: string | null;
  totalBilled: number;
  totalOutstanding: number;
  overallStatusLabel: string;
}

interface RosterRow {
  studentNumber: string;
  name: string;
  surname: string;
  residence?: string;
  campus?: string;
}

interface PreviewRow extends RosterRow {
  selected: boolean;
}

export function Students() {
  const { selectedId } = useInstitutions();
  const [rows, setRows] = useState<StudentBillingSummary[]>([]);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!selectedId) return;
    const data = await api.get<StudentBillingSummary[]>(`/reports/students?institutionId=${selectedId}`);
    setRows(data);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploadError(null);
    setImportNotice(null);
    setPreviewRows([]);
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { rows: parsedRows } = await api.upload<{ rows: RosterRow[] }>("/students/upload-preview", form);
      setPreviewRows(parsedRows.map((r) => ({ ...r, selected: true })));
      if (parsedRows.length === 0) {
        setUploadError("No students found in that file — check the format and try again.");
      }
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not read that file");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleRow(index: number) {
    setPreviewRows((cur) => cur.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r)));
  }

  async function handleImport() {
    if (!selectedId) return;
    const toImport = previewRows.filter((r) => r.selected);
    if (toImport.length === 0) return;
    setImporting(true);
    setUploadError(null);
    try {
      const res = await api.post<{ created: number; updated: number }>("/students/import", {
        institutionId: selectedId,
        rows: toImport.map(({ selected: _selected, ...r }) => r),
      });
      setImportNotice(`Imported ${res.created} new student(s), updated ${res.updated} existing.`);
      setPreviewRows([]);
      await refresh();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Could not import students");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page">
      <h1>Student roster & cross-invoice summary</h1>

      <h2>Upload roster</h2>
      <p className="muted">
        Upload a student list as a CSV, Excel (.xlsx), Word (.docx), PDF, or photo — students already
        on file (matched by student number) are updated, new ones are added.
      </p>
      <div className="inline-form">
        <label>
          Choose file
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.docx,.pdf,image/*"
            disabled={!selectedId || parsing}
            onChange={handleFileSelected}
          />
        </label>
        {parsing && <span className="muted">Reading file…</span>}
      </div>
      {!selectedId && <p className="error">Add an institution first.</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {importNotice && <p className="success">{importNotice}</p>}

      {previewRows.length > 0 && (
        <>
          <h3>Review before importing ({previewRows.filter((r) => r.selected).length} selected)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Student no</th>
                  <th>Name</th>
                  <th>Surname</th>
                  <th>Residence</th>
                  <th>Campus</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleRow(i)} />
                    </td>
                    <td>{r.studentNumber}</td>
                    <td>{r.name}</td>
                    <td>{r.surname}</td>
                    <td>{r.residence ?? "—"}</td>
                    <td>{r.campus ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inline-form">
            <button
              onClick={handleImport}
              disabled={importing || previewRows.every((r) => !r.selected)}
            >
              {importing ? "Importing…" : "Import selected"}
            </button>
            <button type="button" className="link-button" onClick={() => setPreviewRows([])}>
              Cancel
            </button>
          </div>
        </>
      )}

      <h2>Roster</h2>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Student no</th>
            <th>Name</th>
            <th>Surname</th>
            <th>Residence</th>
            <th>Total billed</th>
            <th>Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.studentId} className={s.totalOutstanding > 0 ? "row-outstanding" : ""}>
              <td>{s.studentNumber}</td>
              <td>{s.name}</td>
              <td>{s.surname}</td>
              <td>{s.residence ?? "—"}</td>
              <td>{formatRand(s.totalBilled)}</td>
              <td>{formatRand(s.totalOutstanding)}</td>
              <td>{s.overallStatusLabel}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No students yet — upload an invoice or a roster file above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
