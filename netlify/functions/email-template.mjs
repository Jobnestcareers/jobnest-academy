// Turns a queued email (plain text + link) into a branded HTML email and a plain-text version.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function buildEmail(m) {
  const paras = String(m.body || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const button = m.link
    ? `<tr><td style="padding:8px 0 24px"><a href="${esc(m.link)}" style="display:inline-block;background:#F4B740;color:#10263D;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">${esc(m.cta || "Open your application")}</a></td></tr>
       <tr><td style="font-family:Arial,sans-serif;font-size:12px;color:#55677A;padding-bottom:16px">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(m.link)}</span></td></tr>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F4F7F6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;border:1px solid #D4E0DE">
<tr><td style="background:#10263D;border-radius:14px 14px 0 0;padding:18px 24px;font-family:Arial,sans-serif;font-size:17px;font-weight:700;color:#FFFFFF">
<span style="display:inline-block;width:22px;height:22px;background:#0F7B6C;border-radius:6px;vertical-align:middle;margin-right:8px"></span>Jobnest Academy</td></tr>
<tr><td style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${paras.map((p) => `<tr><td style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#10263D;padding-bottom:14px">${esc(p).replace(/\n/g, "<br>")}</td></tr>`).join("")}
${button}
<tr><td style="font-family:Arial,sans-serif;font-size:15px;color:#10263D">The Jobnest Academy Admissions team</td></tr>
</table></td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #D4E0DE;font-family:Arial,sans-serif;font-size:12px;color:#55677A">Jobnest Academy · jobnestcareers.com · You're receiving this because you applied to a Jobnest Academy programme.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${paras.join("\n\n")}${m.link ? `\n\n${m.cta || "Open your application"}: ${m.link}` : ""}\n\nThe Jobnest Academy Admissions team`;
  return { html, text };
}
