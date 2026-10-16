// Local stand-in for Netlify functions + a fake Paystack checkout, for testing only.
// The real handlers run unchanged; only api.paystack.co is faked.
import http from "node:http";
import { handlePay } from "../netlify/functions/pay.mjs";
import { handleReturn } from "../netlify/functions/pay-return.mjs";
import { handleWebhook } from "../netlify/functions/paystack-webhook.mjs";

const SITE = process.env.SITE || "http://localhost:8787";
const env = { SUPABASE_URL: SITE, SUPABASE_SECRET_KEY: "sb_secret_local", PAYSTACK_SECRET_KEY: "sk_test_local" };
const tx = {};   // reference -> { amount, email, status }
const fakeFetch = async (url, init = {}) => {
  if (!url.startsWith("https://api.paystack.co")) return fetch(url, init);
  const path = url.replace("https://api.paystack.co", "");
  if (path === "/transaction/initialize") {
    const b = JSON.parse(init.body);
    tx[b.reference] = { amount: b.amount, email: b.email, status: "abandoned", back: b.callback_url };
    return Response.json({ status: true, data: { authorization_url: `${SITE}/.netlify/functions/fake-checkout?reference=${b.reference}` } });
  }
  const ref = decodeURIComponent(path.split("/").pop());
  const t = tx[ref];
  if (!t) return Response.json({ status: false, message: "Transaction reference not found" }, { status: 400 });
  return Response.json({ status: true, data: { status: t.status, amount: t.amount, currency: "NGN", reference: ref, channel: "card", id: 1000 + Object.keys(tx).indexOf(ref) } });
};
const d = { env, fetchFn: fakeFetch };

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url, SITE);
  const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
  let out;
  const name = url.pathname.replace("/.netlify/functions/", "");
  if (name === "pay") out = await handlePay(request, d);
  else if (name === "pay-return") out = await handleReturn(request, d);
  else if (name === "paystack-webhook") out = await handleWebhook(request, d);
  else if (name === "fake-checkout") {
    const ref = url.searchParams.get("reference"), t = tx[ref], act = url.searchParams.get("do");
    if (act) { t.status = act === "pay" ? "success" : "abandoned"; out = new Response(null, { status: 302, headers: { Location: t.back } }); }
    else out = new Response(`<!doctype html><title>Fake Paystack</title><h1>Fake Paystack checkout</h1><p>${t.email} · ₦${(t.amount / 100).toLocaleString()}</p><a id="fake-pay" href="?reference=${ref}&do=pay">Pay</a> <a id="fake-cancel" href="?reference=${ref}&do=cancel">Cancel</a>`, { headers: { "Content-Type": "text/html" } });
  } else out = new Response("not found", { status: 404 });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(8788, "127.0.0.1", () => console.log("functions on 8788"));
