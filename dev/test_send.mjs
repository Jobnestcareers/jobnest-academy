// Tests the email sender with fake Supabase and Resend responses.
import { sendQueued } from "../netlify/functions/send-emails.mjs";
import { buildEmail } from "../netlify/functions/email-template.mjs";
const calls = [];
const rows = [{ id: 1, to_email: "a@test.ng", subject: "Hi <Ada>", body: "Hi Ada,\n\nLine one.\nLine two.\n\nBye", link: "https://x/#/a/APP-1/t", cta: "Take the readiness assessment", attempts: 0 },
              { id: 2, to_email: "bad@test.ng", subject: "Two", body: "x", link: null, cta: null, attempts: 2 }];
const fetchFn = async (url, init = {}) => {
  calls.push([init.method || "GET", url, init.headers, init.body]);
  if (url.includes("/rest/v1/outbox?select")) return new Response(JSON.stringify(rows), { status: 200 });
  if (url.includes("api.resend.com")) { const b = JSON.parse(init.body); return b.to[0].startsWith("bad") ? new Response("nope", { status: 422 }) : new Response("{}", { status: 200 }); }
  return new Response(null, { status: 204 });
};
console.log(await sendQueued({ fetchFn, env: {} }));
console.log(await sendQueued({ fetchFn, env: { SUPABASE_SECRET_KEY: "sb_secret_x", RESEND_API_KEY: "re_x", EMAIL_REPLY_TO: "info@j.com" } }));
for (const c of calls) console.log(c[0], c[1].slice(0, 90), c[3] ? c[3].slice(0, 120) : "");
const { html, text } = buildEmail(rows[0]);
console.log(html.includes("Hi &lt;Ada&gt;") || html.includes("Line one.<br>Line two."), text);
