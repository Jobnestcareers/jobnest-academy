// Webhook: rejects bad signatures, ignores unknown references, records real ones (fake Paystack verify).
import crypto from "node:crypto";
import { handleWebhook } from "../netlify/functions/paystack-webhook.mjs";
import { handlePay } from "../netlify/functions/pay.mjs";
const env = { SUPABASE_URL: "http://localhost:8787", SUPABASE_SECRET_KEY: "sb_secret_local", PAYSTACK_SECRET_KEY: "sk_test_local" };
const verified = {};
const fetchFn = async (url, init) => url.startsWith("https://api.paystack.co/transaction/verify/")
  ? Response.json({ status: true, data: verified[decodeURIComponent(url.split("/").pop())] || { status: "failed" } })
  : fetch(url, init);
const d = { env, fetchFn };
const send = (body, key = env.PAYSTACK_SECRET_KEY) => {
  const raw = JSON.stringify(body);
  return handleWebhook(new Request("http://x/hook", { method: "POST", body: raw, headers: { "x-paystack-signature": crypto.createHmac("sha512", key).update(raw).digest("hex") } }), d);
};
let r = await send({ event: "charge.success", data: { reference: "x" } }, "wrong-key"); console.log("bad signature:", r.status);
r = await send({ event: "charge.success", data: { reference: "SOMETHING-ELSE" } }); console.log("unknown ref:", r.status, await r.text());
const [ref, token] = process.argv.slice(2);
const pay = await handlePay(new Request("http://localhost:8787/.netlify/functions/pay", { method: "POST", body: JSON.stringify({ ref, token, plan: "full" }) }), { env, fetchFn: async (u, i) => u.includes("/transaction/initialize") ? Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc" } }) : fetch(u, i) });
console.log("pay start:", pay.status, JSON.stringify(await pay.json()));
const no = await handlePay(new Request("http://localhost:8787/.netlify/functions/pay", { method: "POST", body: JSON.stringify({ ref, token, plan: "full" }) }), { env: { ...env, PAYSTACK_SECRET_KEY: "" }, fetchFn });
console.log("not switched on:", no.status, (await no.json()).message);
const bad = await handlePay(new Request("http://localhost:8787/.netlify/functions/pay", { method: "POST", body: JSON.stringify({ ref, token: "00000000-0000-0000-0000-000000000000", plan: "full" }) }), d);
console.log("wrong token:", bad.status, (await bad.json()).message);
