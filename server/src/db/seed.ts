import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index.js";
import { tenants, users, institutions, properties, students, invoices, invoiceLineItems, pestControlTreatments } from "./schema.js";
import { hashPassword } from "../lib/auth.js";

async function main() {
  const superAdminUsername = process.env.SUPERADMIN_USERNAME ?? "pitsadmin";
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD ?? "change-me-in-production";

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, superAdminUsername));

  if (existing) {
    console.log(`Super-admin "${superAdminUsername}" already exists — skipping.`);
  } else {
    const [pitsMarketing] = await db
      .insert(tenants)
      .values({
        companyName: "Pits Marketing",
        contactName: "Pits Marketing",
        contactEmail: "admin@pitsmarketing.example",
        subscriptionStatus: "active",
        isSuperAdminTenant: true,
      })
      .returning();

    const passwordHash = await hashPassword(superAdminPassword);
    await db.insert(users).values({
      tenantId: pitsMarketing.id,
      username: superAdminUsername,
      passwordHash,
      role: "admin",
      isSuperAdmin: true,
    });
    console.log(`Created super-admin "${superAdminUsername}".`);
  }

  // Create demo tenant if it doesn't exist
  const [demoTenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.companyName, "Demo Property"));

  if (!demoTenant) {
    const [newDemoTenant] = await db
      .insert(tenants)
      .values({
        companyName: "Demo Property",
        contactName: "Demo Admin",
        contactEmail: "demo@stuaps.example",
        subscriptionStatus: "active",
        billingPlan: "monthly",
        paystackCustomerCode: "CUS_test_demo_12345",
      })
      .returning();

    // Create demo user
    const demoPasswordHash = await hashPassword("demo123");
    await db.insert(users).values({
      tenantId: newDemoTenant.id,
      username: "demo",
      passwordHash: demoPasswordHash,
      role: "admin",
    });

    // Create demo institution
    const [demoInstitution] = await db
      .insert(institutions)
      .values({
        tenantId: newDemoTenant.id,
        name: "Demo University Residence",
        invoicePrefix: "DEMO",
      })
      .returning();

    // Create demo properties
    const [property1] = await db
      .insert(properties)
      .values({
        institutionId: demoInstitution.id,
        name: "North Wing",
        address: "123 Campus Ave, Johannesburg, Gauteng 2000",
      })
      .returning();

    const [property2] = await db
      .insert(properties)
      .values({
        institutionId: demoInstitution.id,
        name: "South Wing",
        address: "124 Campus Ave, Johannesburg, Gauteng 2000",
      })
      .returning();

    // Create demo students
    const studentPairs = [
      ["Alice", "Johnson"], ["Bob", "Smith"], ["Carol", "White"], ["David", "Brown"], ["Eve", "Davis"],
      ["Frank", "Miller"], ["Grace", "Lee"], ["Henry", "Wilson"], ["Iris", "Taylor"], ["Jack", "Anderson"],
      ["Karen", "Thomas"], ["Leo", "Moore"], ["Mia", "Jackson"], ["Noah", "Martin"], ["Olivia", "Garcia"],
      ["Paul", "Rodriguez"], ["Quinn", "Harris"], ["Rachel", "Clark"], ["Sam", "Lewis"], ["Tina", "Walker"],
      ["Uma", "Young"], ["Victor", "Hernandez"], ["Wendy", "King"], ["Xander", "Wright"], ["Yara", "Lopez"],
      ["Zoe", "Hill"], ["Aaron", "Scott"], ["Bella", "Green"], ["Charlie", "Adams"], ["Diana", "Nelson"],
      ["Ethan", "Carter"], ["Fiona", "Mitchell"], ["George", "Roberts"], ["Hannah", "Phillips"],
      ["Isaac", "Campbell"], ["Jessica", "Parker"], ["Kevin", "Evans"], ["Laura", "Edwards"],
      ["Mason", "Roberts"], ["Nora", "Stewart"], ["Oliver", "Sanchez"], ["Penelope", "Morris"],
      ["Quinn", "Rogers"], ["Ruby", "Peterson"], ["Samuel", "Peterson"], ["Tanya", "Gray"],
      ["Ulysses", "Ramirez"], ["Violet", "James"], ["William", "Watson"], ["Xenia", "Brooks"],
      ["Yuri", "Chavez"], ["Zara", "Boyd"],
    ];

    const createdStudents: typeof students.$inferSelect[] = [];
    for (const [first, last] of studentPairs) {
      const [newStudent] = await db
        .insert(students)
        .values({
          institutionId: demoInstitution.id,
          name: first,
          surname: last,
          studentNumber: `STU-${String(createdStudents.length + 1).padStart(4, "0")}`,
        })
        .returning();
      if (newStudent) {
        createdStudents.push(newStudent);
      }
    }

    // Create demo invoices with line items (last 90 days)
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const invoiceDate = new Date(today);
      invoiceDate.setDate(invoiceDate.getDate() - i * 30);
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const [invoice] = await db
        .insert(invoices)
        .values({
          institutionId: demoInstitution.id,
          invoiceDate: invoiceDate.toISOString().split("T")[0],
          dueDate: dueDate.toISOString().split("T")[0],
          invoiceNumber: `DEMO-2025-${1000 + i}`,
          total: "184000", // 40 students × 4600
          status: i === 0 ? "outstanding" : "paid",
        })
        .returning();

      // Add 35-45 students to each invoice
      const studentsToInvoice = createdStudents.slice(i * 12, Math.min(i * 12 + 40, createdStudents.length));
      for (const student of studentsToInvoice) {
        await db.insert(invoiceLineItems).values({
          invoiceId: invoice.id,
          studentId: student.id,
          description: "Accommodation",
          quantity: "1",
          unitAmount: "4600",
          lineTotal: "4600",
        });
      }
    }

    // Create pest control treatments
    const treatmentDates = [
      new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 30 days ago
      new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 120 days ago (overdue)
    ];

    await db.insert(pestControlTreatments).values({
      propertyId: property1.id,
      treatedOn: treatmentDates[0],
      companyName: "ABC Pest Control",
    });

    await db.insert(pestControlTreatments).values({
      propertyId: property2.id,
      treatedOn: treatmentDates[1],
      companyName: "XYZ Pest Control",
    });

    console.log(`Created demo tenant "Demo Property" with institution, properties, and student data.`);
  } else {
    console.log(`Demo tenant already exists — skipping.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
