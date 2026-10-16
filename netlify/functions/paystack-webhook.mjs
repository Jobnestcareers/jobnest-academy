// Paystack calls this when a payment succeeds, even if the applicant closed the page.
// Set it in Paystack → Settings → API Keys & Webhooks → Webhook URL:
//   https://academy.jobnestcareers.com/.netlify/functions/paystack-webhook
import crypto from "node:crypto";
import { deps, verifyAndRecord } from "../lib/paystack.mjs";

export async function handleWebhook(req, d) {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  const key = d.env.PAYSTACK_SECRET_KEY || "";
  const sig = req.headers.get("x-paystack-signature") || "";
  const expect = crypto.createHmac("sha512", key).update(raw).digest("hex");
  if (!key || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return new Response("bad signature", { status: 401 });
  }
  let ev = {};
  try { ev = JSON.parse(raw); } catch { return new Response("bad body", { status: 400 }); }
  if (ev.event === "charge.success" && ev.data?.reference) {
    try { await verifyAndRecord(String(ev.data.reference), d); }
    catch (e) {
      // Payments for something else on the same Paystack account: acknowledge and ignore.
      if (/Unknown payment reference/.test(e.message)) return new Response("ignored");
      console.error("paystack-webhook", ev.data.reference, e.message);
      return new Response("retry later", { status: 500 });   // Paystack retries
    }
  }
  return new Response("ok");
}

export default (req) => handleWebhook(req, deps());
