import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyStripeSignature } from "./integrations.js";

const secret = "whsec_cineverse_test_secret";
const payload = Buffer.from(JSON.stringify({ id: "evt_test_123", type: "checkout.session.completed" }));

function signatureFor(timestamp: number, body: Buffer): string {
  const digest = createHmac("sha256", secret).update(String(timestamp) + ".").update(body).digest("hex");
  return "t=" + timestamp + ",v1=" + digest;
}

test("Stripe signature accepts a valid raw body", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature(payload, signatureFor(timestamp, payload), secret), true);
});

test("Stripe signature rejects a modified payload", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  assert.equal(verifyStripeSignature(Buffer.from(payload.toString() + " "), signatureFor(timestamp, payload), secret), false);
});

test("Stripe signature rejects stale timestamps", () => {
  const timestamp = Math.floor(Date.now() / 1000) - 600;
  assert.equal(verifyStripeSignature(payload, signatureFor(timestamp, payload), secret), false);
});

test("Stripe signature rejects malformed headers", () => {
  assert.equal(verifyStripeSignature(payload, "v1=invalid", secret), false);
});
