import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseStudentSpreadsheet, parseEmployeeSpreadsheet, classifyRosterFile, UnsupportedRosterFileError } from "../src/lib/rosterUpload.js";

describe("parseStudentSpreadsheet", () => {
  it("parses a CSV roster with standard headers", async () => {
    const csv = [
      "Student Number,Name,Surname,Residence,Campus",
      "221520572,Ganty,Mathebula,Saint Powerpoint,Main",
      "222440653,Thando,Ntsangani,Saint Powerpoint,Main",
    ].join("\n");
    const rows = await parseStudentSpreadsheet(Buffer.from(csv), true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      studentNumber: "221520572",
      name: "Ganty",
      surname: "Mathebula",
      residence: "Saint Powerpoint",
      campus: "Main",
    });
  });

  it("skips rows missing a required field", async () => {
    const csv = ["Student Number,Name,Surname", "123,Only,Name", ",Missing,Number"].join("\n");
    const rows = await parseStudentSpreadsheet(Buffer.from(csv), true);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentNumber).toBe("123");
  });

  it("parses an .xlsx workbook via matched headers regardless of column order", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Roster");
    sheet.addRow(["Surname", "Student No", "Name"]);
    sheet.addRow(["Mabina", "230971757", "Tebalelo"]);
    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

    const rows = await parseStudentSpreadsheet(Buffer.from(buffer), false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentNumber: "230971757",
      name: "Tebalelo",
      surname: "Mabina",
    });
  });
});

describe("parseEmployeeSpreadsheet", () => {
  it("parses employee rows including a numeric salary column", async () => {
    const csv = ["Name,ID Number,Job Title,Monthly Salary", "Jane Doe,9001015800086,Cleaner,R 8500.00"].join("\n");
    const rows = await parseEmployeeSpreadsheet(Buffer.from(csv), true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: "Jane Doe",
      idNumber: "9001015800086",
      jobTitle: "Cleaner",
      monthlySalary: 8500,
    });
  });
});

describe("classifyRosterFile", () => {
  it("classifies by extension and mimetype", () => {
    expect(classifyRosterFile("roster.csv", "text/csv")).toBe("spreadsheet-csv");
    expect(classifyRosterFile("roster.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(
      "spreadsheet-xlsx"
    );
    expect(classifyRosterFile("roster.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "docx"
    );
    expect(classifyRosterFile("roster.pdf", "application/pdf")).toBe("pdf-or-image");
    expect(classifyRosterFile("photo.jpg", "image/jpeg")).toBe("pdf-or-image");
  });

  it("rejects unsupported file types", () => {
    expect(() => classifyRosterFile("roster.txt", "text/plain")).toThrow(UnsupportedRosterFileError);
  });
});
