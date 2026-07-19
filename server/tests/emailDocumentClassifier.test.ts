import { describe, it, expect } from "vitest";
import { classifyDocumentKind } from "../src/lib/emailDocumentClassifier.js";

describe("classifyDocumentKind", () => {
  it("recognises an NSFAS-style statement PDF with no keyword hints", () => {
    expect(classifyDocumentKind("statement_march.pdf", "Your NSFAS statement")).toBe("statement");
  });

  it("recognises a CSV statement", () => {
    expect(classifyDocumentKind("invoice.csv", "Monthly invoice")).toBe("statement");
  });

  it("recognises a student roster by filename keyword", () => {
    expect(classifyDocumentKind("student_roster.xlsx", "Updated list")).toBe("student_roster");
  });

  it("recognises a student roster by subject keyword", () => {
    expect(classifyDocumentKind("list.docx", "New learner intake for July")).toBe("student_roster");
  });

  it("recognises an employee/payroll roster", () => {
    expect(classifyDocumentKind("employees.xlsx", "Staff list update")).toBe("employee_roster");
  });

  it("falls back to unknown for unrecognised spreadsheet/image types", () => {
    expect(classifyDocumentKind("scan.jpg", "FYI")).toBe("unknown");
  });

  it("prefers keyword hints over the statement-by-extension default", () => {
    expect(classifyDocumentKind("student_list.csv", "Roster update")).toBe("student_roster");
  });
});
