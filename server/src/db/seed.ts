import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index.js";
import { tenants, users } from "./schema.js";
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

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
