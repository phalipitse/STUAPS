import crypto from "node:crypto";
import bcrypt from "bcryptjs";

export type OtpChannel = "email" | "sms";

export function generateOtpCode(): string {
  // 6-digit numeric code, zero-padded.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 8);
}

export function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

interface SendResult {
  ok: boolean;
  provider: string;
}

/**
 * Sends an OTP code to an email address. Uses SendGrid when SENDGRID_API_KEY is
 * configured; otherwise falls back to logging the code to the server console so
 * registration is testable in dev/CI without real credentials.
 */
export async function sendOtpEmail(to: string, code: string): Promise<SendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(`[otp:dev-console] email OTP for ${to}: ${code}`);
    return { ok: true, provider: "console" };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: "Your verification code",
      content: [
        {
          type: "text/plain",
          value: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid send failed (${response.status}): ${body}`);
  }
  return { ok: true, provider: "sendgrid" };
}

/**
 * Sends a username reminder to an email address. Uses SendGrid when configured;
 * otherwise falls back to logging to the server console, same as sendOtpEmail.
 */
export async function sendUsernameEmail(to: string, username: string): Promise<SendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(`[otp:dev-console] username reminder for ${to}: ${username}`);
    return { ok: true, provider: "console" };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: "Your username",
      content: [
        {
          type: "text/plain",
          value: `Your username is: ${username}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid send failed (${response.status}): ${body}`);
  }
  return { ok: true, provider: "sendgrid" };
}

/**
 * Sends an OTP code via SMS. Uses Africa's Talking when AFRICASTALKING_API_KEY is
 * configured; otherwise falls back to logging the code to the server console.
 */
export async function sendOtpSms(to: string, code: string): Promise<SendResult> {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;

  if (!apiKey || !username) {
    console.log(`[otp:dev-console] SMS OTP for ${to}: ${code}`);
    return { ok: true, provider: "console" };
  }

  const body = new URLSearchParams({
    username,
    to,
    message: `Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    ...(process.env.AFRICASTALKING_SENDER_ID
      ? { from: process.env.AFRICASTALKING_SENDER_ID }
      : {}),
  });

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Africa's Talking send failed (${response.status}): ${responseBody}`);
  }
  return { ok: true, provider: "africastalking" };
}
