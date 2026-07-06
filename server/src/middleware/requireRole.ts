import type { Request, Response, NextFunction } from "express";

/** Requires the session user to have one of the given roles. Call after requireAuth. */
export function requireRole(...roles: Array<"admin" | "staff">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.role || !roles.includes(req.session.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/** Requires the session user to be a super-admin (Pits Marketing staff). */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.isSuperAdmin) {
    return res.status(403).json({ error: "Super-admin access required" });
  }
  next();
}
