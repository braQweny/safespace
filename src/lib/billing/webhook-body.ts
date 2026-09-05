import Stripe from "stripe";
import { BillingError } from "./config";
export const BILLING_WEBHOOK_LIMIT_BYTES = 256 * 1024;
export async function readBillingWebhookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new BillingError("invalid_webhook");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    // Stream terminates on reader.done; the size cap cancels unbounded input.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BILLING_WEBHOOK_LIMIT_BYTES) {
        await reader.cancel();
        throw new BillingError("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
export async function verifyBillingEvent(stripe: Stripe, request: Request, secret: string) {
  const body = await readBillingWebhookBody(request);
  try {
    return await stripe.webhooks.constructEventAsync(
      body,
      request.headers.get("stripe-signature") ?? "",
      secret,
      300,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    throw new BillingError("invalid_webhook");
  }
}
