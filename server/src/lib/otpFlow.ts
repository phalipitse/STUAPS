import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { otpVerifications } from "../db/schema.js";
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  sendOtpEmail,
  sendOtpSms,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  type OtpChannel,
} from "./otp.js";

export { OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS };

interface Destination {
  contact: string;
  type: OtpChannel;
}

/**
 * Starts a generic OTP challenge: generates one code, stores one row per
 * delivery destination (so "both" email+SMS share a single code and token),
 * and sends it. `payload` is opaque JSON the caller gets back on verify —
 * e.g. the pending registration form, or a userId for a password reset.
 */
export async function startOtp(destinations: Destination[], payload: unknown) {
  const token = crypto.randomBytes(24).toString("hex");

  // No real destination (e.g. a forgot-password lookup that matched no account) —
  // still hand back a token so the response is indistinguishable from the real
  // flow, but skip creating a row: no code was ever sent, so verify will just
  // fail like any other wrong code, without revealing whether the account exists.
  if (destinations.length === 0) {
    return { token, expiresInMinutes: OTP_EXPIRY_MINUTES };
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
  const serializedPayload = JSON.stringify(payload);

  await db.insert(otpVerifications).values(
    destinations.map((d) => ({
      registrationToken: token,
      contact: d.contact,
      type: d.type,
      codeHash,
      registrationPayload: serializedPayload,
      expiresAt,
    }))
  );

  await Promise.all(
    destinations.map((d) =>
      d.type === "email" ? sendOtpEmail(d.contact, code) : sendOtpSms(d.contact, code)
    )
  );

  return { token, expiresInMinutes: OTP_EXPIRY_MINUTES };
}

export type OtpVerifyResult<T> =
  | { ok: true; payload: T }
  | { ok: false; error: string; status: number };

/** Verifies a code against a token created by startOtp and marks it used on success. */
export async function verifyOtp<T>(token: string, code: string): Promise<OtpVerifyResult<T>> {
  const rows = await db
    .select()
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.registrationToken, token),
        eq(otpVerifications.used, false),
        gt(otpVerifications.expiresAt, new Date())
      )
    );

  if (rows.length === 0) {
    return { ok: false, error: "Code expired or already used. Please start again.", status: 400 };
  }

  const row = rows[0];
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Please start again.", status: 429 };
  }

  const valid = await verifyOtpCode(code, row.codeHash);
  if (!valid) {
    await db
      .update(otpVerifications)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpVerifications.registrationToken, token));
    return { ok: false, error: "Incorrect code", status: 400 };
  }

  await db
    .update(otpVerifications)
    .set({ used: true })
    .where(eq(otpVerifications.registrationToken, token));

  return { ok: true, payload: JSON.parse(row.registrationPayload) as T };
}
