export type DetectedDocumentKind = "statement" | "student_roster" | "employee_roster" | "unknown";

/**
 * Best-effort guess at what kind of document an email attachment is, from its
 * filename and the email subject. This only decides which import pipeline
 * `/detected/:id/approve` tries first — the admin always reviews the result
 * before it's treated as final, so a wrong guess just means "unknown" or a
 * harmless mismatched preview, not bad data.
 */
export function classifyDocumentKind(filename: string, subject: string): DetectedDocumentKind {
  const haystack = `${filename} ${subject}`.toLowerCase();
  if (/payroll|employee|staff/.test(haystack)) return "employee_roster";
  if (/student|roster|learner/.test(haystack)) return "student_roster";
  if (/\.(pdf|csv)$/i.test(filename)) return "statement";
  return "unknown";
}
