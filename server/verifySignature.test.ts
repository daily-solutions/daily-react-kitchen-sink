import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifySignature } from "./verifySignature.ts";

// Sign a raw body the same way Daily does, so we can prove verifySignature
// accepts a valid signature and rejects tampered ones. (The live end-to-end test
// against a real Daily webhook is the byte-for-byte proof; this locks the
// algorithm.)
const secret = Buffer.from("super-secret-value").toString("base64");
const timestamp = "1708972279";
const rawBody = JSON.stringify({
  version: "1.0.0",
  type: "participant.joined",
  payload: { room: "test", session_id: "abc", user_name: "sam" },
  event_ts: 1708972279.961,
});

function sign(ts: string, body: string, base64Secret: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(base64Secret, "base64"))
    .update(`${ts}.${body}`)
    .digest("base64");
}

test("accepts a valid signature", () => {
  const sig = sign(timestamp, rawBody, secret);
  assert.equal(verifySignature(timestamp, rawBody, secret, sig), true);
});

test("rejects a tampered body", () => {
  const sig = sign(timestamp, rawBody, secret);
  const tampered = rawBody.replace("sam", "eve");
  assert.equal(verifySignature(timestamp, tampered, secret, sig), false);
});

test("rejects a wrong timestamp", () => {
  const sig = sign(timestamp, rawBody, secret);
  assert.equal(verifySignature("0", rawBody, secret, sig), false);
});

test("rejects a wrong secret", () => {
  const sig = sign(timestamp, rawBody, secret);
  const otherSecret = Buffer.from("different").toString("base64");
  assert.equal(verifySignature(timestamp, rawBody, otherSecret, sig), false);
});
