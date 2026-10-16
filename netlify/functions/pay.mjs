// Starts a Paystack payment for an applicant and returns the Paystack checkout address.
import { deps, dbRpc, paystack, json } from "../lib/paystack.mjs";

export async function handlePay(req, d) {
  if (req.method !== "POST") return json(405, { message: "Use POST." });
  const { ref, token, plan } = await req.json().catch(() => ({}));
  if (!ref || !token) return json(400, { message: "Open this page from your application link." });
  if (!d.env.PAYSTACK_SECRET_KEY || !d.env.SUPABASE_SECRET_KEY) {
    return json(503, { message: "Online payment isn't switched on yet. Please reply to your offer email and Admissions will help." });
  }
  let p;
  try { p = await dbRpc("pay_prepare", { p_ref: String(ref), p_token: String(token), p_plan: plan || null }, d); }
  catch (e) { const mine = [400, 404].includes(e.status); return json(mine ? 400 : 502, { message: mine ? e.message : "We couldn't start the payment. Please try again." }); }
  const origin = new URL(req.url).origin;
  const back = `${origin}/.netlify/functions/pay-return?reference=${encodeURIComponent(p.reference)}`;
  const init = await paystack("/transaction/initialize", {
    method: "POST",
    body: {
      email: p.email, amount: p.amount * 100, currency: "NGN", reference: p.reference, callback_url: back,
      metadata: {
        cancel_action: back,
        app_ref: p.ref, part: p.part,
        custom_fields: [
          { display_name: "Applicant", variable_name: "applicant", value: p.name },
          { display_name: "Application", variable_name: "application", value: p.ref },
          { display_name: "Payment", variable_name: "payment", value: { full: "Full fee", part1: "Instalment 1 of 2", part2: "Instalment 2 of 2" }[p.part] },
        ],
      },
    },
  }, d);
  if (!init.status || !init.data?.authorization_url) {
    console.error("paystack initialize failed", init.message);
    return json(502, { message: "Paystack couldn't start the payment. Please try again in a minute." });
  }
  return json(200, { url: init.data.authorization_url });
}

export default (req) => handlePay(req, deps());
