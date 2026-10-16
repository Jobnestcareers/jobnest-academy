// Talks to Supabase: database functions (rpc) and staff sign-in (auth).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SESSION_KEY = "jn.session";
let session = read();

function read() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function keep(s) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}
const site = () => location.origin + location.pathname;

async function call(path, { method = "POST", body, token, query = "" } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}${query}`, {
    method,
    // The public key goes in "apikey" only; "Authorization" carries a signed-in staff member's session.
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.msg || data.error_description || data.error)) || "Something went wrong. Please try again.";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function saveTokens(d) {
  if (!d || !d.access_token) return null;
  const expires_at = d.expires_at || Math.floor(Date.now() / 1000) + (+d.expires_in || 3600);
  keep({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at, email: d.user?.email || session?.email || null });
  return session;
}

async function fresh() {
  if (!session) return null;
  if (session.expires_at * 1000 > Date.now() + 60_000) return session;
  try {
    const d = await call("/auth/v1/token", { query: "?grant_type=refresh_token", body: { refresh_token: session.refresh_token } });
    return saveTokens(d);
  } catch {
    keep(null);
    return null;
  }
}

export async function rpc(fn, args = {}) {
  const s = await fresh();
  return call(`/rest/v1/rpc/${fn}`, { body: args, token: s?.access_token });
}

export const auth = {
  get session() { return session; },
  async signIn(email, password) {
    const d = await call("/auth/v1/token", { query: "?grant_type=password", body: { email, password } });
    return saveTokens(d);
  },
  async signUp(email, password) {
    const d = await call("/auth/v1/signup", { query: `?redirect_to=${encodeURIComponent(site() + "#/staff")}`, body: { email, password } });
    if (d && d.access_token) saveTokens(d);
    return d;
  },
  async recover(email) {
    return call("/auth/v1/recover", { query: `?redirect_to=${encodeURIComponent(site() + "#/staff/new-password")}`, body: { email } });
  },
  async setPassword(password) {
    const s = await fresh();
    return call("/auth/v1/user", { method: "PUT", body: { password }, token: s?.access_token });
  },
  async signOut() {
    const s = session;
    keep(null);
    if (s) { try { await call("/auth/v1/logout", { token: s.access_token }); } catch { /* already gone */ } }
  },
  // After a sign-up confirmation or password-reset email, Supabase returns to the
  // site with the session in the address: #access_token=...&refresh_token=...&type=...
  takeFromUrl() {
    const h = location.hash.replace(/^#/, "");
    if (!h.includes("access_token=") && !h.includes("error=")) return null;
    const p = new URLSearchParams(h);
    if (p.get("error")) return { error: p.get("error_description") || p.get("error") };
    saveTokens({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: p.get("expires_in"), expires_at: +p.get("expires_at") || undefined });
    return { type: p.get("type") || "signin" };
  },
};
