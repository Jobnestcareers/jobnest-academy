// Every minute: expires unpaid offers, queues reminders (admissions and student portal), then sends queued emails.
// Needs these Netlify environment variables (Site configuration → Environment variables):
//   RESEND_API_KEY        secret key from resend.com
//   SUPABASE_SECRET_KEY   Supabase secret key (sb_secret_...) — never put this in the code
//   EMAIL_FROM            optional, e.g. Jobnest Academy Admissions <admissions@jobnestcareers.com>
//   EMAIL_REPLY_TO        optional, e.g. info@jobnestcareers.com
import { buildEmail } from "./email-template.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xchhmaoplnarryksoqxr.supabase.co";
const MAX_ATTEMPTS = 3;

export async function sendQueued({ fetchFn = fetch, env = process.env, limit = 20 } = {}) {
  const key = env.SUPABASE_SECRET_KEY, resend = env.RESEND_API_KEY;
  if (!key || !resend) return { skipped: "missing RESEND_API_KEY or SUPABASE_SECRET_KEY" };
  const db = (path, init = {}) => fetchFn(`${env.SUPABASE_URL || SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal", ...(init.headers || {}) },
  });
  // Expire unpaid offers and queue reminders first, so those emails go out in this run.
  let jobs = null;
  try { const t = await db("rpc/jobs_tick", { method: "POST", body: "{}", headers: { Prefer: "return=representation" } }); jobs = t.ok ? await t.json().catch(() => null) : `jobs ${t.status}`; }
  catch (e) { jobs = String(e.message || e); }
  // Student reminders (deadlines, check-ins, new weeks, live classes): alerts in the portal plus emails.
  try { const t = await db("rpc/learn_reminders_tick", { method: "POST", body: "{}", headers: { Prefer: "return=representation" } }); jobs = { jobs, reminders: t.ok ? await t.json().catch(() => null) : `reminders ${t.status}` }; }
  catch (e) { jobs = { jobs, reminders: String(e.message || e) }; }
  const res = await db(`outbox?select=id,to_email,subject,body,link,cta,attempts&sent_at=is.null&attempts=lt.${MAX_ATTEMPTS}&order=created_at.asc&limit=${limit}`);
  if (!res.ok) return { error: `Could not read the outbox: ${res.status} ${await res.text()}` };
  const rows = await res.json();
  let sent = 0, failed = 0;
  for (const m of rows) {
    const { html, text } = buildEmail(m);
    let error = null;
    try {
      const r = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": `jobnest-outbox-${m.id}` },
        body: JSON.stringify({
          from: env.EMAIL_FROM || "Jobnest Academy Admissions <admissions@jobnestcareers.com>",
          to: [m.to_email], subject: m.subject, html, text,
          ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
        }),
      });
      if (!r.ok) error = `Resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    const patch = error ? { attempts: m.attempts + 1, error } : { sent_at: new Date().toISOString(), error: null, attempts: m.attempts + 1 };
    await db(`outbox?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    error ? failed++ : sent++;
  }
  return { jobs, checked: rows.length, sent, failed };
}

export default async () => {
  const result = await sendQueued();
  console.log("send-emails", JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "* * * * *" };
