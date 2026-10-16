// Shared by the payment functions. Keys come from Netlify environment variables only:
//   PAYSTACK_SECRET_KEY   sk_test_… while testing, sk_live_… when Paystack activates the account
//   SUPABASE_SECRET_KEY   sb_secret_…
const DEFAULT_SUPABASE_URL = "https://xchhmaoplnarryksoqxr.supabase.co";

export const deps = () => ({ env: process.env, fetchFn: fetch });

export async function dbRpc(fn, args, { env, fetchFn }) {
  const r = await fetchFn(`${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const err = new Error((data && data.message) || `Database error ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

export async function paystack(path, { method = "GET", body } = {}, { env, fetchFn }) {
  const r = await fetchFn(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return data || { status: false, message: `Paystack ${r.status}` };
}

// Asks Paystack what really happened to a payment, then records it. Never trusts the browser.
export async function verifyAndRecord(reference, d) {
  const v = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, {}, d);
  if (!v.status || !v.data) throw new Error(`Paystack could not verify ${reference}: ${v.message || "no data"}`);
  const t = v.data;
  const ok = t.status === "success" && t.currency === "NGN" && t.reference === reference;
  return dbRpc("pay_result", {
    p_reference: reference,
    p_status: ok ? "success" : (t.status || "failed"),
    p_amount_kobo: ok ? Number(t.amount) : 0,
    p_channel: t.channel || null,
    p_provider_id: t.id != null ? String(t.id) : null,
  }, d);
}

export const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
