import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useInstitutions } from "../institutions/InstitutionContext";
import { api } from "../lib/api";
import { formatRand } from "../lib/format";

interface OutstandingEntry {
  invoiceId: number;
  invoiceNumber: string;
  amount: number;
}

interface StudentOutstanding {
  studentId: number;
  studentNumber: string;
  name: string;
  surname: string;
  totalOutstanding: number;
  outstandingByInvoice: OutstandingEntry[];
}

const today = new Date().toLocaleDateString("en-ZA", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function DemandLetter() {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const institutionId = searchParams.get("institutionId");
  const { tenant } = useAuth();
  const { institutions } = useInstitutions();
  const [student, setStudent] = useState<StudentOutstanding | null | undefined>(undefined);

  const institution = institutions.find((i) => String(i.id) === institutionId);

  useEffect(() => {
    if (!institutionId) return;
    api
      .get<StudentOutstanding[]>(`/reports/outstanding?institutionId=${institutionId}`)
      .then((rows) => setStudent(rows.find((r) => String(r.studentId) === studentId) ?? null));
  }, [institutionId, studentId]);

  if (student === undefined) return <div className="page">Loading…</div>;
  if (student === null) {
    return (
      <div className="page">
        <p className="error">Could not find that student's outstanding balance.</p>
        <Link to="/outstanding">← Back to Who owes what</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-heading-row no-print">
        <h1>Request for payment</h1>
        <button onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <p className="muted no-print">
        <Link to="/outstanding">← Back to Who owes what</Link>
      </p>

      <div className="letter">
        <p className="letter-date">{today}</p>

        <p>
          <strong>To:</strong> {student.name} {student.surname} (Student no: {student.studentNumber})
        </p>
        {institution && (
          <p>
            <strong>Re:</strong> Student accommodation — {institution.name}
          </p>
        )}

        <h2>Request for payment of outstanding accommodation fees</h2>

        <p>
          Our records show that the amount below remains outstanding on your student
          accommodation account. If your NSFAS or other funder allowance for this period was
          paid directly into your own bank account rather than to us, please arrange for this
          amount to be forwarded to {tenant?.companyName ?? "us"} within 7 days of the date of
          this letter.
        </p>

        <table className="data-table letter-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {student.outstandingByInvoice.map((o) => (
              <tr key={o.invoiceId}>
                <td>{o.invoiceNumber}</td>
                <td>{formatRand(o.amount)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total outstanding</strong>
              </td>
              <td>
                <strong>{formatRand(student.totalOutstanding)}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <p>
          Please contact us as soon as possible to settle this balance or to discuss a payment
          arrangement. This letter serves as a formal, dated record of our request for payment.
        </p>

        <p className="letter-signoff">
          Kind regards,
          <br />
          {tenant?.companyName ?? "Accommodation provider"}
        </p>
      </div>
    </div>
  );
}
