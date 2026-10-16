// Creates (or resets) a student's portal login from their private application link.
// The login is a private address made from the matric number, so no Supabase emails are needed.
import { deps, dbRpc, json } from "../lib/paystack.mjs";

const DEFAULT_SUPABASE_URL = "https://xchhmaoplnarryksoqxr.supabase.co";

async function authAdmin(path, method, body, { env, fetchFn }) {
  const url = `${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/auth/v1/admin${path}`;
  const send = (headers) => fetchFn(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let r = await send({ apikey: env.SUPABASE_SECRET_KEY });
  if (r.status === 401 || r.status === 403) r = await send({ apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// A login with this address may already exist (e.g. a matric number reused after test data was cleared).
async function findUserId(email, d) {
  for (let page = 1; page <= 50; page++) {
    const r = await authAdmin(`/users?page=${page}&per_page=200`, "GET", undefined, d);
    const users = r.data?.users || [];
    const u = users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u.id;
    if (!r.ok || users.length < 200) return null;
  }
  return null;
}

export async function handleAccount(req, d) {
  if (req.method !== "POST") return json(405, { message: "Use POST." });
  const { ref, token, password } = await req.json().catch(() => ({}));
  if (!ref || !token) return json(400, { message: "Open this page from your application link." });
  if (typeof password !== "string" || password.length < 8 || !/\d/.test(password)) return json(400, { message: "Use at least 8 characters, including a number." });
  if (!d.env.SUPABASE_SECRET_KEY) return json(503, { message: "Student accounts aren't switched on yet." });
  let a;
  try { a = await dbRpc("student_account_prepare", { p_ref: String(ref), p_token: String(token) }, d); }
  catch (e) { return json([400, 404].includes(e.status) ? 400 : 502, { message: [400, 404].includes(e.status) ? e.message : "Something went wrong. Please try again." }); }
  let uid = a.uid;
  if (uid) {
    const r = await authAdmin(`/users/${uid}`, "PUT", { password }, d);
    if (!r.ok && r.status !== 404) { console.error("student update", r.status, r.data); return json(502, { message: "We couldn't save your password. Please try again." }); }
    if (r.status === 404) uid = null;   // login was removed; make a new one
  }
  if (!uid) {
    const r = await authAdmin("/users", "POST", { email: a.login, password, email_confirm: true, user_metadata: { matric: a.matric, role: "student" } }, d);
    if (r.ok) uid = r.data.id || r.data.user?.id;
    else if (r.status === 422) {
      uid = await findUserId(a.login, d);
      const u = uid && await authAdmin(`/users/${uid}`, "PUT", { password, email_confirm: true }, d);
      if (!u?.ok) { console.error("student reuse", r.status, u?.status); uid = null; }
    }
    if (!uid) { console.error("student create", r.status, r.data); return json(502, { message: "We couldn't create your account. Please try again, or reply to your admission email." }); }
  }
  await dbRpc("student_account_saved", { p_ref: String(ref), p_token: String(token), p_uid: uid }, d);
  return json(200, { login: a.login, matric: a.matric });
}

export default (req) => handleAccount(req, deps());
