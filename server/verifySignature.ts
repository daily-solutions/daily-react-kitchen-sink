import crypto from "node:crypto";

/**
 * Verify a Daily webhook signature.
 *
 * Daily sends two headers with each event POST: X-Webhook-Timestamp and
 * X-Webhook-Signature. The signature is an HMAC-SHA256, base64-encoded, computed
 * over `timestamp + "." + JSON.stringify(body)` using the base64-decoded hmac
 * secret that /webhooks returned when the webhook was created.
 *
 * See https://docs.daily.co/reference/rest-api/webhooks#webhook-structure
 */
export function verifySignature(
  timestamp: string,
  body: unknown,
  base64Secret: string,
  providedSignature: string,
): boolean {
  const signedContent = `${timestamp}.${JSON.stringify(body)}`;
  const secret = Buffer.from(base64Secret, "base64");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("base64");

  const a = Buffer.from(computed);
  const b = Buffer.from(providedSignature);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
