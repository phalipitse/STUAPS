import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { institutions, userInstitutionAccess } from "../db/schema.js";

export class ForbiddenError extends Error {}

interface AccessSession {
  tenantId: number;
  userId: number;
  role: "admin" | "staff";
}

/** Confirms an institution belongs to the given tenant before any child resource is touched. */
export async function assertInstitutionInTenant(institutionId: number, tenantId: number) {
  const [row] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(and(eq(institutions.id, institutionId), eq(institutions.tenantId, tenantId)));
  if (!row) {
    throw new ForbiddenError("Institution does not belong to this tenant");
  }
}

/**
 * Confirms an institution belongs to the tenant AND, for staff users, that they've
 * been granted access to it. A staff user with zero rows in user_institution_access
 * has full tenant access (matches the "empty = all institutions" convention on the
 * users table) — access only becomes restrictive once at least one row exists for them.
 */
export async function assertInstitutionAccessible(institutionId: number, session: AccessSession) {
  await assertInstitutionInTenant(institutionId, session.tenantId);

  if (session.role === "admin") return;

  const grants = await db
    .select({ institutionId: userInstitutionAccess.institutionId })
    .from(userInstitutionAccess)
    .where(eq(userInstitutionAccess.userId, session.userId));

  if (grants.length === 0) return; // no restrictions configured — full tenant access

  const allowed = grants.some((g) => g.institutionId === institutionId);
  if (!allowed) {
    throw new ForbiddenError("You do not have access to this institution");
  }
}

/** Institution IDs a staff user is restricted to, or null if they have full tenant access. */
export async function getStaffInstitutionScope(userId: number): Promise<number[] | null> {
  const grants = await db
    .select({ institutionId: userInstitutionAccess.institutionId })
    .from(userInstitutionAccess)
    .where(eq(userInstitutionAccess.userId, userId));
  return grants.length === 0 ? null : grants.map((g) => g.institutionId);
}
