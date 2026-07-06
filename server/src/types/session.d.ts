import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    tenantId?: number;
    role?: "admin" | "staff";
    isSuperAdmin?: boolean;
    gmailOAuthState?: string;
  }
}
