// Turns a queued email (plain text + link) into a branded HTML email and a plain-text version.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// [Link text](https://…) in a template becomes a link; empty links (no address set) are dropped.
const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
const htmlLinks = (escaped) => escaped.replace(LINK, (_, t, u) => /^https?:\/\//i.test(u) ? `<a href="${u}" style="color:#0B5E53;font-weight:700">${t}</a>` : "");
const textLinks = (p) => p.replace(LINK, (_, t, u) => /^https?:\/\//i.test(u) ? `${t}: ${u}` : "");

export function buildEmail(m) {
  // Links saved as https://site/#/path go out as clean https://site/path.
  m = { ...m, link: m.link ? String(m.link).replace(/\/#\//, "/") : m.link, body: String(m.body || "").replace(/(https?:\/\/[^\s)]+?)\/#\//g, "$1/") };
  const paras = String(m.body || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && textLinks(p).trim());
  // Applicant emails link to #/a/APP-XXXXXX/...: show the application number and how to come back without the link.
  const refM = String(m.link || "").match(/(?:#\/|\.[a-z]+\/)a\/((?:APP-[A-Z0-9]+)|(?:JNA-\d{2}-\d{6}))\//i);
  const ref = refM ? refM[1].toUpperCase() : "";
  let site = "academy.jobnestcareers.com";
  try { if (m.link) site = new URL(m.link).host; } catch { /* keep default */ }
  const refTop = ref ? `<tr><td style="font-family:Arial,sans-serif;font-size:13px;color:#55677A;padding-bottom:14px">Application number: <b style="color:#10263D;font-size:15px;letter-spacing:.5px">${esc(ref)}</b></td></tr>` : "";
  const refHelp = ref ? `<tr><td style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#55677A;padding-bottom:16px">To come back any time, go to ${esc(site)}, choose <b>Continue an application</b>, and enter <b>${esc(ref)}</b> with your surname.</td></tr>` : "";
  const button = m.link
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(m.link)}" style="display:inline-block;background:#F4B740;color:#10263D;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">${esc(m.cta || "Open your application")}</a></td></tr>${refHelp}` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F4F7F6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;border:1px solid #D4E0DE">
<tr><td style="background:#10263D;border-radius:14px 14px 0 0;padding:18px 24px;font-family:Arial,sans-serif;font-size:17px;font-weight:700;color:#FFFFFF">
<span style="display:inline-block;width:22px;height:22px;background:#0F7B6C;border-radius:6px;vertical-align:middle;margin-right:8px"></span>Jobnest Academy</td></tr>
<tr><td style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${refTop}${paras.map((p) => `<tr><td style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#10263D;padding-bottom:14px">${htmlLinks(esc(p)).replace(/\n/g, "<br>")}</td></tr>`).join("")}
${button}
<tr><td style="font-family:Arial,sans-serif;font-size:15px;color:#10263D">The Jobnest Academy Admissions team</td></tr>
</table></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #D4E0DE;font-family:Arial,sans-serif;font-size:12px;color:#55677A">Jobnest Academy · jobnestcareers.com · You're receiving this because you applied to a Jobnest Academy programme.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${ref ? `Application number: ${ref}\n\n` : ""}${paras.map(textLinks).join("\n\n")}${m.link ? `\n\n${m.cta || "Open your application"}: ${m.link}` : ""}${ref ? `\n\nTo come back any time, go to ${site}, choose Continue an application, and enter ${ref} with your surname.` : ""}\n\nThe Jobnest Academy Admissions team`;
  return { html, text };
}
