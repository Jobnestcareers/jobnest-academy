// Jobnest Academy web app: public Academy site, applicant journey, staff portals.
import { rpc, auth } from "./api.js";
import { NG } from "./ng.js";
import { COUNTRIES, flag } from "./countries.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
const TZ = "Africa/Lagos";
const fmt = (d, o) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o }).format(new Date(d));
const fmtDay = (d) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
const fmtLong = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (d) => fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtAt = (d) => `${fmtDay(d)}, ${fmtTime(d)}`;
const fmtDate = (d) => fmt(d, { day: "numeric", month: "long", year: "numeric" });
const naira = (n) => "₦" + Math.round(n).toLocaleString("en-NG");
const fmtDateD = (iso) => fmt(iso + "T12:00:00Z", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const gcalStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const gcalUrl = (start, mins, title, details, loc) => "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) +
  "&dates=" + gcalStamp(start) + "/" + gcalStamp(new Date(new Date(start).getTime() + mins * 60000)) + "&details=" + encodeURIComponent(details || "") + "&location=" + encodeURIComponent(loc || "");
const balanceOf = (a) => a.plan && a.fees ? Math.max(0, (a.fees.plan_total || 0) - (a.paid_total || 0)) : 0;
const MY_APP = "jn.myapp";

const LOGO = `<svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="#0F7B6C"/><path d="M8 20c1.5 6 18.5 6 20 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="18" cy="14" r="4.2" fill="#F4B740"/></svg>`;
const ROUTE_STOPS = [["Week 1", "Orientation"], ["Weeks 2–3", "The Fundamentals"], ["Weeks 4–7", "Core Skill Learning"], ["Weeks 8–9", "Client Project"],
  ["Weeks 10–13", "Internship"], ["Week 14", "CV, LinkedIn & Portfolio"], ["Week 15", "Discovery Call 2"], ["Weeks 16–17", "Job Search & Personal Pitch"]];
const STAGES_APP = ["Submitted", "Assessment", "Discovery Call", "Offer", "Payment", "Admitted"];
const APP_STAGE = { "Assessment pending": 1, "Assessment failed": 1, "Call to book": 2, "Call booked": 2, "Closed: no matching track": 2, "Under review": 3,
  "Offer sent": 3, "Waitlisted": 3, "Not selected": 3, "Offer expired": 3, "Offer declined": 3, "Deferred": 3, "Admitted": 5 };
const BAD_ST = ["Assessment failed", "Not selected", "Offer expired", "Offer declined", "Closed: no matching track"];
const GROUPS = [
  ["needs", "In progress", "Calls and decisions under way", (a) => ["Call booked", "Under review"].includes(a.status)],
  ["waiting", "Waiting on applicant", "Assessment, booking or payment", (a) => ["Assessment pending", "Call to book", "Offer sent", "Waitlisted"].includes(a.status)],
  ["admitted", "Admitted", "Paid and given a matric number", (a) => a.status === "Admitted"],
  ["closed", "Closed", "Not continuing this batch", (a) => BAD_ST.includes(a.status) || a.status === "Deferred"],
];
const groupOf = (a) => (GROUPS.find((g) => g[3](a)) || GROUPS[1])[0];
const REC_L = { offer: "Offer a place", waitlist: "Waitlist", decline: "Decline" };
const REC_X = { offer: "offer", waitlist: "waitlist", decline: "reject" };
const INTERESTS = ["Software development", "UX / UI design", "Product management", "Cybersecurity", "Project management", "Graphic design"];
const ROLE_NAMES = { super: "Super Admin", adm_admin: "Admissions Admin", adm_officer: "Admissions Officer", director: "Programme Director",
  cohort_manager: "Cohort Manager", facilitator: "Facilitator", coach: "Career Coach", academy_admin: "Academy Admin" };
const CALL_TIMES = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];

let INFO = null;
let ME = null;
const ui = { admG: "needs", q: "", open: null, pick: null, busy: false };

/* ---------- small helpers ---------- */
function toast(msg) {
  const t = $("#toast");
  t.innerHTML = `<span class="tb-msg"></span><button type="button" class="tb-x" aria-label="Close">×</button><i class="tb-bar"></i>`;
  t.querySelector(".tb-msg").textContent = msg;
  t.hidden = false;
  const bar = t.querySelector(".tb-bar"); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
  clearTimeout(toast.t); toast.left = 5000; toast.start = Date.now();
  const hide = () => { t.hidden = true; clearTimeout(toast.t); };
  const run = () => { toast.start = Date.now(); toast.t = setTimeout(hide, toast.left); bar.style.animationPlayState = "running"; };
  const hold = () => { clearTimeout(toast.t); toast.left = Math.max(800, toast.left - (Date.now() - toast.start)); bar.style.animationPlayState = "paused"; };
  t.onpointerenter = hold; t.onpointerdown = hold; t.onpointerleave = run; t.onpointerup = (e) => { if (e.pointerType !== "mouse") run(); };
  t.querySelector(".tb-x").onclick = hide;
  run();
}
const empty = (t) => `<p class="empty">${t}</p>`;
const pill = (s) => `<span class="pill ${s === "Admitted" ? "ok" : BAD_ST.includes(s) ? "bad" : s === "Deferred" ? "" : "now"}">${esc(s)}</span>`;
// Clean addresses: "#/learn/x" (old links) and "/learn/x" both become /learn/x.
const toPath = (h) => "/" + String(h).replace(/^#?\/?/, "");
const go = (h) => { const p = toPath(h); if (location.pathname === p && !location.hash) route(); else { history.pushState(null, "", p); route(); } };
const loading = () => {
  const main = $(".shell-main");
  if (main) { main.classList.add("is-loading"); return; }
  app.innerHTML = `<div class="wrap pub-wrap"><div class="skel" aria-label="Loading"><i></i><i></i><i></i></div></div>`;
};
async function busy(btn, fn) {
  if (ui.busy) return;
  ui.busy = true;
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Please wait…"; }
  try { return await fn(); }
  catch (e) { toast(e.message || "Something went wrong"); throw e; }
  finally { ui.busy = false; if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; } }
}
function saveMyApp(ref, token) { try { localStorage.setItem(MY_APP, JSON.stringify({ ref, token })); } catch { /* ignore */ } }
function myApp() { try { return JSON.parse(localStorage.getItem(MY_APP)); } catch { return null; } }
async function info() { if (!INFO) INFO = await rpc("academy_info"); return INFO; }
const prog = () => (INFO.programmes || []).find((p) => p.code === INFO.cohort?.programme_code) || INFO.programmes?.[0] || {};
const appsOpen = () => !!INFO.cohort?.applications_open;

/* ---------- show / hide passwords ---------- */
const EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
function addEyes() {
  $$("input[type=password]:not([data-eye])").forEach((i) => {
    i.dataset.eye = "1";
    const w = document.createElement("span"); w.className = "pw-wrap"; i.parentNode.insertBefore(w, i); w.appendChild(i);
    const b = document.createElement("button"); b.type = "button"; b.className = "pw-eye"; b.dataset.act = "eye"; b.setAttribute("aria-label", "Show password"); b.innerHTML = EYE; w.appendChild(b);
  });
}
new MutationObserver(addEyes).observe(document.body, { childList: true, subtree: true });

/* ---------- public site ---------- */
function pubHeader(kind = "academy") {
  if (kind === "admissions") {
    return `<header class="pub-top adm-site"><div class="wrap"><a class="logo" href="#/" style="text-decoration:none;color:inherit">${LOGO}Jobnest Admissions</a>
      <nav class="pub-nav">${myApp() ? `<a class="link" href="#/a/${esc(myApp().ref)}/${esc(myApp().token)}">My application</a>` : ""}<a class="btn sm ghost" href="#/">Jobnest Academy</a></nav></div></header>`;
  }
  const links = `<a class="navl" href="#/">Programmes</a><a class="navl" href="#/check">Continue an application</a><a class="navl" href="${esc(INFO?.website_url || "https://jobnestcareers.com")}" style="text-decoration:none">Jobnest.com ↗</a>`;
  return `<header class="pub-top ac-top"><div class="wrap"><a class="logo" href="#/" style="text-decoration:none;color:inherit">${LOGO}Jobnest Academy</a>
    <nav class="pub-nav ac-nav" aria-label="Jobnest Academy">${links}</nav>
    <details class="ac-mnav"><summary aria-label="Open menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>Menu</summary><nav class="ac-mlist">${links}</nav></details></div></header>`;
}
const pubFoot = () => `<footer class="wrap lp-foot"><a class="link" href="#/check">Continue an application</a><a class="link" href="#/verify">Verify a certificate</a><a class="link" href="#/staff">Staff sign-in</a><span class="note">© ${new Date().getFullYear()} Jobnest Services</span></footer>`;

const TEAM = [["Admissions", "Guides you from application to your first day."], ["Programme Director", "Leads the programme and its standards."],
  ["Cohort Manager", "Keeps you on track, week by week."], ["Facilitators", "Teach your track and mark your work."], ["Career Coach", "CV, LinkedIn and your job search."]];
const TRACK_INFO = {
  DAT: ["Turn messy numbers into clear answers.", ["Excel and Google Sheets", "Cleaning and organising data", "Charts and dashboards", "Presenting findings"], ["Junior Data Analyst", "Reporting Assistant"]],
  DMK: ["Grow a brand online.", ["Social media content", "Basic copywriting", "Running small ad campaigns", "Reading the results"], ["Social Media Assistant", "Marketing Assistant"]],
  CSP: ["Help customers and solve problems well.", ["Clear written and spoken replies", "Help-desk tools", "Handling difficult customers", "Tracking and closing issues"], ["Customer Support Associate", "Customer Success Assistant"]],
  ADM: ["Keep a team organised and running.", ["Calendars, email and documents", "Google Workspace and Microsoft 365", "Meeting notes and follow-ups", "Basic records and reporting"], ["Administrative Assistant", "Operations Assistant"]],
};
const part1Of = (p) => Math.ceil((p.inst_total || 0) / 2 / 500) * 500;
const teamOf = () => { try { return JSON.parse(INFO.team || "{}") || {}; } catch { return {}; } };
const FAQ = [["Can I join during NYSC?", "Yes."], ["Do I need experience?", "No. Just basic digital skills and clear communication."],
  ["Will I get a job at the end?", "We can't promise one, but you'll finish with experience, a portfolio and coaching."]];
const TICK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12l5 5 9-9"/></svg>`;

function pageTracks() {
  const p = prog(), T = (INFO.tracks || []).filter((t) => t.open !== false);
  app.innerHTML = pubHeader() + `<section class="wrap pub-wrap tk-page"><div class="tk-head"><h1 class="nl-h1" style="font-size:clamp(2.2rem,5vw,3.4rem)">What you can learn.</h1>
    <p class="nl-lead" style="max-width:52ch">You don't choose now. After you apply, you'll pick your track with us on a short call.</p></div>
    <div class="tk-grid">${T.map((t) => { const [d, learn, roles] = TRACK_INFO[t.code] || ["", [], []];
      return `<article class="tk-card"><span class="pill now" style="align-self:flex-start">Track</span><h2>${esc(t.name)}</h2>${d ? `<p class="note">${d}</p>` : ""}
        ${learn.length ? `<div><b class="tk-lbl">You'll learn</b><ul>${learn.map((x) => `<li>${x}</li>`).join("")}</ul></div>` : ""}
        ${roles.length ? `<div><b class="tk-lbl">Roles it leads to</b><div class="tk-roles">${roles.map((r) => `<span>${r}</span>`).join("")}</div></div>` : ""}</article>`; }).join("") || empty("Tracks will be listed here soon.")}</div>
    ${appsOpen() ? `<div class="actions" style="margin-top:1.5rem"><a class="btn gold lg" href="#/apply">Apply now →</a><a class="btn ghost lg" href="#/">Back to the programme</a></div>` : ""}</section>` + pubFoot();
}
function pagePrograms() {
  const P = INFO.programmes || [];
  app.innerHTML = pubHeader() + `<section class="wrap pub-wrap"><h1 class="nl-h1" style="font-size:clamp(2.2rem,5vw,3.4rem)">Programmes.</h1>
    <div class="tk-grid" style="margin-top:1.5rem">${P.map((x) => { const live = x.status === "Live" && x.code === INFO.cohort?.programme_code;
      return `<article class="tk-card ${live ? "live" : ""}"><span class="pill ${live && appsOpen() ? "ok" : "now"}" style="align-self:flex-start">${live ? (appsOpen() ? "Applications open" : "Applications closed") : esc(x.status === "Live" ? "Open" : "Coming soon")}</span>
        <h2>${esc(x.name)}</h2><span class="mono note">${x.weeks} weeks · online</span><p class="note">${esc(x.tagline || "")}</p>${live ? `<a class="link" href="#/" style="margin-top:auto;font-weight:700">See the programme →</a>` : ""}</article>`; }).join("") || empty("Programmes will be listed here soon.")}</div></section>` + pubFoot();
}

function pageHome() {
  const p = prog(), c = INFO.cohort || {}, open = appsOpen(), weeks = p.weeks || 17, mins = c.assess_minutes || 5;
  const start = c.start_date ? fmt(c.start_date + "T12:00:00Z", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  const mine = myApp();
  app.innerHTML = `<header class="nl-top"><div class="wrap"><a class="logo" href="#/" style="text-decoration:none;color:inherit">${LOGO}Jobnest Academy</a>
      <nav class="nl-nav" aria-label="Jobnest Academy"><a href="#/" data-act="jump" data-k="faq">FAQ</a>${mine ? `<a href="#/a/${esc(mine.ref)}/${esc(mine.token)}">My application</a>` : `<a class="nl-check" href="#/check">Continue an application</a>`}</nav></div></header>
    <section class="nl-hero" id="top"><div class="wrap nl-hero-in">
      <div class="nl-hero-txt">
        <p class="nl-status ${open ? "on" : ""}"><span class="nl-dot"></span>${open ? `Applications open${start ? ` · ${esc(c.name || "Next cohort")} starts ${start}` : ""}` : "Applications are closed for now"}</p>
        <h1 class="nl-h1">From graduate to work-ready.</h1>
        <p class="nl-lead">In ${weeks} weeks, learn a skill employers pay for, deliver a real client project, intern with a company, and get coached through your job search. All online.</p>
        ${open ? `<div class="actions"><a class="btn gold lg" href="#/apply">Apply now →</a>${INFO.zuri_url ? `<a class="btn ghost lg nl-ghost" href="${esc(INFO.zuri_url)}" target="_blank" rel="noopener">Not sure yet? Talk to Zuri</a>` : ""}</div>`
          : `<p class="note">Applications for the next cohort will open soon. Check back here.</p>`}
      </div>
      <div class="nl-art" aria-hidden="true">
        <div class="nl-card nl-c1"><span class="nl-eyebrow">Your route · Week 8 of ${weeks}</span><div class="nl-bars"><i class="d"></i><i class="d"></i><i class="n"></i><i></i></div><div class="nl-bl"><span>Learn</span><span>Skills</span><span class="b">Project</span><span>Intern</span></div></div>
        <div class="nl-card nl-c2"><span class="nl-time">10:00</span><span class="nl-c2t"><b>Live class</b><small>With your facilitator</small></span><span class="nl-join">Join</span></div>
        <div class="nl-card nl-c3"><span class="nl-c3h"><b>Client project</b><span class="pill ok">Passed</span></span><small>Feedback from your facilitator, then it goes in your portfolio.</small></div>
      </div></div></section>
    <section class="nl-finish"><div class="wrap"><h2 class="nl-h2">You'll finish with.</h2>
      <div class="nl-finrow"><ul class="nl-fin">
        <li><b>A certificate</b><span>Signed by the Programme Director, and easy for employers to verify.</span></li>
        <li><b>A real client project</b><span>In your portfolio, with feedback you can show employers.</span></li>
        <li><b>Internship experience</b><span>Four weeks with a partner company.</span></li>
        <li><b>A job-ready CV and LinkedIn</b><span>Reviewed with your Career Coach.</span></li></ul>
        <div class="nl-certwrap"><div class="cert-box nl-cert" aria-label="Example certificate">${certHTML({ name: "Aiden Ivwurie", programme: p.name || "Graduate Employability Programme", weeks, track: "", completed_on: null, cert_id: "JNA-GEP27A-001", signer_name: INFO.signer_name || "Shekemi Odeyemi", signer_title: INFO.signer_title || "Programme Director", year: String(new Date().getFullYear() + 1) })}</div></div>
      </div></div></section>
    <section class="nl-route"><div class="wrap"><div class="nl-route-h"><h2 class="nl-h2">The ${weeks} weeks.</h2><a class="nl-more" href="#/tracks">See what you can learn →</a></div>
      <ol class="nl-weeks">${ROUTE_STOPS.map(([w, t], i) => `<li class="${i === ROUTE_STOPS.length - 1 ? "end" : ""}"><span>${w}</span><b>${t}</b></li>`).join("")}</ol></div></section>
    <section class="wrap nl-sec" id="how"><h2 class="nl-h2">How to get in.</h2>
      <ol class="nl-steps">${[["Apply", "5 minutes"], ["Readiness check", `${mins} minutes`], ["Call with us", "15 minutes"], ["Accept and pay", p.fee ? `${naira(p.fee)}, or 2 × ${naira(part1Of(p))}` : "You're in"]].map(([a, b], i) => `<li><span class="nl-n ${i === 3 ? "last" : ""}">${i + 1}</span><span><b>${a}</b><small>${b}</small>${i === 3 && p.fee ? `<a class="nl-help" href="#/" data-act="jump" data-k="faq-cost">Need help with fees?</a>` : ""}</span></li>`).join("")}</ol>
      <div class="nl-need"><b>You'll need:</b><span>${TICK}A laptop</span><span>${TICK}Reliable internet</span><span>${TICK}About 15 hours a week</span></div>
      ${INFO.info_session_url || INFO.sample_lesson_url ? `<div class="nl-taste"><div><b>Not ready to apply yet?</b><span>${INFO.info_session_url ? "Join a free info session" : ""}${INFO.info_session_url && INFO.sample_lesson_url ? ", or " : ""}${INFO.sample_lesson_url ? (INFO.info_session_url ? "try a sample lesson" : "Try a sample lesson") : ""}.</span></div><div class="actions">${INFO.info_session_url ? `<a class="btn" href="${esc(INFO.info_session_url)}" target="_blank" rel="noopener">Book an info session</a>` : ""}${INFO.sample_lesson_url ? `<a class="btn ghost" href="${esc(INFO.sample_lesson_url)}" target="_blank" rel="noopener">Try a sample lesson</a>` : ""}</div></div>` : ""}</section>
    <section class="wrap nl-sec"><h2 class="nl-h2">Who supports you.</h2>
      <ul class="nl-team">${TEAM.map(([r, d]) => { const m = teamOf()[r] || {}; const ini = (m.name || r).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        return `<li>${m.name || m.photo ? `<span class="nl-face">${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy">` : esc(ini)}</span>` : ""}${m.name ? `<b>${esc(m.name)}</b><span class="nl-role">${r}</span>` : `<b>${r}</b>`}<span>${d}</span></li>`; }).join("")}</ul></section>
    <section class="wrap nl-sec nl-faq" id="faq"><h2 class="nl-h2">FAQ.</h2>
      <div>${p.fee ? `<details id="faq-cost" open><summary>How much does it cost?</summary><p>${naira(p.fee)} in full, or 2 payments of ${naira(part1Of(p))}. You only pay after you're offered a place. Need help with fees? Email <a href="mailto:info@jobnestcareers.com">info@jobnestcareers.com</a> and tell us your situation.</p></details>` : ""}${FAQ.map(([q, a], i) => `<details ${i || p.fee ? "" : "open"}><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></section>
    ${open ? `<section class="nl-band"><div class="wrap"><div><h2 class="nl-h2">Ready to become work-ready?</h2><p>Applying takes 5 minutes.</p></div><a class="btn gold lg" href="#/apply">Apply now →</a></div></section>` : ""}
    <footer class="nl-foot"><div class="wrap"><span>© ${new Date().getFullYear()} Jobnest Services</span>
      <nav aria-label="Footer"><a href="#/check">Continue an application</a><a href="#/learn/signin">Student sign-in</a><a href="#/verify">Verify a certificate</a><a href="#/staff">Staff sign-in</a><a href="${esc(INFO.website_url || "https://jobnestcareers.com")}">Jobnest.com ↗</a></nav></div></footer>`;
  fitCert();
}

const radios = (name, opts) => `<div class="rate">${opts.map((o) => `<label><input type="radio" name="${name}" value="${o}"><span>${o}</span></label>`).join("")}</div>`;
const select = (id, opts) => `<select id="${id}">${["", ...opts].map((o) => `<option value="${esc(o)}">${o || "Choose one"}</option>`).join("")}</select>`;

const STEPS = ["Apply", "Readiness check", "Call", "Offer", "Pay", "Admitted"];
const stepBar = (n) => `<ol class="stepbar" aria-label="Your progress: step ${n + 1} of ${STEPS.length}">${STEPS.map((t, i) => `<li class="${i < n ? "done" : i === n ? "now" : ""}"${i === n ? ' aria-current="step"' : ""}><span></span><em>${t}</em></li>`).join("")}</ol><p class="stepbar-m" aria-hidden="true">Step ${n + 1} of ${STEPS.length} · ${STEPS[n]}</p>`;

function pageApply() {
  if (!appsOpen()) return go("#/gep");
  let zuri = ""; try { zuri = sessionStorage.getItem("jn_zuri") || ""; } catch (e) {}
  const zGoal = (zuri.match(/^Goal[^:]*:\s*(.+)$/m) || [])[1] || "";
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><form class="card form app-form" id="apply-form" novalidate>
    ${stepBar(0)}<h1>Apply to the ${esc(prog().name)}</h1>
    <p class="note">You don't pick a track here. You'll agree it together on your Discovery Call.</p>
    ${!zuri && INFO.zuri_url ? `<p class="zuri-hint">Not sure what you want to do yet? <a href="${esc(INFO.zuri_url)}" target="_blank" rel="noopener">Chat with Zuri first ↗</a> She'll fill this form in for you at the end.</p>` : ""}
    <h3>About you</h3>
    <div class="grid2"><div class="field"><label for="g-first">First name</label><input id="g-first" autocomplete="given-name" maxlength="80" placeholder="e.g. Ada" autocapitalize="words"></div><div class="field"><label for="g-sur">Surname</label><input id="g-sur" autocomplete="family-name" maxlength="80" placeholder="e.g. Obi" autocapitalize="words"></div></div>
    <div class="field"><label for="g-email">Email</label><input id="g-email" type="email" autocomplete="email" placeholder="e.g. ada.obi@gmail.com"></div>
    <div class="field"><label for="g-phone">WhatsApp number</label><div class="phone-in"><span class="cc-pick"><img id="cc-flag" src="https://flagcdn.com/w40/ng.png" alt="" width="22" height="16"><span id="cc-code">+234</span><span class="cc-caret" aria-hidden="true">▾</span><label class="sr-only" for="g-cc">Country code</label><select id="g-cc" autocomplete="tel-country-code">${ccOptions()}</select></span><input id="g-phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="803 000 0000"></div><span class="note">Pick the country code, then your number. We'll message you on WhatsApp.</span></div>
    <div class="field"><label for="g-country">Country you live in</label><select id="g-country" autocomplete="country">${countryOptions("NG")}</select></div>
    <div class="grid2" id="g-ng"><div class="field"><label for="g-state">State</label>${select("g-state", Object.keys(NG))}</div>
    <div class="field"><label for="g-town">City, town or local government area</label><select id="g-town" disabled><option value="">Choose your state first</option></select>
      <input id="g-town-o" placeholder="Type your city or town" maxlength="80" hidden style="margin-top:.5rem"></div></div>
    <div class="field" id="g-abroad" hidden><label for="g-city">City or town</label><input id="g-city" maxlength="80" placeholder="e.g. Accra"></div>
    <h3>Your background</h3>
    <div class="grid2"><div class="field"><label for="g-edu">Highest education</label>${select("g-edu", ["OND / NCE", "HND", "B.Sc / B.A.", "Master's", "Other"])}</div>
    <div class="field"><label for="g-nysc">NYSC status</label>${select("g-nysc", ["Completed", "Currently serving", "Exempted", "Not yet"])}</div></div>
    <div class="field"><label for="g-sit">Which best describes you now?</label>${select("g-sit", ["Final-year student", "Recent graduate", "Currently serving (NYSC)"])}</div>
    <h3>Readiness</h3>
    <div class="field"><span class="lbl">Can you commit at least 15 hours a week for ${prog().weeks || 17} weeks?</span>${radios("g-hours", ["Yes", "Not sure", "No"])}</div>
    <div class="grid2"><div class="field"><span class="lbl">Do you have a laptop?</span>${radios("g-laptop", ["Yes", "No"])}</div>
    <div class="field"><span class="lbl">Reliable internet?</span>${radios("g-net", ["Yes", "Sometimes", "No"])}</div></div>
    <div class="field"><label for="g-mot">What would you like to be doing in 6 months? <span class="note" style="font-weight:400">A sentence or two. “Not sure yet” is a fine answer.</span></label><textarea id="g-mot" placeholder="e.g. Working as a junior data analyst in a fintech company" rows="3" maxlength="2000">${esc(zGoal)}</textarea></div>
    <div class="field"><label for="g-zuri">Your Zuri summary <span class="note" style="font-weight:400" id="g-zuri-note">${zuri ? "Filled in from your chat with Zuri. You can edit it." : "Optional. If you chatted with Zuri, paste the summary here."}</span></label><textarea id="g-zuri" placeholder="Paste your Zuri summary here" rows="${zuri ? 7 : 3}" maxlength="4000">${esc(zuri)}</textarea></div>
    <label class="consent"><input type="checkbox" id="g-consent"> <span>I agree that Jobnest Academy may use these details to process my application, as set out in the <a href="${esc(INFO.website_url || "https://jobnestcareers.com")}/#privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
    <p class="err" id="g-err" role="alert"></p>
    <div class="actions"><button class="btn gold" type="submit">Submit application</button><span class="note">Next: a ${INFO.cohort?.assess_minutes || 5}-minute readiness assessment.</span></div>
  </form></section>`;
}

const TOP_C = ["NG", "GH", "GB", "US", "CA", "KE", "ZA"];
function countryOptions(sel) {
  const o = (x) => `<option value="${x.c}" ${x.c === sel ? "selected" : ""}>${flag(x.c)} ${esc(x.n)}</option>`;
  return COUNTRIES.filter((x) => TOP_C.includes(x.c)).sort((a, b) => TOP_C.indexOf(a.c) - TOP_C.indexOf(b.c)).map(o).join("") + `<option disabled>──────────</option>` + COUNTRIES.map(o).join("");
}
function ccOptions() {
  const o = (x, sel) => `<option value="${x.p}" data-c="${x.c}" ${sel ? "selected" : ""}>${flag(x.c)} +${x.p} ${esc(x.n)}</option>`;
  return COUNTRIES.filter((x) => TOP_C.includes(x.c)).sort((a, b) => TOP_C.indexOf(a.c) - TOP_C.indexOf(b.c)).map((x) => o(x, x.c === "NG")).join("") + `<option disabled>──────────</option>` + COUNTRIES.map((x) => o(x, false)).join("");
}
const countryName = (c) => (COUNTRIES.find((x) => x.c === c) || {}).n || c;
function cityValue() {
  const cn = $("#g-country")?.value || "NG";
  if (cn !== "NG") { const c = ($("#g-city")?.value || "").trim(); return c ? `${c}, ${countryName(cn)}` : ""; }
  const st = $("#g-state")?.value || "", t = $("#g-town")?.value || "", o = ($("#g-town-o")?.value || "").trim();
  if (!st) return "";
  const town = t === "Other" ? o : t;
  return town ? `${town}, ${st}` : "";
}
function phoneValue() {
  const cc = $("#g-cc")?.value || "234", n = ($("#g-phone")?.value || "").replace(/\D/g, "").replace(/^0+/, "");
  return n ? `+${cc}${n}` : "";
}
function fillTowns() {
  const st = $("#g-state").value, sel = $("#g-town"), other = $("#g-town-o");
  const list = NG[st] || [];
  sel.hidden = false; sel.disabled = !st; other.hidden = true; other.value = "";
  sel.innerHTML = st ? `<option value="">Choose one</option>${list.map((c) => `<option>${esc(c)}</option>`).join("")}` : `<option value="">Choose your state first</option>`;
}
function ccShow() {
  const cc = $("#g-cc"), o = cc?.selectedOptions?.[0]; if (!o) return;
  $("#cc-code").textContent = "+" + o.value; $("#cc-flag").src = `https://flagcdn.com/w40/${(o.dataset.c || "ng").toLowerCase()}.png`;
}
function setCountry() {
  const cn = $("#g-country").value, ng = cn === "NG";
  $("#g-ng").hidden = !ng; $("#g-abroad").hidden = ng;
  const cc = $("#g-cc"); if (cc && !cc.dataset.touched) { const opt = [...cc.options].find((o) => o.dataset.c === cn); if (opt) { opt.selected = true; ccShow(); } }
}
const nameCase = (v) => { v = v.trim().replace(/\s+/g, " "); return v === v.toLowerCase() || v === v.toUpperCase() ? v.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : v.charAt(0).toUpperCase() + v.slice(1); };

async function submitApply(form) {
  const v = (id) => ($("#" + id)?.value || "").trim();
  const r = (n) => $(`input[name="${n}"]:checked`)?.value || "";
  const d = { first_name: nameCase(v("g-first")), surname: nameCase(v("g-sur")), email: v("g-email"), phone: phoneValue(), city: cityValue(), edu: v("g-edu"), nysc: v("g-nysc"),
    situation: v("g-sit"), hours: r("g-hours"), laptop: r("g-laptop"), internet: r("g-net"), motivation: v("g-mot"), zuri_summary: v("g-zuri") };
  const miss = [["first_name", "first name"], ["surname", "surname"], ["email", "email"], ["phone", "WhatsApp number"], ["city", "where you live"], ["edu", "education"], ["nysc", "NYSC status"],
    ["situation", "current situation"], ["hours", "weekly hours"], ["laptop", "laptop"], ["internet", "internet"], ["motivation", "6-month answer"]].filter(([k]) => !d[k]).map(([, l]) => l);
  const err = $("#g-err");
  if (miss.length) { err.textContent = "Please complete: " + miss.join(", ") + "."; return; }
  if (!/^\S+@\S+\.\S+$/.test(d.email)) { err.textContent = "Add a valid email address, e.g. name@gmail.com."; return; }
  const pn = ($("#g-phone").value || "").replace(/\D/g, "").replace(/^0+/, "");
  if (pn.length < 6 || pn.length > 14 || ($("#g-cc").value === "234" && pn.length !== 10)) { err.textContent = $("#g-cc").value === "234" ? "Add your WhatsApp number, e.g. 803 000 0000 (10 digits after +234)." : "Add your full WhatsApp number after the country code."; return; }
  if (!$("#g-consent").checked) { err.textContent = "Please tick the box to agree to how we use your details."; return; }
  err.textContent = "";
  try {
    const res = await busy(form.querySelector("button[type=submit]"), () => rpc("submit_application", { p: d }));
    try { sessionStorage.removeItem("jn_zuri"); } catch (e) {}
    saveMyApp(res.ref, res.token);
    toast(`Application received · ${res.ref}`);
    go(`#/a/${res.ref}/${res.token}/assess`);
  } catch (e) { err.textContent = e.message; }
}

function pageCheck() {
  const mine = myApp();
  app.innerHTML = pubHeader() + `<section class="wrap pub-wrap"><div class="card verify"><span class="eyebrow">Applicants</span><h1>Continue your application</h1>
    ${mine ? `<div class="notice">You applied on this device. <a class="link" href="#/a/${esc(mine.ref)}/${esc(mine.token)}">Continue application ${esc(mine.ref)} →</a></div>` : ""}
    <p>Enter your application number and the surname you applied with. Your application number is in every email we've sent you.</p>
    <form id="find-form" class="form" novalidate><div class="grid2"><div class="field"><label for="f-ref">Application number</label><input id="f-ref" placeholder="JNA-27-483920" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase"></div>
      <div class="field"><label for="f-sur">Surname</label><input id="f-sur" placeholder="e.g. Obi" autocomplete="family-name"></div></div><p class="err" id="f-err" role="alert"></p><div><button class="btn gold" type="submit">Continue</button></div></form>
    <p class="note" style="margin-top:1rem">New here? <a class="link" href="#/apply">Start an application</a></p></div></section>` + pubFoot();
}

function pagePayCheck() {
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="card verify"><h1>We're checking your payment</h1><p>We couldn't confirm your payment straight away. If money left your account, it will show on your application within a few minutes and you'll get an email.</p><p class="note">Still not showing after an hour? Reply to your offer email with your payment receipt and Admissions will help.</p><div><a class="btn" href="#/check">Open my application</a></div></div></section>` + pubFoot();
}

/* ---------- applicant area ---------- */
function tracker(a) {
  const stg = a.status === "Admitted" ? 5 : a.status === "Offer sent" ? 4 : APP_STAGE[a.status] ?? 0;
  const bad = BAD_ST.includes(a.status);
  return `<ol class="app-track">${STAGES_APP.map((t, i) => `<li class="${i < stg || (i === stg && a.status === "Admitted") ? "done" : i === stg ? (bad ? "bad" : "cur") : ""}"><span class="mono">${i < stg || (a.status === "Admitted" && i === 5) ? "✓" : i + 1}</span><b>${t}</b></li>`).join("")}</ol>`;
}
const communityNote = () => `<p class="note">Meanwhile, you can join the Jobnest Community waitlist. It opens soon, with resources and people building careers like you. <a href="${esc(INFO.website_url || "https://jobnestcareers.com")}/#community" target="_blank" rel="noopener">Join the waitlist ↗</a></p>`;

function statusCard(a, base) {
  let card = "";
  const tr = esc(a.track || "");
  if (a.status === "Assessment pending") card = `<p>Your application is in. Next, take the ${INFO.cohort?.assess_minutes || 5}-minute readiness assessment.</p><div><a class="btn gold" href="${base}/assess">${a.assessment_started ? "Continue assessment" : "Go to the assessment"}</a></div>`;
  if (a.status === "Assessment failed") card = `<p>Thank you for applying. Your assessment score was <b>${a.score}%</b>, and the pass mark is ${a.pass_mark}%. You can apply again for the next batch.</p>${communityNote()}`;
  if (a.status === "Call to book") card = `<p>You passed the assessment with <b>${a.score}%</b>. Book your 15-minute Discovery Call.</p><div><a class="btn gold" href="${base}/book">Book Discovery Call 1</a></div>`;
  if (a.status === "Call booked") {
    const meet = a.meet || "", gc = gcalUrl(a.dc1_at, 15, "Jobnest Academy Discovery Call", `Your 15-minute Discovery Call${a.officer ? ` with ${a.officer}` : ""}.${meet ? ` Join here: ${meet}` : ""}`, meet || "Online");
    card = `<p>Your Discovery Call is booked for <b>${fmtLong(a.dc1_at)} at ${fmtTime(a.dc1_at)} WAT</b>${a.officer ? ` with ${esc(a.officer)}` : ""}. This is where we agree your track together.</p>
      <div class="actions">${meet ? `<a class="btn gold" href="${esc(meet)}" target="_blank" rel="noopener">Join the call ↗</a>` : ""}<a class="btn ghost" href="${esc(gc)}" target="_blank" rel="noopener">Add to Google Calendar</a></div>
      <p class="note">${meet ? "The link opens Microsoft Teams. Join a few minutes early." : "The meeting link is in your booking email."}</p>`;
  }
  if (a.status === "Under review") card = `<p>Thanks for the call. You agreed on the <b>${tr}</b> track. Admissions is reviewing your application. You'll hear back within 3 working days.</p>`;
  if (a.status === "Waitlisted") card = `<p>You're on the <b>waitlist</b> for the ${tr} track. If a seat opens, we'll send you an offer.</p>`;
  if (a.status === "Not selected") card = `<p>Thank you for applying. We're not able to offer you a place this time. You're welcome to apply for the next batch.</p>`;
  if (a.status === "Closed: no matching track") card = `<p>Thank you for your time on the call. You're interested in <b>${esc(a.wanted)}</b>, and the programme doesn't offer that track yet.</p><p>This isn't a judgement of you. We've noted your interest and will invite you first if we launch it. No payment was taken.</p>${communityNote()}`;
  if (a.status === "Deferred") card = `<p>Your application has been moved to the <b>next batch</b>. We'll contact you when admissions open.</p>`;
  if (a.status === "Offer expired") card = `<p>Your offer expired because payment wasn't made by the deadline. If you'd still like a place, reply to your offer email and Admissions will let you know your options.</p>`;
  if (a.status === "Offer declined") card = `<p>You declined your offer, and your seat has gone to someone on the waitlist. If your plans change, you're welcome to apply for the next batch.</p>`;
  if (a.status === "Offer sent") card = offerCard(a, base);
  if (a.status === "Admitted") card = admittedCard(a, base);
  return card;
}

function offerCard(a, base) {
  const f = a.fees, tok = base.split("/").pop();
  return `<div class="offer"><span class="eyebrow">Offer of admission</span><h2>Congratulations, ${esc(a.first_name)}! You've been offered a place.</h2><p>${esc(a.track || "")} track · ${esc(a.cohort)}</p>
    <p class="deadline">⏳ Accept and pay by <b>${fmtLong(a.offer_deadline)}, ${fmtTime(a.offer_deadline)} WAT</b>, or your seat goes to the waitlist.</p></div>
    <fieldset class="pay-choose"><legend class="lbl">How would you like to pay?</legend><div class="plans">
      <label class="plan"><input type="radio" name="plan" value="full" data-amount="${f.fee}" checked><span class="eyebrow">Pay in full</span><span class="mono">${naira(f.fee)}</span><span class="note">One payment. The lowest total.</span></label>
      <label class="plan"><input type="radio" name="plan" value="two" data-amount="${f.part1}"><span class="eyebrow">Pay in 2 parts</span><span class="mono">${naira(f.part1)} now</span><span class="note">Then ${naira(f.part2)} by ${fmtDateD(f.due_date)}. ${naira(f.two_total)} in total.</span></label></div></fieldset>
    <div class="actions"><button class="btn gold" id="pay-btn" data-act="pay" data-ref="${esc(a.ref)}" data-token="${esc(tok)}">Accept and pay ${naira(f.fee)}</button></div>
    <p class="note">🔒 Secure payment by Paystack: card, bank transfer or USSD. Your matric number and admission letter are ready as soon as you pay.</p>
    <p class="note"><button class="link sm" data-act="decline-offer" data-ref="${esc(a.ref)}" data-token="${esc(tok)}">I don't want this place</button></p>`;
}
function admittedCard(a, base) {
  const bal = balanceOf(a), f = a.fees, tok = base.split("/").pop();
  return `<div class="idcard solo"><div><small>Matric number</small><div class="num">${esc(a.matric)}</div><span>${esc(a.track || "")} · ${esc(a.cohort)}</span></div></div>
    <p>Welcome to Jobnest Academy, ${esc(a.first_name)}! The programme starts on <b>${fmtDateD(a.start_date)}</b>. We'll email your student portal sign-in to ${esc(a.email)} before then.</p>
    ${bal > 0 ? `<div class="notice bal"><span>Paid <b>${naira(a.paid_total)}</b> of ${naira(f.plan_total)}. Second instalment <b>${naira(bal)}</b> due by ${fmtDateD(f.due_date)}.</span><button class="btn sm gold" data-act="pay" data-ref="${esc(a.ref)}" data-token="${esc(tok)}">Pay ${naira(bal)} now</button></div>`
      : `<p class="note">✓ Fees paid in full (${naira(a.paid_total)}).</p>`}
    <div class="actions">${a.account_set ? `<a class="btn gold" href="#/learn">Go to the student portal</a>` : `<a class="btn gold" href="${base}/account">Set up your student account</a>`}<a class="btn ${a.account_set ? "" : "ghost"}" href="${base}/letter">View admission letter</a></div>`;
}

function pageLetter(a, base) {
  const bal = balanceOf(a), f = a.fees;
  const fees = bal > 0 ? `${naira(a.paid_total)} paid of ${naira(f.plan_total)} (2 instalments). Balance of ${naira(bal)} due by ${fmtDateD(f.due_date)}.` : `${naira(a.paid_total)}, paid in full.`;
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap letter-wrap">
    <div class="letter-bar no-print"><a class="link" href="${base}">← Back to your application</a><button class="btn" data-act="print">Save as PDF or print</button></div>
    <article class="letter" aria-label="Letter of admission">
      <header class="lh">${LOGO}<div><b>Jobnest Academy</b><span>Lagos, Nigeria · academy.jobnestcareers.com</span></div></header>
      <p class="lh-date">${fmtDate(a.admitted_at)}</p>
      <p class="lh-to"><b>${esc(a.first_name)} ${esc(a.surname)}</b><br>Matric number: <b class="mono">${esc(a.matric)}</b><br>Application ${esc(a.ref)}</p>
      <h1>Letter of Admission</h1>
      <p>Dear ${esc(a.first_name)},</p>
      <p>We are pleased to confirm your admission to the <b>${esc(a.programme)}</b> at Jobnest Academy, on the <b>${esc(a.track || "")}</b> track, ${esc(a.cohort)}.</p>
      <dl class="letter-kv">
        <div><dt>Programme</dt><dd>${esc(a.programme)}</dd></div><div><dt>Track</dt><dd>${esc(a.track || "")}</dd></div>
        <div><dt>Cohort</dt><dd>${esc(a.cohort)}</dd></div><div><dt>Matric number</dt><dd class="mono">${esc(a.matric)}</dd></div>
        <div><dt>Start date</dt><dd>${fmtDateD(a.start_date)} (Week 1: Orientation)</dd></div><div><dt>Duration</dt><dd>${a.weeks} weeks online, about 15 hours a week</dd></div>
        <div class="wide"><dt>Fees</dt><dd>${fees}</dd></div></dl>
      <p>Over the ${a.weeks} weeks you will build the core skills for your track, deliver a client project, complete an internship, and be coached through your job search.</p>
      <h2>Before you start</h2>
      <ul><li>We'll email your student portal sign-in before the start date. You'll sign in with your matric number.</li>
        <li>Make sure you have a laptop and reliable internet for about 15 hours a week.</li>
        ${bal > 0 ? `<li>Pay your second instalment of ${naira(bal)} by ${fmtDateD(f.due_date)} from your application page.</li>` : ""}</ul>
      <p>Congratulations, and welcome. We can't wait to see you build a career you're proud of.</p>
      <div class="sign"><span class="sig-wrap"><img class="sig-img" src="/assets/signature-pd.png" alt="Signature"><span class="sig-line" aria-hidden="true"></span></span>${a.signer_name ? `<b>${esc(a.signer_name)}</b>` : ""}<span>${esc(a.signer_title || "Programme Director")}, Jobnest Academy</span></div>
      <footer class="lf">Issued online by Jobnest Academy. To confirm this letter, contact Admissions with matric number ${esc(a.matric)}.</footer>
    </article></section>`;
}

async function startPay(btn) {
  const plan = $('input[name="plan"]:checked')?.value || null;
  await busy(btn, async () => {
    const r = await fetch("/.netlify/functions/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: btn.dataset.ref, token: btn.dataset.token, plan }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.message || "We couldn't start the payment. Please try again.");
    btn.textContent = "Opening Paystack…";
    location.href = d.url;
    await new Promise(() => {});   // keep the button busy while the page changes
  });
}

async function pageApplicant(ref, token, view) {
  loading();
  let a;
  try { [a] = await Promise.all([rpc("applicant_view", { p_ref: ref, p_token: token }), info()]); }
  catch (e) {
    app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="card verify"><h1>We couldn't open that application</h1><p>${esc(e.message)}</p><div><a class="btn" href="#/check">Continue an application</a></div></div></section>`;
    return;
  }
  saveMyApp(a.ref, token);
  if (a.status === "Call booked") { try { a.meet = (await rpc("applicant_call", { p_ref: ref, p_token: token }))?.meet || ""; } catch { a.meet = ""; } }
  const base = `#/a/${encodeURIComponent(a.ref)}/${encodeURIComponent(token)}`;
  if (view === "assess" && a.status === "Assessment pending") return a.assessment_started ? pageAssess(a, token, base) : pageAssessIntro(a, token, base);
  if (view === "book" && a.status === "Call to book") return pageBook(a, token, base);
  if (view === "letter" && a.status === "Admitted") return pageLetter(a, base);
  if (view === "certificate") { const cid = await rpc("applicant_certificate", { p_ref: ref, p_token: token }).catch(() => null); if (cid) return go(`#/certificate/${cid}`); }
  if (view === "account" && a.status === "Admitted") return pageAccount(a, base);
  if (view === "paid" || view === "payfail" || view === "paycheck") history.replaceState(null, "", toPath(base));
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="status-wrap">
    <div class="card"><div class="ch"><div><span class="eyebrow">Application ${esc(a.ref)}</span><h2 style="margin-top:.3rem">${esc(a.first_name)} ${esc(a.surname)}${a.track ? ` · ${esc(a.track)}` : ""}</h2>${a.track || a.wanted ? "" : `<span class="note">Track: agreed on Discovery Call 1</span>`}</div>${pill(a.status)}</div>
      ${tracker(a)}<div class="status-body">${view === "paid" && a.status === "Admitted" ? `<div class="notice ok-n">✓ Payment received. Thank you! A receipt and your admission email are on their way.</div>` : ""}${view === "payfail" ? `<div class="notice warn">Your payment wasn't completed, so you haven't been charged. You can try again below.</div>` : ""}${view === "paycheck" ? `<div class="notice warn">We couldn't confirm your payment automatically. If you were charged, Admissions will sort it out: reply to your offer email with your payment receipt.</div>` : ""}${statusCard(a, base)}</div></div>
    <div class="card appno"><h3>Your application number</h3><div class="appno-row"><b class="mono" id="my-ref">${esc(a.ref)}</b><button class="btn sm ghost" data-act="copy-link">Copy</button></div>
      <p class="note">Keep it safe. To come back on any device, choose <b>Continue an application</b> and enter it with your surname. It's also in every email we send you.</p></div>
  </div></section>`;
}

function pageAssessIntro(a, token, base) {
  const m = INFO.cohort?.assess_minutes || 5, n = INFO.cohort?.questions || 10;
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="card form app-form">
    ${stepBar(1)}<div class="appno-new"><span>Your application number</span><div class="appno-row"><b class="mono" id="my-ref">${esc(a.ref)}</b><button class="btn sm ghost" data-act="copy-link" type="button">Copy</button></div><small>Keep it safe. You'll need it with your surname to come back. We've also emailed it to you.</small></div>
    <h1>Readiness check</h1>
    <p>Hi ${esc(a.first_name)}, this checks your <b>basic digital skills</b> and <b>clear communication</b>.</p>
    <div class="as-stats"><div><b>${n}</b><span>questions</span></div><div><b>${m}:00</b><span>minutes</span></div><div><b>${a.pass_mark}%</b><span>to pass</span></div><div><b>1</b><span>attempt</span></div></div>
    <p class="note">The timer starts when you press Start and keeps running if you leave the page. Answers save as you go, and submit when time runs out. Find a quiet spot with good internet first.</p>
    <div class="actions"><button class="btn gold lg" data-act="start-assess" data-ref="${esc(a.ref)}" data-token="${esc(token)}">Start</button><a class="btn ghost lg" href="${base}">Not now</a></div></div></section>`;
}

const AS = { timer: null, save: null };
async function pageAssess(a, token, base) {
  let d;
  try { d = await rpc("assessment_start", { p_ref: a.ref, p_token: token }); }
  catch (e) { toast(e.message); return go(base); }
  if (d.finished) { toast(`Time ran out. You scored ${d.finished.score}%.`); return go(`${base}/${d.finished.passed ? "book" : "status"}`); }
  const qs = d.questions, key = `jn.ans.${a.ref}`;
  let saved = d.answers || [];
  try { const loc = JSON.parse(localStorage.getItem(key) || "null"); if (loc && loc.filter((x) => x != null).length > saved.filter((x) => x != null).length) saved = loc; } catch { /* ignore */ }
  const skew = Date.now() - new Date(d.now).getTime(), deadline = new Date(d.deadline).getTime() + skew;
  app.innerHTML = pubHeader("admissions") + `<div class="timer-bar" id="timer-bar" role="timer" aria-live="off"><div class="wrap"><span>Readiness check</span><b class="mono" id="timer-left">--:--</b><span class="tb-prog"><span class="tb-track"><span id="timer-fill"></span></span><span class="note" id="timer-ans"></span></span></div></div>
    <section class="wrap pub-wrap"><form class="card form app-form" id="ready-form" data-ref="${esc(a.ref)}" data-token="${esc(token)}" novalidate>
    <h1>Readiness check</h1>
    <p class="note">Every applicant gets a different set of questions. Your answers save automatically.</p>
    ${qs.map((q, qi) => `<fieldset class="q"><legend><span class="q-n mono">${String(qi + 1).padStart(2, "0")}</span>${esc(q.q)}</legend>${q.o.map((o, oi) => `<label class="opt"><input type="radio" name="rq${qi}" value="${oi}" ${saved[qi] === oi ? "checked" : ""}> ${esc(o)}</label>`).join("")}</fieldset>`).join("")}
    <p class="err" id="rq-err" role="alert"></p><div><button class="btn gold" type="submit">Submit assessment</button></div></form></section>`;
  const form = $("#ready-form");
  const answers = () => qs.map((_, i) => { const v = $(`input[name="rq${i}"]:checked`, form)?.value; return v == null ? null : +v; });
  const count = () => { const n = answers().filter((x) => x != null).length; $("#timer-ans").textContent = `${n} of ${qs.length} answered`; const f = $("#timer-fill"); if (f) f.style.width = (100 * n / qs.length) + "%"; };
  form.addEventListener("change", () => {
    const ans = answers(); count();
    try { localStorage.setItem(key, JSON.stringify(ans)); } catch { /* ignore */ }
    clearTimeout(AS.save); AS.save = setTimeout(() => rpc("assessment_save", { p_ref: a.ref, p_token: token, p_answers: ans }).catch(() => {}), 800);
  });
  count();
  clearInterval(AS.timer);
  const tick = async () => {
    if (!document.body.contains(form)) return clearInterval(AS.timer);
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    $("#timer-left").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    $("#timer-bar").classList.toggle("warn", left <= 60);
    if (left === 60) toast("1 minute left");
    if (left <= 0) { clearInterval(AS.timer); toast("Time's up. Submitting your answers…"); await submitAssess(form, true).catch(() => {}); }
  };
  tick(); AS.timer = setInterval(tick, 1000);
}

async function submitAssess(form, timeUp = false) {
  const n = $$("fieldset.q", form).length;
  const ans = [...Array(n)].map((_, i) => { const v = $(`input[name="rq${i}"]:checked`, form)?.value; return v == null ? null : +v; });
  const left = ans.filter((x) => x == null).length;
  if (left && !timeUp) { $("#rq-err").textContent = `Answer every question (${left} left).`; return; }
  const ref = form.dataset.ref, token = form.dataset.token;
  clearInterval(AS.timer); clearTimeout(AS.save);
  const res = await busy(form.querySelector("button[type=submit]"), () => rpc("assessment_submit", { p_ref: ref, p_token: token, p_answers: ans }));
  try { localStorage.removeItem(`jn.ans.${ref}`); } catch { /* ignore */ }
  toast(res.passed ? `You passed with ${res.score}%. Book your call next.` : `You scored ${res.score}%.`);
  go(`#/a/${ref}/${token}/${res.passed ? "book" : "status"}`);
}

function pageBook(a, token, base) {
  const byDay = {};
  for (const s of a.slots) { const k = fmt(s.at, { year: "numeric", month: "2-digit", day: "2-digit" }); (byDay[k] = byDay[k] || []).push(s); }
  const days = Object.keys(byDay);
  if (!ui.pick || !byDay[ui.pick.day]) ui.pick = { day: days[0] || null, slot: null };
  const chosen = ui.pick.slot && a.slots.find((s) => s.id === ui.pick.slot);
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="card booker app-form"><span class="eyebrow">Step 3 of 6 · Discovery Call 1 · 15 minutes</span><h1>Book a short call with Admissions</h1>
    <p>You passed the assessment with <b>${a.score}%</b>. Well done! In a 15-minute video call we'll explore what you want to do and agree the track that fits you.</p>
    ${!days.length ? `<div class="notice">No call times are open right now. Admissions adds new times every few days, and we'll email you when they do. Check back soon.</div>` : `
    <div class="bk-step"><span class="bk-n">1</span><b>Pick a day</b></div>
    <div class="days">${days.map((k) => { const d = byDay[k][0].at; return `<button class="day" data-act="pick-day" data-k="${k}" aria-pressed="${ui.pick.day === k}"><span class="free">${byDay[k].length} free</span><small>${fmt(d, { weekday: "short" })}</small><b class="mono">${fmt(d, { day: "numeric" })}</b><small>${fmt(d, { month: "short" })}</small></button>`; }).join("")}</div>
    <div class="bk-step"><span class="bk-n">2</span><b>Pick a time</b><span class="note">WAT</span></div>
    <div class="slots">${(byDay[ui.pick.day] || []).map((s) => `<button class="slot" data-act="pick-slot" data-k="${s.id}" aria-pressed="${ui.pick.slot === s.id}">${fmtTime(s.at)}</button>`).join("")}</div>
    ${chosen ? `<div class="bk-confirm"><div><span class="eyebrow">You're booking</span><b>${fmtLong(chosen.at)} at ${fmtTime(chosen.at)} WAT</b><span class="note">with ${esc(chosen.officer)}, Admissions</span></div><div><button class="btn gold" data-act="book" data-ref="${esc(a.ref)}" data-token="${esc(token)}" data-k="${chosen.id}">Confirm call</button></div></div>` : ""}`}
    <p style="margin-top:1rem"><a class="link" href="${base}">Back to my application</a></p></div></section>`;
}

/* ---------- staff: sign in ---------- */
function staffCard(inner) {
  return `<header class="pub-top adm-site"><div class="wrap"><a class="logo" href="#/" style="text-decoration:none;color:inherit">${LOGO}Jobnest Academy · Staff</a></div></header>
    <section class="wrap pub-wrap"><div class="card verify" style="max-width:460px;margin-inline:auto">${inner}</div></section>`;
}
function pageStaffSignIn(msg) {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Sign in</h1>${msg ? `<div class="notice">${msg}</div>` : ""}
    <form id="signin-form" class="form" novalidate><div class="field"><label for="s-email">Work email</label><input id="s-email" placeholder="you@jobnestcareers.com" type="email" autocomplete="username"></div>
    <div class="field"><label for="s-pass">Password</label><input id="s-pass" placeholder="Your password" type="password" autocomplete="current-password"></div>
    <p class="err" id="s-err" role="alert"></p><div><button class="btn" type="submit">Sign in</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff/reset">Forgot your password?</a> · <a class="link" href="#/staff/signup">First time? Set up your account</a></p>`);
}
function pageStaffSignup() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Set up your staff account</h1><p class="note">Use the email the Super Admin added for you.</p>
    <form id="signup-form" class="form" novalidate><div class="field"><label for="u-email">Work email</label><input id="u-email" placeholder="you@jobnestcareers.com" type="email" autocomplete="username"></div>
    <div class="field"><label for="u-pass">Choose a password</label><input id="u-pass" placeholder="At least 8 characters" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
    <div class="field"><label for="u-pass2">Confirm password</label><input id="u-pass2" placeholder="Type it again" type="password" autocomplete="new-password"></div>
    <p class="err" id="u-err" role="alert"></p><div><button class="btn" type="submit">Create account</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff">Back to sign in</a></p>`);
}
function pageStaffReset() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Reset your password</h1><p class="note">We'll email you a link to choose a new password.</p>
    <form id="reset-form" class="form" novalidate><div class="field"><label for="r-email">Work email</label><input id="r-email" placeholder="you@jobnestcareers.com" type="email" autocomplete="username"></div>
    <p class="err" id="r-err" role="alert"></p><div><button class="btn" type="submit">Email me a reset link</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff">Back to sign in</a></p>`);
}
function pageNewPassword() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Choose a new password</h1>
    <form id="newpw-form" class="form" novalidate><div class="field"><label for="n-pass">New password</label><input id="n-pass" placeholder="At least 8 characters" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
    <div class="field"><label for="n-pass2">Confirm new password</label><input id="n-pass2" placeholder="Type it again" type="password" autocomplete="new-password"></div>
    <p class="err" id="n-err" role="alert"></p><div><button class="btn" type="submit">Save password</button></div></form>`);
}
const pwOk = (a, b, err) => {
  if (a.length < 8 || !/\d/.test(a)) { err.textContent = "Use at least 8 characters, including a number."; return false; }
  if (a !== b) { err.textContent = "The two passwords don't match."; return false; }
  return true;
};

/* ---------- staff: portal shell ---------- */
function staffNav(role) {
  const adm = [{ g: "Admissions" }];
  if (["adm_officer", "super"].includes(role)) adm.push({ k: "home", l: "Home" }, { k: "calls", l: "Calls" }, { k: "times", l: "Call times" });
  if (["adm_admin", "super"].includes(role)) adm.push({ k: "decide", l: "Decisions" }, { k: "pay", l: "Payments" });
  adm.push({ k: "apps", l: "Applications" });
  if (["adm_admin", "super"].includes(role)) adm.push({ g: "Setup" }, { k: "emails", l: "Emails" }, { k: "settings", l: "Settings" });
  const ac = [{ g: "Academy" }, { k: "students", l: "Students" }];
  if (["director", "cohort_manager", "facilitator", "super"].includes(role)) ac.push({ k: "grading", l: "Grading" });
  if (["director", "cohort_manager", "academy_admin", "coach", "facilitator", "super"].includes(role)) ac.push({ k: "intern", l: "Internships" });
  if (["director", "cohort_manager", "coach", "super"].includes(role)) ac.push({ k: "dc2", l: "Discovery Call 2" });
  if (["director", "cohort_manager", "academy_admin", "facilitator", "coach", "super"].includes(role)) ac.push({ k: "pods", l: "Pods" });
  if (["director", "cohort_manager", "academy_admin", "facilitator", "coach", "super"].includes(role)) ac.push({ k: "support", l: "Help requests" }, { k: "discussion", l: "Discussion" });
  if (["director", "cohort_manager", "academy_admin", "coach", "super"].includes(role)) ac.push({ k: "opps", l: "Opportunities" });
  if (["director", "cohort_manager", "academy_admin", "coach", "super"].includes(role)) ac.push({ k: "jobs", l: "Job search" });
  if (["director", "cohort_manager", "academy_admin", "coach", "super"].includes(role)) ac.push({ k: "outcomes", l: "Outcomes" });
  ac.push({ k: "sessions", l: "Live sessions" }, { k: "news", l: "Announcements" });
  if (role === "super") return [{ g: "Jobnest" }, { k: "staff", l: "Staff accounts" }, { k: "audit", l: "Activity log" }, ...adm, ...ac];
  if (role === "adm_admin") return [...adm, { g: "Academy" }, { k: "students", l: "Students" }];
  if (role === "adm_officer") return adm;
  return ac;
}
// Number badges in the staff menu: how many things are waiting in each section.
const BADGE_HELP = { support: "open help requests", grading: "to grade or reply", intern: "students without a placement", dc2: "calls without a result", decide: "to decide", calls: "calls to complete", pods: "students not in a pod" };
function paintBadges() {
  const c = ui.counts || {}; let total = 0;
  $$(".snav-i[href^='#/portal/']").forEach((a) => { const k = a.getAttribute("href").split("/").pop(), n = +c[k] || 0; a.querySelector(".cnt-b")?.remove();
    if (n > 0) { total += n; a.insertAdjacentHTML("beforeend", `<b class="cnt-b mono" title="${n} ${BADGE_HELP[k] || "waiting"}">${n}</b>`); } });
  $$(".snav-m summary").forEach((sm) => { sm.querySelector(".cnt-b")?.remove(); if (total) sm.insertAdjacentHTML("beforeend", `<b class="cnt-b mono">${total}</b>`); });
}
function shell(tab, title, sub, body) {
  const items = staffNav(ME.role);
  const cur = items.find((x) => x.k === tab);
  const nav = items.map((x) => x.g ? `<p class="snav-g">${x.g}</p>` : `<a class="snav-i" href="#/portal/${x.k}" aria-current="${x.k === tab ? "page" : "false"}"><span>${x.l}</span></a>`).join("")
    + `<p class="snav-g">${esc(ME.name)}</p><button class="snav-i" data-act="signout"><span>Sign out</span></button>`;
  const brand = ["adm_officer", "adm_admin"].includes(ME.role) ? "Jobnest Admissions" : ME.role === "super" ? "Jobnest" : "Jobnest Academy";
  app.innerHTML = `<header class="adm-top role-top"><div class="shell-top"><div class="logo">${LOGO}${brand} · ${ROLE_NAMES[ME.role]}</div>
    <div class="shell-tr"><span class="note" style="color:#C9D6E2">${esc(ME.name)}</span><button class="btn sm ghost" data-act="signout">Sign out</button></div></div></header>
    <div class="shell"><aside class="snav" aria-label="Menu">${nav}</aside>
    <main class="shell-main"><details class="snav-m"><summary><span>Menu</span><b>${cur ? cur.l : ""}</b></summary><nav class="snav-m-list">${nav}</nav></details>
    <div class="wrap greet"><div><p class="eyebrow">${brand} · ${ROLE_NAMES[ME.role]}</p><h1 style="margin-top:.5rem">${title}</h1>${sub ? `<p class="note" style="font-size:.95rem;margin-top:.4rem;max-width:62ch">${sub}</p>` : ""}</div></div>
    <section class="wrap pagebody">${body}</section></main></div>`;
  paintBadges();
}

async function pagePortal(tab) {
  if (!auth.session) return go("#/staff");
  if (isStudent()) return go("#/learn");
  loading();
  try { if (!ME || ME.email !== auth.session.email) ME = await rpc("me"); } catch (e) { if (e.status === 401) { await auth.signOut(); return pageStaffSignIn("Your session ended. Please sign in again."); } throw e; }
  if (!ME) {
    app.innerHTML = staffCard(`<h1>No staff access yet</h1><p>You're signed in as <b>${esc(auth.session?.email || "")}</b>, but this email hasn't been added as staff. Ask the Super Admin to add you, then sign in again.</p><div class="actions"><button class="btn ghost" data-act="signout">Sign out</button></div>`);
    return;
  }
  const items = staffNav(ME.role).filter((x) => x.k);
  if (!items.some((x) => x.k === tab)) tab = items[0].k;
  const pages = { home: tabHome, calls: tabCalls, times: tabTimes, decide: tabDecide, pay: tabPay, apps: tabApps, students: tabStudents, content: tabContent, grading: tabGrading, intern: tabIntern, dc2: tabDc2, jobs: tabJobs, pods: tabPods, support: tabSupport, discussion: tabDiscussion, opps: tabOpps, outcomes: tabOutcomes, sessions: tabSessions, news: tabNews, emails: tabEmails, settings: tabSettings, staff: tabStaff, audit: tabAudit, soon: tabSoon };
  const counts = Promise.all([rpc("staff_counts").catch(() => ({})), rpc("staff_counts_extra").catch(() => ({}))]).then(([x, y]) => ({ ...(x || {}), ...(y || {}) }));
  try { await pages[tab](); }
  catch (e) { shell(tab, "Something went wrong", "", `<div class="notice">${esc(e.message)}</div>`); }
  ui.counts = await counts; paintBadges();
}

function tabSoon() {
  shell("soon", `Welcome, ${esc(ME.name.split(" ")[0])}`, "", `<div class="card"><h3>The Academy portal is coming next</h3><p>Your ${ROLE_NAMES[ME.role]} dashboard opens in the next phase of the build, before Cohort 1 starts. Your account is ready.</p></div>`);
}

/* ---------- admissions: shared pieces ---------- */
const nextStep = (a) => ({ "Assessment pending": "Waiting for the assessment", "Call to book": "Waiting for them to book a call",
  "Call booked": a.dc1_at ? `Call · ${fmtAt(a.dc1_at)} · ${a.officer_name || ""}` : "Complete call", "Under review": "Decide: offer, waitlist or decline",
  "Offer sent": a.offer_deadline ? `Waiting for payment · by ${fmtDay(a.offer_deadline)}` : "Waiting for payment", "Waitlisted": "On the waitlist",
  "Admitted": `Admitted · ${a.matric || ""}`, "Offer declined": "Declined the offer", "Assessment failed": `Scored ${a.score}% on the assessment`, "Not selected": "Not selected", "Offer expired": "Didn't pay in time",
  "Deferred": "Moved to the next batch", "Closed: no matching track": `Interested in ${a.wanted || ""}` }[a.status] || a.status);
const details = (a) => `<dl class="kv app-kv"><div><dt>Contact</dt><dd>${esc(a.email)} · ${esc(a.phone)} · ${esc(a.city)}</dd></div>
  <div><dt>Background</dt><dd>${esc(a.edu)} · NYSC: ${esc(a.nysc)} · ${esc(a.situation)}</dd></div>
  <div><dt>Readiness</dt><dd>15h/week: ${esc(a.hours)} · Laptop: ${esc(a.laptop)} · Internet: ${esc(a.internet)}${a.score != null ? ` · Assessment <b>${a.score}%</b>${a.score_digital != null ? ` (digital ${a.score_digital}%, communication ${a.score_comms}%)` : ""}` : ""}</dd></div>
  <div><dt>Motivation</dt><dd>${esc(a.motivation)}</dd></div>
  <div><dt>Zuri summary</dt><dd style="white-space:pre-line">${a.zuri_summary ? esc(a.zuri_summary) : `<span class="note">None. Explore options on the call.</span>`}</dd></div>
  ${a.wanted ? `<div><dt>Interested in</dt><dd><b>${esc(a.wanted)}</b> · no matching track</dd></div>` : ""}
  ${a.dc1_at ? `<div><dt>Discovery Call 1</dt><dd>${fmtAt(a.dc1_at)} with ${esc(a.officer_name || "")}${a.dc1_note ? ` · “${esc(a.dc1_note)}”` : ""}</dd></div>` : ""}
  ${a.offer_deadline && a.status === "Offer sent" ? `<div><dt>Offer deadline</dt><dd>${fmtLong(a.offer_deadline)}</dd></div>` : ""}
  ${a.matric ? `<div><dt>Matric number</dt><dd><b class="mono">${esc(a.matric)}</b> · paid ${naira(a.paid_total)}${a.plan === "two" ? " (2 instalments)" : " in full"}</dd></div>` : ""}</dl>`;
const recCard = (a) => a.rec ? `<div class="rec rec-${a.rec.d}"><span class="eyebrow">Admissions Officer's recommendation · ${esc(a.rec.by)}</span><b>${REC_L[a.rec.d]}</b><span class="note">“${esc(a.rec.why)}”</span></div>` : "";
const decCard = (a) => a.decided_by ? `<p class="note">Decided by ${esc(a.decided_by)} · ${fmtAt(a.decided_at)}${a.rec ? (REC_X[a.rec.d] === a.decision ? " · followed the recommendation" : " · <b>different from the recommendation</b>") : ""}</p>` : "";
const decideButtons = (a) => `<div class="actions">${a.rec && a.status === "Under review" ? `<button class="btn sm gold" data-act="decide" data-x="${REC_X[a.rec.d]}" data-k="${a.id}">Approve: ${REC_L[a.rec.d]}</button>` : ""}
  <button class="btn sm ${a.rec && a.status === "Under review" ? "ghost" : ""}" data-act="decide" data-x="offer" data-k="${a.id}">Send offer</button>
  ${a.status !== "Waitlisted" ? `<button class="btn sm ghost" data-act="decide" data-x="waitlist" data-k="${a.id}">Waitlist</button>` : ""}
  <button class="btn sm ghost" data-act="decide" data-x="reject" data-k="${a.id}">Not selected</button><button class="btn sm ghost" data-act="decide" data-x="defer" data-k="${a.id}">Defer to next batch</button></div>`;

function callForm(a, tracks) {
  const id = a.id;
  return `<form class="form call-form" data-k="${id}" novalidate><div class="field"><label for="dn-${id}">Call notes</label><textarea id="dn-${id}" placeholder="What you discussed and agreed" rows="2"></textarea></div>
    <div class="field"><label for="dt-${id}">Agreed track (required)</label><select id="dt-${id}" data-act-change="track" data-k="${id}"><option value="">Choose the track you agreed</option>${tracks.filter((t) => !t.paused).map((t) => `<option value="${t.code}">${esc(t.name)}</option>`).join("")}<option value="NONE">No available track for this person</option></select></div>
    <div class="field" id="wi-${id}" hidden><label for="wt-${id}">What are they interested in?</label><select id="wt-${id}" data-act-change="interest" data-k="${id}"><option value="">Choose one</option>${INTERESTS.map((o) => `<option>${o}</option>`).join("")}<option value="Other">Other (type it)</option></select><input id="wo-${id}" placeholder="e.g. Nursing" hidden style="margin-top:.4rem"><span class="note">This closes the application and tells them kindly why.</span></div>
    <div class="field" id="ri-${id}"><span class="lbl">Your recommendation to the Admissions Admin</span><div class="rate">${Object.entries(REC_L).map(([v, l]) => `<label><input type="radio" name="rec-${id}" value="${v}"><span>${l}</span></label>`).join("")}</div><input class="rw" id="rw-${id}" placeholder="One line on why, e.g. Clear goal, strong assessment" style="margin-top:.4rem"></div>
    <div class="actions"><button class="btn sm" type="submit">Complete call</button></div></form>`;
}

function appRow(a, mode, tracks) {
  const ini = ((a.first_name[0] || "") + (a.surname[0] || "")).toUpperCase();
  const g = groupOf(a), dec = ["Under review", "Waitlisted"].includes(a.status);
  let acts = "";
  const calLink = a.status === "Call booked" && a.dc1_at ? `<p><a class="link sm" href="${esc(gcalUrl(a.dc1_at, 15, `Discovery Call: ${a.first_name} ${a.surname} (${a.ref})`, `Jobnest Academy Discovery Call with ${a.first_name} ${a.surname}, ${a.ref}.`, "Microsoft Teams"))}" target="_blank" rel="noopener">Add to Google Calendar ↗</a></p>` : "";
  if (a.status === "Call booked" && ["adm_officer", "super"].includes(ME.role) && (ME.role === "super" || a.officer_email === ME.email)) acts = calLink + callForm(a, tracks);
  else if (a.status === "Call booked") acts = `<p class="note">Booked with ${esc(a.officer_name || "")}. The Admissions Officer holds the call and recommends.</p>`;
  else if (dec && ["adm_admin", "super"].includes(ME.role)) acts = decideButtons(a);
  else if (dec) acts = `<p class="note">${a.status === "Under review" ? "Waiting for the Admissions Admin to decide." : "The Admissions Admin can send an offer when a seat frees up."}</p>`;
  const hidden = mode === "list" && (ui.q ? !(`${a.first_name} ${a.surname} ${a.email} ${a.ref}`.toLowerCase().includes(ui.q)) : g !== ui.admG);
  return `<details class="arow" data-id="${a.id}" data-g="${g}" ${ui.open === a.id ? "open" : ""} ${hidden ? "hidden" : ""}><summary><span class="aav">${esc(ini)}</span><span class="an"><b>${esc(a.first_name)} ${esc(a.surname)}</b><span class="note">${esc(a.ref)} · ${esc(a.track_name || "Track not agreed yet")}</span></span><span class="anext">${esc(nextStep(a))}</span>${pill(a.status)}</summary>
    <div class="abody">${details(a)}${recCard(a)}${decCard(a)}${acts ? `<div class="staff-act">${acts}</div>` : ""}
      <details class="atl" data-act-toggle="timeline" data-k="${a.id}"><summary class="link sm">Timeline & emails</summary><div class="tl-body"><p class="note">Loading…</p></div></details></div></details>`;
}

async function loadAdm() {
  const [apps, ov] = await Promise.all([rpc("adm_applications"), rpc("adm_overview")]);
  return { apps, ov };
}

/* ---------- admissions: tabs ---------- */
async function tabHome() {
  const [{ apps, ov }, slots] = await Promise.all([loadAdm(), rpc("officer_slots")]);
  const mine = apps.filter((a) => a.status === "Call booked" && (ME.role === "super" || a.officer_email === ME.email)).sort((x, y) => new Date(x.dc1_at) - new Date(y.dc1_at));
  const open = slots.filter((s) => !s.booked_by && new Date(s.at) > new Date()).length;
  const todo = [[mine.length, "Discovery Calls to hold and complete", "calls"], [open ? 0 : 1, "Add call times so applicants can book", "times"]].filter((x) => x[0]);
  const next = mine[0];
  shell("home", "Admissions Officer", `${esc(ov.cohort?.name || "")} · Discovery Calls and recommendations.`, `<div class="grid2">
    <div class="card"><div class="ch"><h3>Your to-do list</h3><span class="note">${todo.length ? `${todo.length} thing${todo.length === 1 ? "" : "s"}` : "All clear"}</span></div>
      ${todo.length ? `<ul class="todo">${todo.map(([n, l, t]) => `<li><span class="mono cnt-b">${n}</span><span>${l}</span><a class="link sm" href="#/portal/${t}">Open →</a></li>`).join("")}</ul>` : empty("Nothing waiting for you. 🎉")}</div>
    <div class="card"><h3>Next call</h3>${next ? `<p style="margin-top:.6rem"><b>${esc(next.first_name)} ${esc(next.surname)}</b><br><span class="note">${fmtLong(next.dc1_at)}, ${fmtTime(next.dc1_at)} WAT · 15 minutes</span></p><p class="note">${next.zuri_summary ? "Has a Zuri summary. Read it before the call." : "No Zuri summary. Explore their interests on the call."}</p><div class="actions"><a class="btn sm" href="#/portal/calls">Open call notes</a></div>` : empty("No calls booked.")}</div></div>
    <div class="kpis" style="margin-top:1rem">${[["Calls booked", mine.length], ["Open call times", open], ["Waiting to book", apps.filter((a) => a.status === "Call to book").length], ["Applications", apps.length]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>`);
}

async function tabCalls() {
  const { apps, ov } = await loadAdm();
  const calls = apps.filter((a) => a.status === "Call booked" && (ME.role !== "adm_officer" || a.officer_email === ME.email)).sort((x, y) => new Date(x.dc1_at) - new Date(y.dc1_at));
  if (calls.length && !ui.open) ui.open = calls[0].id;
  shell("calls", "Discovery Calls", "Hold the call, agree the track, then recommend offer, waitlist or decline. The Admissions Admin makes the decision.",
    calls.length ? `<div class="arows">${calls.map((a) => appRow(a, "calls", ov.tracks)).join("")}</div>` : `<div class="card">${empty("No calls booked right now. Make sure your call times are added.")}</div>`);
}

async function tabTimes() {
  const slots = await rpc("officer_slots");
  const days = [...Array(14)].map((_, i) => { const d = new Date(Date.now() + (i + 1) * 864e5); return fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"); })
    .filter((iso) => { const wd = new Date(iso + "T12:00:00Z").getUTCDay(); return wd !== 0 && wd !== 6; });
  const upcoming = slots.filter((s) => new Date(s.at) > new Date());
  shell("times", "Call times", "Applicants who pass the assessment pick from these times. Each call is 15 minutes. Times are in WAT.",
    `<div class="grid2"><form class="card form" id="times-form" novalidate><h3>Add times</h3>
      <div class="field"><span class="lbl">Days</span><div class="chips-row">${days.map((d) => `<label class="chip-cb"><input type="checkbox" name="day" value="${d}"><span>${fmt(d + "T12:00:00Z", { weekday: "short", day: "numeric", month: "short" })}</span></label>`).join("")}</div></div>
      <div class="field"><span class="lbl">Times</span><div class="chips-row">${CALL_TIMES.map((t) => `<label class="chip-cb"><input type="checkbox" name="time" value="${t}"><span>${t}</span></label>`).join("")}</div></div>
      <p class="err" id="t-err" role="alert"></p><div><button class="btn" type="submit">Add these times</button></div></form>
    <div class="card"><div class="ch"><h3>Your upcoming times</h3><span class="note">${upcoming.filter((s) => !s.booked_by).length} open · ${upcoming.filter((s) => s.booked_by).length} booked</span></div>
      ${upcoming.length ? `<ul class="slot-list">${upcoming.map((s) => `<li><span class="mono">${fmtAt(s.at)}</span>${s.booked_by ? `<span class="pill now">${esc(s.booked_by)}</span>` : `<button class="link sm" data-act="rm-slot" data-k="${s.id}">Remove</button>`}</li>`).join("")}</ul>` : empty("No times yet. Add some so applicants can book.")}</div></div>`);
}

async function tabDecide() {
  const { apps, ov } = await loadAdm();
  const L = apps.filter((a) => ["Under review", "Waitlisted"].includes(a.status)).sort((x, y) => (x.status === "Under review" ? 0 : 1) - (y.status === "Under review" ? 0 : 1));
  const recs = L.filter((a) => a.status === "Under review" && a.rec);
  if (L.length && !ui.open) ui.open = L[0].id;
  shell("decide", "Decisions", `${esc(ov.cohort?.name || "")} · ${apps.length} application${apps.length === 1 ? "" : "s"}`,
    `<div class="card"><div class="ch"><div><h3>Admission decisions</h3><p class="note">The Admissions Officer has spoken to each applicant and made a recommendation. Aim to decide within 2 working days.</p></div></div>
      ${recs.length > 1 ? `<div class="actions" style="margin:.6rem 0"><button class="btn sm gold" data-act="approve-all">Approve all ${recs.length} recommendations</button></div>` : ""}
      ${L.length ? `<div class="arows">${L.map((a) => appRow(a, "decide", ov.tracks)).join("")}</div>` : empty("No admission decisions waiting.")}</div>
    <div class="card" style="margin-top:1rem"><h3>Seats by track</h3><ul class="funnel fsm">${ov.tracks.map((t) => `<li><span>${esc(t.name)}</span><div class="bar"><i style="width:${t.seats ? Math.min(100, (t.used / t.seats) * 100) : 0}%;${t.used >= t.seats ? "background:var(--danger)" : ""}"></i></div><b class="mono">${t.used}/${t.seats}</b></li>`).join("")}</ul><p class="note">Outstanding offers plus admitted learners.</p></div>`);
}

async function tabApps() {
  const { apps, ov } = await loadAdm();
  const cnt = (k) => apps.filter((a) => groupOf(a) === k).length;
  const demand = Object.entries(apps.filter((a) => a.wanted).reduce((m, a) => ((m[a.wanted] = (m[a.wanted] || 0) + 1), m), {})).sort((x, y) => y[1] - x[1]);
  const passed = apps.filter((a) => a.score != null && a.score >= (ov.cohort?.pass_mark || 60)).length;
  const called = apps.filter((a) => a.dc1_note != null || a.wanted).length;
  const offered = apps.filter((a) => ["Offer sent", "Admitted", "Offer expired"].includes(a.status)).length;
  shell("apps", "Applications", `${esc(ov.cohort?.name || "")} · applications are <b>${ov.cohort?.applications_open ? "open" : "closed"}</b>`,
    `<div class="gtiles">${GROUPS.map(([k, l, n]) => `<button class="gtile ${k} ${cnt(k) ? "hot" : ""}" data-act="group" data-k="${k}" aria-pressed="${ui.admG === k && !ui.q}"><span class="eyebrow">${l}</span><b class="mono">${cnt(k)}</b><span class="note">${n}</span></button>`).join("")}</div>
    <div class="adm-grid"><div class="stack"><div class="adm-bar"><label class="sr-only" for="adm-q">Search applications</label><input id="adm-q" type="search" placeholder="Search name, email or APP-ref" value="${esc(ui.q)}"></div>
      ${apps.length ? `<div class="arows">${apps.map((a) => appRow(a, "list", ov.tracks)).join("")}</div>` : ""}
      <p class="empty card" id="adm-empty" hidden></p></div>
    <aside class="stack"><div class="card"><h3>This batch</h3><ul class="funnel fsm">${[["Applied", apps.length], ["Passed assessment", passed], ["Call completed", called], ["Offered", offered], ["Admitted", cnt("admitted")]].map(([l, v]) => `<li><span>${l}</span><div class="bar"><i style="width:${apps.length ? (v / apps.length) * 100 : 0}%"></i></div><b class="mono">${v}</b></li>`).join("")}</ul></div>
      <div class="card"><h3>Track demand</h3>${demand.length ? `<ul class="funnel fsm">${demand.map(([w, n]) => `<li><span>${esc(w)}</span><div class="bar"><i style="width:${(n / demand[0][1]) * 100}%"></i></div><b class="mono">${n}</b></li>`).join("")}</ul>` : `<p class="note">Fields people want that the programme doesn't offer yet. Counted when an officer picks "No available track" after a call.</p>`}</div></aside></div>`);
  filterRows();
}
function filterRows() {
  let n = 0;
  $$(".arows .arow").forEach((r) => { if (!r.hidden) n++; });
  const em = $("#adm-empty");
  if (em) { em.hidden = n > 0; em.textContent = ui.q ? "No applications match that search." : ui.admG === "needs" ? "Nothing needs action right now. 🎉" : "No applications here."; }
}

async function tabPay() {
  const d = await rpc("adm_payments");
  const P = d.people, ok = d.payments.filter((y) => y.status === "success");
  const admitted = P.filter((a) => a.status === "Admitted"), owing = admitted.filter((a) => balanceOf(a) > 0), waiting = P.filter((a) => a.status === "Offer sent");
  const line = (a) => a.status === "Admitted" ? (balanceOf(a) ? `Owes ${naira(balanceOf(a))} · due ${fmtDay(a.fees.due_date + "T12:00:00Z")}` : `Paid in full · ${naira(a.paid_total)}`)
    : a.status === "Offer sent" ? `Offer · pay by ${fmtAt(a.offer_deadline)}` : "Offer expired";
  const ypill = (s) => `<span class="pill ${s === "success" ? "ok" : s === "pending" ? "now" : "bad"}">${{ success: "Paid", pending: "Started", failed: "Failed", abandoned: "Not completed", reversed: "Reversed" }[s] || s}</span>`;
  const PART = { full: "Full fee", part1: "Instalment 1", part2: "Instalment 2" };
  const row = (a) => {
    const mine = d.payments.filter((y) => y.app_ref === a.ref && y.status === "success");
    const canRec = ["Offer sent", "Offer expired"].includes(a.status) || balanceOf(a) > 0;
    return `<details class="arow" data-id="${a.id}" ${ui.open === a.id ? "open" : ""}><summary><span class="aav">${esc(((a.first_name[0] || "") + (a.surname[0] || "")).toUpperCase())}</span><span class="an"><b>${esc(a.first_name)} ${esc(a.surname)}</b><span class="note">${esc(a.matric || a.ref)} · ${esc(a.track_name || "")}</span></span><span class="anext">${esc(line(a))}</span>${pill(a.status)}</summary>
      <div class="abody"><dl class="kv app-kv"><div><dt>Contact</dt><dd>${esc(a.email)} · ${esc(a.phone)}</dd></div>
        <div><dt>Payments</dt><dd>${mine.length ? mine.map((y) => `${naira(y.amount_paid ?? y.amount)} · ${PART[y.part]} · ${fmtAt(y.paid_at)} · ${y.channel === "manual" ? `recorded by staff (${esc(y.note || "")})` : esc(y.channel || "")}`).join("<br>") : "None yet"}</dd></div></dl>
        <div class="staff-act">${canRec ? `<form class="form recpay-form" data-k="${a.id}" novalidate><p class="eyebrow">Record a payment made outside Paystack</p><div class="grid2"><div class="field"><label for="ra-${a.id}">Amount received (₦)</label><input id="ra-${a.id}" type="number" min="1" step="500" inputmode="numeric" value="${a.status === "Admitted" ? balanceOf(a) : a.fees.fee}"></div><div class="field"><label for="rn-${a.id}">Note</label><input id="rn-${a.id}" placeholder="e.g. GTBank transfer, ref 0091"></div></div><div class="actions"><button class="btn sm" type="submit">Record payment</button></div></form>` : ""}
          ${["Offer sent", "Offer expired"].includes(a.status) ? `<div class="actions"><span class="note">Give more time to pay:</span><button class="btn sm ghost" data-act="extend" data-days="3" data-k="${a.id}">+3 days</button><button class="btn sm ghost" data-act="extend" data-days="7" data-k="${a.id}">+7 days</button></div>` : ""}</div></div></details>`;
  };
  shell("pay", "Payments", "Payments through Paystack are recorded automatically. The first payment admits the applicant and gives them a matric number.",
    `<div class="kpis">${[["Admitted", admitted.length], ["Collected", naira(ok.reduce((t, y) => t + (y.amount_paid ?? y.amount), 0))], ["Still owed", naira(owing.reduce((t, a) => t + balanceOf(a), 0))], ["Offers awaiting payment", waiting.length]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    <div class="card" style="margin-top:1rem"><h3>Offers and students</h3>${P.length ? `<div class="arows">${P.map(row).join("")}</div>` : empty("No offers yet.")}</div>
    <div class="card" style="margin-top:1rem"><h3>Every payment attempt</h3><p class="note">Including payments people started but didn't finish.</p>${d.payments.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>When</th><th>Who</th><th>For</th><th>Amount</th><th>Result</th></tr></thead><tbody>
      ${d.payments.map((y) => `<tr><td data-label="When">${fmtAt(y.paid_at || y.at)}</td><td data-label="Who"><b>${esc(y.name)}</b><span class="note" style="display:block">${esc(y.reference)}</span></td><td data-label="For">${PART[y.part]}</td><td data-label="Amount" class="mono">${naira(y.amount_paid ?? y.amount)}</td><td data-label="Result">${ypill(y.status)}${y.note ? `<span class="note" style="display:block">${esc(y.note)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : empty("No payments yet.")}</div>`);
}

async function tabEmails() {
  const L = await rpc("admin_outbox");
  const failed = L.filter((m) => !m.sent_at && m.error).length, waiting = L.filter((m) => !m.sent_at && !m.error).length;
  const st = (m) => m.sent_at ? `<span class="pill ok">Sent ${fmtAt(m.sent_at)}</span>` : m.error ? `<span class="pill bad">Not sent</span>` : `<span class="pill now">Sending…</span>`;
  shell("emails", "Emails", "Every admissions email, sent automatically within about a minute.",
    `${failed ? `<div class="notice"><b>${failed}</b> email${failed === 1 ? "" : "s"} couldn't be sent. Open ${failed === 1 ? "it" : "them"} to see why, then retry or send by hand.</div>` : waiting ? `<div class="notice">${waiting} email${waiting === 1 ? " is" : "s are"} waiting to send. If this doesn't clear within a few minutes, the email service may not be connected yet.</div>` : ""}
    ${L.length ? `<div class="arows" style="margin-top:1rem">${L.map((m) => `<details class="arow mailrow"><summary><span class="an"><b>${esc(m.subject)}</b><span class="note">To ${esc(m.to)} · ${fmtAt(m.at)}</span></span>${st(m)}</summary>
      <div class="abody">${m.error ? `<p class="err">Last error: ${esc(m.error)}</p>` : ""}<pre class="mail-pre" id="mail-${m.id}">${esc(m.body)}${m.link ? `\n\n${esc(m.cta || "Open")}: ${esc(m.link)}` : ""}\n\nThe Jobnest Academy Admissions team</pre>
      <div class="actions"><button class="btn sm ghost" data-act="copy-mail" data-k="${m.id}">Copy email</button>${m.sent_at ? "" : `${m.error ? `<button class="btn sm" data-act="retry-mail" data-k="${m.id}">Try sending again</button>` : ""}<button class="btn sm ghost" data-act="mark-sent" data-k="${m.id}">I sent it by hand</button>`}</div></div></details>`).join("")}</div>` : `<div class="card" style="margin-top:1rem">${empty("No emails yet.")}</div>`}`);
}

async function tabSettings() {
  const [s, unlocked] = await Promise.all([rpc("admin_settings"), rpc("admin_test_unlock", {}).catch(() => false)]);
  const c = s.cohort, p = s.programme;
  const f = (id, label, val, attrs = "") => `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(val ?? "")}" ${attrs}></div>`;
  shell("settings", "Settings", "Changes apply straight away to the Academy site and admissions.",
    `<form class="form" id="settings-form" novalidate><div class="grid2">
      <div class="card"><h3>Cohort</h3>${f("st-name", "Cohort name", c.name)}${f("st-start", "Start date (Monday of Week 1)", c.start_date, 'type="date"')}
        <div class="grid2">${f("st-year", "Matric year (2 digits)", c.year2, 'maxlength="2" inputmode="numeric"')}${f("st-batch", "Batch letter", c.batch, 'maxlength="1"')}</div>
        <label class="consent"><input type="checkbox" id="st-open" ${c.applications_open ? "checked" : ""}> Applications are open</label></div>
      <div class="card"><h3>Admissions rules</h3><div class="grid2">${f("st-pass", "Readiness pass mark (%)", c.pass_mark, 'type="number" min="0" max="100"')}${f("st-n", "Questions per category", c.ready_n, 'type="number" min="1" max="6"')}</div>
        <div class="grid2">${f("st-mins", "Assessment time (minutes)", c.assess_minutes, 'type="number" min="3" max="60"')}</div>
        <div class="grid2">${f("st-days", "Days to accept and pay", c.offer_days, 'type="number" min="1" max="30"')}${f("st-due", "2nd instalment due before week", c.inst_due_week, 'type="number" min="2" max="17"')}</div></div>
      <div class="card"><h3>Fee</h3><div class="grid2">${f("st-fee", "Full fee (₦)", p.fee, 'type="number" min="0" step="1000"')}${f("st-pct", "Extra for 2 instalments (%)", p.inst_pct, 'type="number" min="0" max="50"')}</div><p class="note">2 instalments total: ${naira(p.inst_total)}</p></div>
      <div class="card"><h3>Seats by track</h3>${s.tracks.map((t) => `<div class="grid2" style="align-items:end"><div class="field"><label for="seat-${t.code}">${esc(t.name)}</label><input id="seat-${t.code}" type="number" min="0" value="${t.seats}" data-track="${t.code}"></div><label class="consent"><input type="checkbox" id="pause-${t.code}" ${t.paused ? "checked" : ""}> Paused</label></div>`).join("")}</div>
      <div class="card"><h3>Links</h3>${f("st-site", "Academy address", s.site.site_url, 'type="url"')}${f("st-web", "Jobnest website", s.site.website_url, 'type="url"')}${f("st-call", "Discovery Call meeting link (Teams)", s.site.call_link, 'type="url"')}${f("st-zuri", "Zuri chat link", s.site.zuri_url, 'type="url"')}</div>
      <div class="card"><h3>Landing page</h3><p class="note">Optional. Each part shows on the Academy landing page only once it's filled in.</p>
        ${f("st-info", "Free info session link (e.g. a booking form)", s.site.info_session_url, 'type="url"')}${f("st-sample", "Sample lesson link", s.site.sample_lesson_url, 'type="url"')}
        <p class="lbl" style="margin-top:.6rem">Who supports you: names and photo links</p>
        ${TEAM.map(([r], i) => { let tm = {}; try { tm = JSON.parse(s.site.team || "{}") || {}; } catch { /* empty */ } const m = tm[r] || {};
          return `<div class="grid2">${f(`st-tn${i}`, `${r}: name`, m.name || "")}${f(`st-tp${i}`, `${r}: photo link`, m.photo || "", 'type="url"')}</div>`; }).join("")}</div>
      <div class="card"><h3>Testing</h3><p class="note">Opens every week of the student portal now, so the team can test lessons and tasks before the start date. Turn it off before launch.</p>
        <label class="consent"><input type="checkbox" id="st-unlock" ${unlocked ? "checked" : ""}> <span>Open all portal weeks for testing</span></label>
        <p class="note" id="st-unlock-msg" style="color:var(--danger,#B42318);font-weight:600">${unlocked ? "On: students can see every week right now." : ""}</p></div>
      <div class="card"><h3>Admission letter</h3><p class="note">Printed at the bottom of every admission letter.</p>${f("st-sname", "Signed by (full name)", s.site.signer_name)}${f("st-stitle", "Their title", s.site.signer_title)}</div>
    </div><p class="err" id="st-err" role="alert"></p><div class="actions" style="margin-top:1rem"><button class="btn" type="submit">Save settings</button></div></form>`);
}

async function tabStaff() {
  const L = await rpc("super_staff");
  await info().catch(() => null);
  const opts = Object.entries(ROLE_NAMES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  shell("staff", "Staff accounts", "Add someone here, then they create their password from “First time? Set up your account” on the staff sign-in page.",
    `<div class="grid2"><form class="card form" id="staff-form" novalidate><h3>Add or change a staff member</h3>
      <div class="field"><label for="sf-email">Work email</label><input id="sf-email" placeholder="e.g. kemi@jobnestcareers.com" type="email"></div>
      <div class="field"><label for="sf-name">Full name</label><input id="sf-name" placeholder="e.g. Kemi Adeyemi"></div>
      <div class="field"><label for="sf-role">Role</label><select id="sf-role">${opts}</select></div>
      <div class="field"><label for="sf-track">Track (facilitators)</label><select id="sf-track"><option value="">All tracks</option>${(INFO?.tracks || []).map((t) => `<option value="${t.code}">${esc(t.name)}</option>`).join("")}</select><span class="note">A facilitator with a track only sees and marks that track.</span></div>
      <label class="consent"><input type="checkbox" id="sf-active" checked> Active (can sign in)</label>
      <p class="err" id="sf-err" role="alert"></p><div><button class="btn" type="submit">Save</button></div></form>
    <div class="card"><h3>Everyone</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${L.map((s) => `<tr><td><b>${esc(s.full_name)}</b><span class="note" style="display:block">${esc(s.email)}</span></td><td>${ROLE_NAMES[s.role] || s.role}${s.track_code ? `<span class="note" style="display:block">${esc(s.track_code)}</span>` : ""}</td><td>${s.active ? `<span class="pill ok">Active</span>` : `<span class="pill bad">Suspended</span>`}</td>
        <td><button class="link sm" data-act="edit-staff" data-email="${esc(s.email)}" data-name="${esc(s.full_name)}" data-role="${s.role}" data-active="${s.active}" data-track="${s.track_code || ""}">Edit</button></td></tr>`).join("")}</tbody></table></div></div></div>`);
}

async function tabAudit() {
  const L = await rpc("super_audit");
  shell("audit", "Activity log", "Changes made by staff.", `<div class="card">${L.length ? `<ul class="hist">${L.map((l) => `<li><span class="mono note">${fmtAt(l.at)}</span><span><b>${esc(l.actor)}</b> ${esc(l.text)}</span></li>`).join("")}</ul>` : empty("Nothing yet.")}</div>`);
}

/* ---------- student portal ---------- */
const STUDENT_DOMAIN = "@students.jobnestcareers.com";
const loginOf = (m) => m.trim().toLowerCase().replace(/\//g, "-") + STUDENT_DOMAIN;
const isStudent = () => !!auth.session?.email?.endsWith(STUDENT_DOMAIN);
const KIND_I = { lesson: "📘", video: "▶️", reading: "📄", file: "📎", link: "🔗" };
const KIND_L = { lesson: "Lesson", video: "Video", reading: "Reading", file: "File", link: "Link" };
const stageOf = (w) => { const s = [[1, 1, 0], [2, 3, 1], [4, 7, 2], [8, 9, 3], [10, 13, 4], [14, 14, 5], [15, 15, 6], [16, 17, 7]].find(([a, b]) => w >= a && w <= b); return s ? ROUTE_STOPS[s[2]][1] : ""; };
const watParts = (d) => { const p = fmt(d, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).split(", "); return { date: p[0].split("/").reverse().join("-"), time: p[1] }; };
const lines = (t) => esc(t || "").replace(/\n/g, "<br>");
const ago = (d) => { const m = (Date.now() - new Date(d)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDay(d); };
let CAMPUS = null;

function pageAccount(a, base) {
  const tok = base.split("/").pop();
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><div class="card verify"><span class="eyebrow">Jobnest Academy · Student portal</span>
    <h1>${a.account_set ? "Choose a new password" : "Set up your student account"}</h1>
    <p>Hi ${esc(a.first_name)}. You'll sign in with your matric number and the password you choose here.</p>
    <form id="account-form" class="form" data-ref="${esc(a.ref)}" data-token="${esc(tok)}" data-matric="${esc(a.matric)}" novalidate>
      <div class="field"><label for="ac-m">Matric number</label><input id="ac-m" value="${esc(a.matric)}" readonly autocomplete="username"></div>
      <div class="field"><label for="ac-p">Password</label><input id="ac-p" placeholder="At least 8 characters" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
      <div class="field"><label for="ac-p2">Confirm password</label><input id="ac-p2" placeholder="Type it again" type="password" autocomplete="new-password"></div>
      <p class="err" id="ac-err" role="alert"></p><div><button class="btn gold" type="submit">Save and open the portal</button></div></form>
    <p class="note"><a class="link" href="${base}">← Back to your application</a></p></div></section>`;
}

const learnCard = (h) => pubHeader("admissions").replace("Jobnest Admissions", "Jobnest Academy") + `<section class="wrap pub-wrap"><div class="card verify">${h}</div></section>` + pubFoot();
function pageLearnSignIn(msg = "") {
  app.innerHTML = learnCard(`<span class="eyebrow">Student portal</span><h1>Sign in</h1>${msg ? `<div class="notice">${msg}</div>` : ""}
    <form id="lsignin-form" class="form" novalidate><div class="field"><label for="ls-m">Matric number</label><input id="ls-m" placeholder="GEP/27A/001" autocomplete="username" autocapitalize="characters"></div>
    <div class="field"><label for="ls-p">Password</label><input id="ls-p" placeholder="Your password" type="password" autocomplete="current-password"></div>
    <p class="err" id="ls-err" role="alert"></p><div><button class="btn" type="submit">Sign in</button></div></form>
    <div class="notice"><span><b>First time here, or forgot your password?</b> We'll email you a link to set it.</span><a class="btn sm ghost" href="#/learn/forgot">Get a link</a></div>
    <p class="note">Your matric number is in your admission email, and looks like GEP/27A/001.</p>`);
}
function pageLearnForgot() {
  app.innerHTML = learnCard(`<span class="eyebrow">Student portal</span><h1>Set your password</h1><p class="note">First time, or forgot your password? Enter your matric number and we'll email a link to the address you applied with.</p>
    <form id="lforgot-form" class="form" novalidate><div class="field"><label for="lf-m">Matric number</label><input id="lf-m" placeholder="GEP/27A/001" autocapitalize="characters"></div>
    <p class="err" id="lf-err" role="alert"></p><div><button class="btn" type="submit">Email me a link</button></div></form>
    <p class="note"><a class="link" href="#/learn/signin">Back to sign in</a></p>`);
}

function sessionRow(x) {
  const st = new Date(x.starts_at), end = new Date(st.getTime() + x.minutes * 6e4), now = new Date();
  const live = now >= new Date(st - 30 * 6e4) && now <= end, past = now > end;
  const att = { present: "Present", late: "Late", absent: "Absent", excused: "Excused", joined: "Joined" }[x.att];
  return `<li class="sess ${live ? "live" : ""}"><div class="date"><b>${fmt(st, { day: "numeric" })}</b><small>${fmt(st, { month: "short" })}</small></div>
    <div><b>${esc(x.title)}</b><span class="note" style="display:block">${fmt(st, { weekday: "long" })}, ${fmtTime(st)}–${fmtTime(end)} WAT${x.host ? ` · ${esc(x.host)}` : ""}</span></div>
    ${past ? (att ? `<span class="pill ${["present", "late", "joined"].includes(x.att) ? "ok" : "bad"}">${att}</span>` : `<span class="note">Ended</span>`)
      : x.link ? `<button class="btn sm ${live ? "gold" : "ghost"}" data-act="join" data-k="${x.id}">${live ? "Join now" : "Join link"}</button>` : `<span class="note">Link coming</span>`}</li>`;
}

/* ---------- add to home screen ---------- */
let INSTALL_EVT = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); INSTALL_EVT = e; if ($("#inst-card")) $("#inst-card").hidden = false; });
window.addEventListener("appinstalled", () => { INSTALL_EVT = null; $("#inst-card")?.remove(); try { localStorage.setItem("jn.installed", "1"); } catch { /* ignore */ } toast("Added to your home screen"); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("/sw.js").catch(() => {});
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function installCard() {
  let off = false; try { off = localStorage.getItem("jn.install.off") === "1" || localStorage.getItem("jn.installed") === "1"; } catch { /* ignore */ }
  if (isStandalone() || off) return "";
  const ios = isIOS(), canPrompt = !!INSTALL_EVT;
  const how = ios ? `Tap <b>Share</b> <span aria-hidden="true">⎙</span> at the bottom of Safari, then <b>Add to Home Screen</b>.`
    : canPrompt ? "Open your portal in one tap, like an app." : `Open your browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.`;
  return `<div class="card inst-card" id="inst-card"><span class="inst-ico" aria-hidden="true">${LOGO}</span><div class="inst-t"><b>Add Jobnest Academy to your home screen</b><span>${how}</span></div>
    <div class="inst-a">${canPrompt ? `<button class="btn gold sm" data-act="install">Add to home screen</button>` : ""}<button class="link sm" data-act="install-off">Not now</button></div></div>`;
}
function progressCard(C, cert) {
  const wd = LS.W.filter((_, i) => weekDone(i)).length, avg = avgScore();
  const past = (C.sessions || []).filter((x) => new Date(x.starts_at).getTime() + x.minutes * 6e4 < Date.now());
  const came = past.filter((x) => ["present", "late", "joined"].includes(x.att)).length;
  const projWk = LS.W.findIndex((w) => w.stage === 3), internEnd = LS.W.map((w, i) => (w.stage === 4 ? i : -1)).filter((i) => i >= 0).at(-1);
  const B = [["✍️", "Oath signed", oathSigned()], ["✅", "First week passed", wd >= 2], ["🔥", "5 weeks done", wd >= 5],
    ["💼", "Client project", projWk >= 0 && weekDone(projWk + 1)], ["🏢", "Internship", internEnd != null && weekDone(internEnd)], ["🎓", "Graduate", !!cert]];
  return `<div class="card prog-card"><h3>Your progress</h3>
    <div class="prog-stats"><div><b class="mono">${wd}/${LS.W.length}</b><span>weeks done</span></div><div><b class="mono">${avg != null ? avg + "%" : "–"}</b><span>average</span></div><div><b class="mono">${past.length ? Math.round((came / past.length) * 100) + "%" : "–"}</b><span>attendance</span></div></div>
    <div class="badges" aria-label="Badges">${B.map(([e, t, on]) => `<span class="badge ${on ? "on" : ""}" title="${t}${on ? "" : " (not yet)"}"><i aria-hidden="true">${e}</i>${t}</span>`).join("")}</div></div>`;
}

/* =========================================================
   Student portal (follows the approved prototype)
   Home · My Learning (stages and weeks) · More: Assignments, My Cohort, Profile, Help
   ========================================================= */
let LS = null; // { C: student_campus, L: learn_state, W: weeks for my track, stages }
const DAY = 864e5;
const LICON = {
  lesson: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>`,
  quiz: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>`,
  task: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  logweek: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>`,
  oath: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0"/></svg>`,
  guide: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>`,
  lock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  file: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>`,
  done: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5 9-10"/></svg>`,
};
const LKIND = { lesson: "Video lesson", quiz: "Assessment", task: "Activity", logweek: "Internship logbook", oath: "Student Oath", guide: "Getting started" };
const STAFF_STEPS = ["Supervisor grading", "Supervisor performance evaluation"];
const PLEDGES = [
  "I will attend my live sessions and complete every week of the programme on time.",
  "I will submit only my own work, and credit others honestly when I use their ideas.",
  "I will treat my classmates, facilitators and host organisations with respect.",
  "I will communicate early and clearly whenever I am stuck or need help.",
  "I will take feedback openly and use it to improve.",
  "I will represent Jobnest Academy professionally during my client project and internship.",
  "I will keep going when it gets hard, because I am building a career I am proud of.",
];
const LESSON_TPL = [
  () => "Employers notice this quickly. Start by practising it on one real task this week, then make it part of your routine.",
  () => "Most new hires skip this step. Doing it consistently is an easy way to stand out in your first 90 days.",
  () => "Think of a recent task where this would have helped. What would you do differently next time?",
  () => "Keep it simple at first. Small, repeated habits matter more than getting it perfect once.",
];
const RUBRIC = [["Meets the brief", "All required parts are delivered and follow the instructions.", 30], ["Quality & accuracy", "Work is correct, complete and shows the skills taught.", 30],
  ["Clarity & presentation", "Easy to follow, well organised and professional.", 20], ["Timeliness", "Submitted by the deadline.", 20]];
const LB_FIELDS = [
  { sec: "Week details", fields: [{ k: "from", l: "Week starting", t: "date", req: 1 }, { k: "to", l: "Week ending", t: "date", req: 1 },
    { k: "days", l: "Days worked", t: "number", min: 0, max: 7, req: 1 }, { k: "hours", l: "Total hours worked", t: "number", min: 0, max: 80, req: 1 }] },
  { sec: "Work done", fields: [{ k: "tasks", l: "What tasks did you complete this week?", t: "area", req: 1, ph: "List each task and what you delivered." },
    { k: "tools", l: "Which tools or software did you use?", t: "text", ph: "e.g. Excel, Google Sheets, Trello, Zendesk" },
    { k: "meetings", l: "Which meetings or stand-ups did you attend?", t: "area", ph: "e.g. Daily stand-up (Mon–Fri), weekly review with supervisor" },
    { k: "evidence", l: "Link to evidence of your work (optional)", t: "url", ph: "https://" }] },
  { sec: "Learning & reflection", fields: [{ k: "skills", l: "What new skills did you learn or practise?", t: "area", req: 1 },
    { k: "challenges", l: "What challenges did you face, and how did you solve them?", t: "area", req: 1 },
    { k: "feedback", l: "What feedback did you receive from your supervisor or team?", t: "area" },
    { k: "next", l: "What are your goals for next week?", t: "area", req: 1 }] },
];
const LB_FINAL = { k: "achievement", l: "What was your biggest achievement during this internship?", t: "area", req: 1 };
const MORE_PAGES = [["assignments", "Assignments & Projects", "Submissions, grades and feedback"], ["cohort", "My Cohort", "Pod, live sessions, announcements, discussion"],
  ["career", "My Career", "Goals, skills, readiness, interview prep", 13], ["opps", "Opportunities", "Jobs, internships and applications", 15],
  ["profile", "Profile & Achievements", "Student ID, certificate, badges"], ["graduate", "Graduation & next steps", "Certificate, your job news, alumni check-ins"], ["help", "Help & Support", "FAQs and how to get help"]];

/* ---------- derived state ---------- */
const lsStart = () => new Date(LS.L.start_date + "T00:00:00+01:00");
const weekStartAt = (wi) => new Date(lsStart().getTime() + wi * 7 * DAY);
const weekDue = (wi) => new Date(weekStartAt(wi).getTime() + 4 * DAY + 17 * 36e5);
const graceDue = (wi) => new Date(weekStartAt(wi).getTime() + 6 * DAY + (23 * 60 + 59) * 6e4);
const fmtD = (d) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
const PASS = () => LS.L.pass_mark || 70;
const row = (it) => LS.L.progress[it.key];
const isDoneIt = (it) => { const r = row(it); return !!r && r.status !== "revise"; };
function itemScoreIt(it) { const r = row(it); if (!r) return null; if (it.type === "quiz") return r.score ?? null; if (it.proj) return r.status === "graded" ? r.score : null; return null; }
function weekProgress(wi) { let d = 0, n = 0; LS.W[wi].items.forEach((it) => { if (it.opt) return; n++; if (isDoneIt(it)) d++; }); return { d, n, pct: n ? Math.round((d / n) * 100) : 100 }; }
const weekItemsDone = (wi) => { const p = weekProgress(wi); return p.d === p.n; };
function weekGate(wi) {
  const wk = LS.W[wi]; if (!wk || wk.stage < 1 || wk.stage > 3) return null;
  const qi = wk.items.findIndex((x) => x.type === "quiz"), pi = wk.items.findIndex((x) => x.proj);
  const q = qi >= 0 ? itemScoreIt(wk.items[qi]) : null, pr = pi >= 0 ? row(wk.items[pi]) : null, p = pr && pr.status === "graded" ? pr.score : null;
  const g = { qi, pi, q, p, hasQuiz: qi >= 0, attempt: LS.L.attempts[wi + 1] || 1 };
  if (pr && pr.status === "revise") return { ...g, state: "revise" };
  if (!weekItemsDone(wi)) return { ...g, state: "open" };
  if (pi >= 0 && p == null) return { ...g, state: "grading" };
  g.avg = Math.round(qi >= 0 && pi >= 0 ? (q + p) / 2 : pi >= 0 ? p : q ?? 100);
  g.state = g.avg >= PASS() ? "pass" : "fail"; return g;
}
const weekDone = (wi) => { if (!weekItemsDone(wi)) return false; const g = weekGate(wi); return !g || g.state === "pass"; };
const dateOpen = (wi) => wi === 0 || Date.now() >= weekStartAt(wi).getTime() - 2 * DAY;
function unlockedW(wi) { if (LS.L.unlock_all || wi === 0) return true; return weekDone(wi - 1) && dateOpen(wi); }
const curWeek = () => { const i = LS.W.findIndex((_, wi) => !weekDone(wi)); return i < 0 ? LS.W.length - 1 : i; };
const oathSigned = () => { const it = LS.W[0].items.find((x) => x.type === "oath"); return it ? isDoneIt(it) : true; };
function weekScore(wi) { const sc = LS.W[wi].items.map(itemScoreIt).filter((x) => x != null); return sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null; }
function avgScore() { const sc = LS.W.map((_, i) => weekScore(i)).filter((x) => x != null); return sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null; }
function findItem(key) { for (let wi = 0; wi < LS.W.length; wi++) { const ii = LS.W[wi].items.findIndex((x) => x.key === key); if (ii >= 0) return { wi, ii, it: LS.W[wi].items[ii] }; } return null; }
function lsSessions() { return (LS.C.sessions || []).map((s) => ({ ...s, at: new Date(s.starts_at), wi: Math.floor((new Date(s.starts_at) - lsStart()) / (7 * DAY)) })); }
function dueLabel(d) { const days = Math.ceil((d - Date.now()) / DAY); return days < 0 ? { t: "Overdue", c: "bad" } : days === 0 ? { t: "Due today", c: "warn" } : days <= 3 ? { t: `Due in ${days} day${days > 1 ? "s" : ""}`, c: "warn" } : { t: "Due " + fmtD(d), c: "" }; }
const greeting = () => { const h = Number(fmt(new Date(), { hour: "numeric", hour12: false })); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
function itemSub(it) {
  const r = row(it);
  return it.type === "lesson" ? `${LKIND.lesson}${it.mins ? ` · ${it.mins} min` : ""}` : it.type === "quiz" ? `${LKIND.quiz} · ${QUIZ_N} questions · ${QUIZ_MIN} min`
    : it.type === "logweek" ? `${LKIND.logweek} · ${r ? "submitted" : "fill at the end of the week"}` : it.type === "oath" ? (r ? "Signed" : "Required to unlock Week 2 · about 3 min")
    : it.type === "guide" ? "Platform guide · about 4 min" : STAFF_STEPS.includes(it.title) ? "Completed by staff" : LKIND.task + (it.link ? " · submit a link" : "");
}
function aStatus(it) {
  const r = row(it); if (it.type === "logweek") return !r ? "Not Started" : r.status === "revise" ? "Revision Required" : r.data?.signed ? "Signed" : "Submitted";
  if (!r) return "Not Started"; return { submitted: "Submitted", graded: "Graded", revise: "Revision Required", done: "Submitted" }[r.status] || "Submitted";
}
const STATUS_CLS = { "Not Started": "", "In Progress": "now", Submitted: "info", "Revision Required": "bad", Graded: "ok", Signed: "ok" };
const pillS = (s) => `<span class="pill ${STATUS_CLS[s] || ""}">${s}</span>`;
const lsAssignments = () => { const out = []; LS.W.forEach((wk, wi) => wk.items.forEach((it, ii) => { if ((it.type === "task" && it.link) || it.type === "logweek") out.push({ wi, ii, it, wk }); })); return out; };
const deadlineLine = (wi) => `<div class="deadlines"><span><b>Full marks</b> until ${fmtD(weekDue(wi))}, 17:00</span><span><b>80% max</b> until ${fmtD(graceDue(wi))}, 23:59</span><span><b>50% max</b> after that</span></div>`;

/* ---------- shell ---------- */
const pageOpen = (k) => { const m = MORE_PAGES.find((x) => x[0] === k); return !m || m[3] == null || unlockedW(m[3]); };
const initials = () => esc((LS.C.me.first_name[0] || "") + (LS.C.me.surname?.[0] || ""));
const avatar = (cls) => LS.photo ? `<img class="${cls}" src="${esc(LS.photo)}" alt="">` : `<span class="${cls}">${initials()}</span>`;
function lsShell(page, body) {
  const me = LS.C.me, inMore = !["home", "learning"].includes(page), cur = MORE_PAGES.find((m) => m[0] === page);
  const due = lsAssignments().filter((a) => a.wi === curWeek() && !a.it.opt && ["Not Started", "Revision Required"].includes(aStatus(a.it))).length;
  app.innerHTML = `<header class="top ls-top"><div class="wrap"><a class="logo" href="#/learn">${LOGO}Jobnest Academy</a>
    <div class="who"><button class="bell" data-act="ls-bell" aria-label="Alerts${(LS.N?.unread || 0) ? `, ${LS.N.unread} new` : ""}" aria-expanded="${!!ui.lsBell}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${(LS.N?.unread || 0) ? `<b class="bdot">${LS.N.unread > 9 ? "9+" : LS.N.unread}</b>` : ""}</button><a class="chip" href="#/learn/profile" id="tour-profile">${avatar("av")}<span class="nm">${esc(me.first_name)}</span><span class="mono">${esc(me.matric)}</span></a><button class="link" data-act="signout-learn" style="font-size:.85rem">Sign out</button></div></div></header>
    ${ui.lsBell ? `<div class="wrap bell-wrap"><div class="bellpanel" role="dialog" aria-label="Alerts"><div class="ch"><h3>Alerts</h3><button class="link sm" data-act="ls-bell">Close</button></div>
      ${(LS.N?.items || []).length ? `<ul class="bell-l">${LS.N.items.map((n) => `<li class="${n.read ? "" : "new"}"><a href="${esc(n.link ? "#" + n.link : "#/learn")}" data-act="ls-bell-go"><b>${esc(n.title)}</b>${n.body ? `<span class="note">${esc(n.body)}</span>` : ""}<small class="note">${ago(n.at)}</small></a></li>`).join("")}</ul>` : `<p class="empty">No alerts yet. Reminders about deadlines, check-ins, new weeks and live classes appear here.</p>`}</div></div>` : ""}
    <nav class="appnav" aria-label="Main"><div class="wrap"><div class="tabs">
      <a href="#/learn" id="nav-home" aria-current="${page === "home" ? "page" : "false"}">Home</a>
      <a href="#/learn/learning" id="nav-learning" aria-current="${page === "learning" ? "page" : "false"}">My Learning</a>
      <button id="more" data-act="ls-more" aria-expanded="${!!ui.lsMore}" aria-current="${inMore ? "page" : "false"}">${inMore && cur ? `More · ${cur[1]}` : "More"} ▾</button></div></div>
      ${ui.lsMore ? `<div class="wrap more-wrap"><div class="morepanel" role="menu">${MORE_PAGES.map(([k, l, d, w]) => { const open = pageOpen(k); return `<a role="menuitem" class="mi ${open ? "" : "lk"}" href="#/learn/${k}"><b>${l}${k === "assignments" && due ? ` <span class="cnt">${due}</span>` : ""}</b><span>${open ? d : `Opens in Week ${w + 1}`}</span></a>`; }).join("")}
        <button role="menuitem" class="mi" data-act="tour"><b>Take the tour again</b><span>A quick look around</span></button><button role="menuitem" class="mi" data-act="signout-learn"><b>Sign out</b><span>${esc(me.matric)}</span></button></div></div>` : ""}</nav>
    ${body}${page === "help" ? "" : `<a class="fab" href="#/learn/help" aria-label="Need help? Go to Help & Support"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg><span>Need help?</span></a>`}`;
}
const pageHead = (eyebrow, title, sub) => `<div class="wrap greet"><div><p class="eyebrow">${eyebrow}</p><h1 style="margin-top:.5rem">${title}</h1>${sub ? `<p class="note" style="font-size:.95rem;margin-top:.4rem;max-width:62ch">${sub}</p>` : ""}</div></div>`;

/* ---------- Home ---------- */
function encouragement(cur) {
  const p = weekProgress(cur), left = p.n - p.d;
  if (!oathSigned()) return "Start here: read and sign your Student Oath to unlock Week 2.";
  const g = weekGate(cur);
  if (g && g.state === "fail") return `Week ${cur + 1} average: ${g.avg}%. You need ${PASS()}% to move on, so repeat this week. You've got this.`;
  if (g && g.state === "grading") return `All Week ${cur + 1} tasks done. Your project is being graded.`;
  if (g && g.state === "revise") return `Your facilitator asked for changes to your Week ${cur + 1} project.`;
  if (left === 0) return cur + 1 < LS.W.length ? `Week ${cur + 1} is done. Week ${cur + 2} opens on its start date.` : "You've finished the programme. Well done!";
  if (left === 1) return `You're 1 task away from finishing Week ${cur + 1}. Finish strong!`;
  if (p.d === 0) { const n = LS.W[cur].items.find((it) => !it.opt && !isDoneIt(it)); return `New week, fresh start. Begin with “${n ? n.title : "your first task"}”.`; }
  return `${p.d} of ${p.n} required tasks done this week. Keep the momentum going.`;
}
function lsHome(cert) {
  const C = LS.C, cur = curWeek(), wk = LS.W[cur], p = weekProgress(cur);
  let ni = wk.items.findIndex((it) => !it.opt && !isDoneIt(it)); if (ni < 0) ni = wk.items.findIndex((it) => !isDoneIt(it));
  const nIt = ni >= 0 ? wk.items[ni] : null, dl = dueLabel(weekDue(cur)), daysLeft = Math.max(0, Math.ceil((weekDue(cur) - Date.now()) / DAY));
  const due = lsAssignments().filter((a) => a.wi === cur && !a.it.opt && ["Not Started", "Revision Required"].includes(aStatus(a.it)));
  const sc = weekScore(cur), avg = avgScore();
  const sess = lsSessions().filter((s) => s.at.getTime() + s.minutes * 6e4 >= Date.now())[0];
  const ann = (C.news || [])[0], before = Date.now() < lsStart().getTime();
  const bal = LS.fee ? `<div class="notice bal bad"><span><b>Your learning is paused.</b> Your second instalment of <b>${naira(LS.fee.balance)}</b> was due on ${fmtDateD(LS.fee.due_date)}. Pay the balance to open your lessons again.</span><a class="btn sm gold" href="#/a/${esc(LS.fee.ref)}/${esc(LS.fee.token)}/pay">Pay now</a></div>`
    : C.me.balance > 0 ? `<div class="notice bal"><span>Your second instalment of <b>${naira(C.me.balance)}</b> is due by ${fmtDateD(C.me.due_date)}.</span><a class="btn sm gold" href="#/a/${esc(C.me.ref)}/${esc(C.me.token)}/pay">Pay now</a></div>` : "";
  const certCard = cert ? `<div class="card cert-card"><span class="eyebrow">Certificate of completion</span><h2>Your certificate is ready 🎓</h2><div class="actions"><a class="btn gold" href="#/learn/certificate">View and download</a></div></div>` : "";
  lsShell("home", pageHead(`Week ${cur + 1} of ${LS.W.length} · ${esc(C.me.track || "")}`, `${greeting()}, ${esc(C.me.first_name)}`, esc(before ? `The programme starts on ${fmtDateD(LS.L.start_date)}. You can start Week 1 now.` : encouragement(cur))) +
  `<section class="wrap home">${installCard()}${bal}${certCard}
    ${allWeeksDone() ? gradHero() : `<div class="card today" id="t-today"><div class="today-l">
        ${cur === 0 ? "" : `<p class="cd-inline ${dl.c}">⏳ <b>${daysLeft} day${daysLeft === 1 ? "" : "s"} left</b> · due ${fmtD(weekDue(cur))}, 17:00</p>`}
        <p class="eyebrow">Today · Week ${cur + 1}: ${esc(wk.title)}</p>
        <h2>${nIt ? esc(nIt.title) : "You're all caught up"}</h2>
        <p class="note">${nIt ? `${LKIND[nIt.type] || "Activity"}${nIt.mins ? " · " + nIt.mins + " min" : ""} · ${nIt.opt ? "Optional" : "Mandatory"}` : "Open My Learning to look ahead"}</p>
        <div class="actions"><a class="btn gold" href="${nIt ? `#/learn/learning/${cur + 1}/${nIt.key}` : "#/learn/learning"}">Continue →</a></div></div>
      <div class="countdown ${cur === 0 ? "" : dl.c}"><span class="eyebrow">Week due</span><b class="mono">${cur === 0 ? "—" : daysLeft}</b><span class="note">${cur === 0 ? "No deadline in Orientation" : daysLeft === 1 ? "day left" : "days left"}</span>${cur === 0 ? "" : `<span class="note">${fmtD(weekDue(cur))}, 17:00</span>`}</div></div>`}
    <div class="strip" id="t-strip">
      <a class="sti" href="#/learn/learning"><span class="eyebrow">This week</span><b class="mono">${p.d}/${p.n}</b><span class="note">required done</span></a>
      <a class="sti" href="#/learn/assignments"><span class="eyebrow">Due this week</span><b class="mono">${due.length}</b><span class="note">assignment${due.length === 1 ? "" : "s"}</span></a>
      <div class="sti"><span class="eyebrow">Week score</span><b class="mono">${sc != null ? sc + "%" : "—"}</b><span class="note">${sc != null ? "so far" : "no grades yet"}</span></div>
      <div class="sti"><span class="eyebrow">Average</span><b class="mono">${avg != null ? avg + "%" : "—"}</b><span class="note">all graded work</span></div></div>
    <div class="cols">
      <div class="card"><div class="ch"><h3>This week's checklist</h3><span class="note">${p.d} of ${p.n} required</span></div><div class="bar"><i style="width:${p.pct}%"></i></div>
        <ul class="checklist">${wk.items.map((it) => { const dn = isDoneIt(it); return `<li><a class="cl ${dn ? "done" : ""}" href="#/learn/learning/${cur + 1}/${it.key}"><span class="box">${dn ? LICON.done.replace(/20/g, "14") : ""}</span><span class="t">${esc(it.title)}</span>${it.opt ? `<span class="req opt">Optional</span>` : ""}</a></li>`; }).join("")}</ul></div>
      <div class="stack">
        <div class="card"><div class="ch"><h3>Next live session</h3><a class="link" href="#/learn/cohort">Full schedule</a></div>${sess ? `<ul class="sess-list">${sessionRow(sess)}</ul>` : `<p class="empty">No upcoming sessions.</p>`}</div>
        ${LS.pod ? `<div class="card"><div class="ch"><h3>Your pod</h3><a class="link" href="#/learn/cohort">See pod</a></div><div class="pod">${LS.pod.members.map((m) => `<span class="pm ${m.me ? "me" : ""}"><span class="pa">${esc(m.initials)}</span></span>`).join("")}</div><p class="note">${esc(LS.pod.name)}${LS.pod.meet ? ` · check-in ${esc(LS.pod.meet)}` : ""}</p></div>` : ""}
        <div class="card"><div class="ch"><h3>Latest announcement</h3><a class="link" href="#/learn/cohort">All</a></div>${ann ? `<div class="ann" style="border:0;padding:0"><b>${esc(ann.title)}</b><p class="note">${lines(ann.body).slice(0, 400)}</p><small class="note">${fmtAt(ann.at)}</small></div>` : `<p class="empty">No announcements yet.</p>`}</div>
      </div></div></section>`);
}

/* ---------- My Learning ---------- */
function weekSelect(sel) {
  let out = "", last = -1;
  LS.W.forEach((w, i) => { if (w.stage !== last) { if (last >= 0) out += "</optgroup>"; last = w.stage; out += `<optgroup label="Stage ${w.stage + 1}: ${esc(COURSE_STAGES[w.stage].title)}">`; }
    out += `<option value="${i + 1}" ${i === sel ? "selected" : ""}>Week ${i + 1}: ${esc(w.title)}${weekDone(i) ? " ✓" : unlockedW(i) ? "" : " 🔒"}</option>`; });
  out += `</optgroup><option value="grad">🎓 Graduation${allWeeksDone() ? "" : " 🔒"}</option>`;
  return `<label class="wk-select-wrap" for="week-select"><span class="eyebrow">Jump to a week</span><select id="week-select" data-change="week-select">${out}</select></label>`;
}
function lsLearning(wi, key) {
  let total = 0, done = 0; LS.W.forEach((_, i) => { const p = weekProgress(i); total += p.n; done += p.d; });
  const pct = Math.round((done / total) * 100), current = curWeek(), avg = avgScore(), viewStage = LS.W[wi].stage;
  const groups = COURSE_STAGES.map((st, si) => {
    const idx = LS.W.map((w, i) => (w.stage === si ? i : -1)).filter((i) => i >= 0); if (!idx.length) return "";
    const dn = idx.filter((i) => weekDone(i)).length, open = unlockedW(idx[0]), all = dn === idx.length;
    const wks = idx.map((i) => { const wk = LS.W[i], p = weekProgress(i), un = unlockedW(i), d = weekDone(i), gg = weekGate(i);
      return `<a class="stage-btn ${d ? "done" : i === current ? "now" : ""} ${un ? "" : "locked"}" href="#/learn/learning/${i + 1}" aria-current="${!key && i === wi}">
        <span class="n">${d ? "✓" : i + 1}</span><span><small>Week ${i + 1}</small><b>${esc(wk.title)}</b></span><span class="lk">${!un ? "🔒" : d ? "" : gg && gg.state === "fail" ? "Repeat" : gg && gg.state === "grading" ? "Grading" : p.d + "/" + p.n}</span></a>`; }).join("");
    return `<details class="sg ${all ? "done" : open ? "" : "locked"}" ${si === viewStage ? "open" : ""}><summary><span class="sg-n">${all ? "✓" : si + 1}</span><span class="sg-t"><small>Stage ${si + 1}</small><b>${esc(st.title)}</b></span><span class="sg-s">${all ? "Done" : open ? `${dn}/${idx.length}` : "🔒"}</span></summary><div class="sg-w">${wks}</div></details>`; }).join("");
  const f = key ? findItem(key) : null;
  const main = f && f.wi === wi ? lsItemView(wi, f.ii) : key === "brief" ? lsBrief(wi) : key === "logguide" ? lsLogGuide(wi) : lsWeekView(wi);
  lsShell("learning", `<div class="wrap lhead"><div><p class="eyebrow">${esc(LS.C.me.track || "")} · ${esc(LS.C.cohort.name)}</p><h1>My Learning</h1></div>
    <div class="lh-prog" id="tour-progress"><div class="lh-bar"><i style="width:${pct}%"></i></div><span><b class="mono">${pct}%</b> complete · Week ${current + 1} of ${LS.W.length}${avg != null ? ` · avg <b class="mono">${avg}%</b>` : ""}</span></div></div>
    <section class="wrap campus"><aside>${weekSelect(wi)}<nav class="rail" id="tour-rail" aria-label="Programme stages and weeks">${groups}${allWeeksDone() ? `<a class="sg-grad" href="#/learn/graduate"><span class="sg-n">🎓</span><span class="sg-t"><small>Finish</small><b>Graduation</b></span><span class="sg-s">Open →</span></a>` : `<div class="sg-grad locked" title="Opens when you finish every week"><span class="sg-n">🎓</span><span class="sg-t"><small>Finish</small><b>Graduation</b></span><span class="sg-s">🔒</span></div>`}</nav></aside><div>${main}</div></section>`);
}
function gateCard(wi) {
  const g = weekGate(wi); if (!g) return "";
  const tile = (l, v, n) => `<div class="gt"><span class="eyebrow">${l}</span><b class="mono">${v}</b><span class="note">${n}</span></div>`;
  const pr = g.pi >= 0 ? row(LS.W[wi].items[g.pi]) : null;
  const pLabel = g.p != null ? g.p + "%" : pr?.status === "revise" ? "Revise" : pr ? "Grading" : "—";
  const msg = { open: `Complete ${g.hasQuiz && g.pi >= 0 ? "the assessment and the week project" : g.pi >= 0 ? "the week project" : "the assessment"}. You need ${g.hasQuiz && g.pi >= 0 ? "an average of " : ""}<b>${PASS()}% or more</b> to move on. Below ${PASS()}%, you repeat this week.`,
    grading: `Your week project is with your facilitator. The next week unlocks once it's graded and your ${g.hasQuiz ? "average" : "grade"} is ${PASS()}% or more.`,
    revise: "Your facilitator asked for changes to your week project. Make them and resubmit.", pass: "Passed. Well done!",
    fail: g.qi >= 0 && g.q < PASS() && (row(LS.W[wi].items[g.qi])?.data?.attempt || 1) < 2 ? `Your assessment is below ${PASS()}%. Redo this week's lessons, then retake the assessment once: open the assessment to start.` : `You need ${PASS()}% to move on. Repeat this week to try again: the lessons, assessment and project reset.` }[g.state];
  return `<div class="gate-card ${g.state}"><div class="gc-h"><div><span class="eyebrow">Week result${g.attempt > 1 ? ` · attempt ${g.attempt}` : ""}</span><b>${g.state === "pass" ? "Week passed" : g.state === "fail" ? "Week not passed" : g.state === "grading" ? "Waiting for your grade" : g.state === "revise" ? "Revision requested" : "Pass mark: " + PASS() + "%"}</b></div>
    <div class="gc-tiles">${g.hasQuiz ? tile("Assessment", g.q != null ? g.q + "%" : "—", "quiz") : ""}${g.pi >= 0 ? tile("Week project", pLabel, "graded by facilitator") : ""}${tile(g.hasQuiz && g.pi >= 0 ? "Average" : "Result", g.avg != null ? g.avg + "%" : "—", "need " + PASS() + "%")}</div></div>
    <p>${msg}</p>${g.state === "fail" ? (g.qi >= 0 && g.q < PASS() && (row(LS.W[wi].items[g.qi])?.data?.attempt || 1) < 2 ? `<div><a class="btn" href="#/learn/learning/${wi + 1}/${LS.W[wi].items[g.qi].key}">Go to the assessment</a></div>` : `<div><button class="btn" data-act="ls-repeat" data-k="${wi + 1}">Repeat Week ${wi + 1}</button></div>`) : ""}</div>`;
}
function weekPill(wi, un) {
  if (!un) return `<span class="pill">Locked</span>`; const g = weekGate(wi), p = weekProgress(wi);
  if (g && g.state !== "open") return `<span class="pill ${g.state === "pass" ? "ok" : g.state === "fail" ? "bad" : "info"}">${g.state === "pass" ? "Passed · " + g.avg + "%" : g.state === "fail" ? "Not passed · " + g.avg + "%" : g.state === "revise" ? "Revision requested" : "Awaiting grade"}</span>`;
  return `<span class="pill ${p.d === p.n ? "ok" : "now"}">${p.d === p.n ? "Complete" : p.d + " of " + p.n + " required done"}</span>`;
}
function itemRow(wi, it, un) {
  const dn = isDoneIt(it), sc = itemScoreIt(it), r = row(it);
  if (!un) return `<div class="item locked"><span class="ic">${LICON.lock}</span><div><b>${esc(it.title)}</b><small>${itemSub(it)}</small></div>${it.opt ? `<span class="req opt">Optional</span>` : ""}</div>`;
  const blk = !dn && !r ? seqBlock(wi, it) : null;
  if (blk) return `<div class="item seq-locked" aria-disabled="true"><span class="ic">${LICON.lock}</span><div><b>${esc(it.title)}</b><small>Opens after “${esc(blk.title)}”</small></div>${it.opt ? `<span class="req opt">Optional</span>` : ""}</div>`;
  const pill = r?.status === "revise" ? `<span class="pill bad">Revise</span>` : r?.status === "submitted" ? `<span class="pill info">Grading</span>` : it.type === "logweek" && r ? (r.data?.signed ? `<span class="pill ok">Signed</span>` : `<span class="pill info">To sign</span>`) : dn ? `<span class="pill ok">${sc != null ? sc + "%" : "Done"}</span>` : `<span class="pill">Start</span>`;
  return `<a class="item ${dn ? "done" : ""}" href="#/learn/learning/${wi + 1}/${it.key}"><span class="ic">${dn ? LICON.done : LICON[it.type] || LICON.task}</span><div><b>${esc(it.title)}</b><small>${itemSub(it)}</small></div><span class="item-r">${it.opt ? `<span class="req opt">Optional</span>` : ""}${pill}</span></a>`;
}
function lsWeekView(wi) {
  const wk = LS.W[wi], st = COURSE_STAGES[wk.stage], p = weekProgress(wi), un = unlockedW(wi), me = LS.C.me;
  const items = wk.items.map((it) => itemRow(wi, it, un)).join("");
  const isLast = wi === LS.W.length - 1;
  const openLeft = [];
  if (isLast && un && weekItemsDone(wi) && !allWeeksDone()) LS.W.forEach((w, i) => { if (i === wi) return; const L = w.items.filter((it) => !it.opt && !isDoneIt(it)); L.forEach((it) => openLeft.push({ it, i })); if (!L.length && !weekDone(i)) openLeft.push({ it: null, i }); });
  const endCard = !isLast || !un ? "" : allWeeksDone() ? `<div class="card grad-hero end-card"><p class="eyebrow">Programme complete</p><h2>You've completed Jobnest Academy 🎓</h2><p>That's all ${LS.W.length} weeks done. Your next steps are waiting: your certificate, telling us where you land, and keeping your job search going.</p><div class="actions"><a class="btn gold" href="#/learn/graduate">See your next steps →</a></div></div>`
    : weekItemsDone(wi) ? `<div class="card almost"><div class="ch"><h3>You're almost there</h3><span class="pill now">${openLeft.length} left</span></div><p class="note">You've finished Week ${wi + 1}. Complete these to finish the programme and unlock Graduation:</p>
      <ul class="almost-l">${openLeft.slice(0, 10).map(({ it, i }) => it ? `<li><a class="link" href="#/learn/learning/${i + 1}/${it.key}">Week ${i + 1}: ${esc(it.title)}</a>${row(it)?.status === "submitted" ? ` <span class="pill info">Waiting for grading</span>` : row(it)?.status === "revise" ? ` <span class="pill bad">Revise</span>` : ""}</li>` : `<li><a class="link" href="#/learn/learning/${i + 1}">Week ${i + 1}: pass the week result</a></li>`).join("")}</ul></div>` : "";
  const next = (un && weekDone(wi) && wi < LS.W.length - 1 ? `<div class="celebrate"><div><b>Week ${wi + 1} complete.</b> <span class="note">${unlockedW(wi + 1) ? `Week ${wi + 2}: ${esc(LS.W[wi + 1].title)} is now unlocked.` : `Week ${wi + 2} opens on ${fmtD(new Date(weekStartAt(wi + 1).getTime() - 2 * DAY))}.`}</span></div>${unlockedW(wi + 1) ? `<a class="btn sm" href="#/learn/learning/${wi + 2}">Start Week ${wi + 2} →</a>` : ""}</div>` : "");
  const head = (extra) => `<div class="stage-head wk-head" id="tour-head"><div class="row"><div><p class="eyebrow">Week ${wi + 1} of ${LS.W.length} · Stage ${wk.stage + 1}: ${esc(st.title)}</p><h2 style="margin-top:.45rem">${esc(wk.title)}</h2></div>${weekPill(wi, un)}</div>${extra}</div>`;
  if (st.welcome) return head(`<div class="welcome"><p class="big">Congratulations, ${esc(me.first_name)}. You took a bold step.</p>
      <p>Choosing to invest in yourself and your future takes courage, and you've already done the hardest part: you started. We're proud to have you in ${esc(LS.C.cohort.name)}.</p>
      <p>Over the next ${LS.W.length} weeks you'll learn skills employers are hiring for, solve a real business problem in your own client project, and gain real work experience in your internship. Some weeks will stretch you. That is where the growth happens, and we'll be beside you every week.</p>
      <p>Show up, ask questions and keep going. We can't wait to see you build a career you are proud of.</p><div><span class="sig">The Jobnest Academy Team</span></div></div>
    <div class="bar" aria-hidden="true"><i style="width:${p.pct}%"></i></div>
    ${oathSigned() ? "" : `<div class="gate">${LICON.lock}<span>Complete the ${p.n} required tasks below. <b>Week 2 stays locked until you read and sign your Student Oath.</b></span></div>`}`) + `<div class="items" id="tour-items">${items}</div>${next}`;
  const tab = ui.wtab || "tasks", sess = un ? lsSessions().filter((s) => s.wi === wi)[0] : null;
  const stWeeks = LS.W.map((w, i) => (w.stage === wk.stage ? i + 1 : null)).filter(Boolean);
  const tabs = [["tasks", "Tasks", `${p.d}/${p.n}`], ["about", "About this week", ""], ["res", "Resources", String((wk.resources || []).length)]];
  const lockMsg = !un ? `<div class="gate">${LICON.lock}<span><b>Preview.</b> ${wi === 1 && !oathSigned() ? "Opens when you sign your Student Oath in Week 1." : !weekDone(wi - 1) ? `Opens when you pass Week ${wi}: ${esc(LS.W[wi - 1].title)}.` : `Opens on ${fmtD(new Date(weekStartAt(wi).getTime() - 2 * DAY))}.`}</span></div>` : "";
  const meta = `<div class="wk-meta-row"><span>Due ${fmtD(weekDue(wi))}, 17:00</span>${sess ? `<span>Live: ${fmtD(sess.at)}, ${fmtTime(sess.at)}</span>` : ""}</div>
    ${un ? `<div class="bar" aria-hidden="true"><i style="width:${p.pct}%"></i></div>` : ""}
    <div class="wtabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" data-act="ls-wtab" data-k="${k}" aria-selected="${tab === k}">${l}${c ? ` <span class="mono">${c}</span>` : ""}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "tasks") { const ck = LS.L.checkins[wi + 1];
    const sp = un && SPECIAL[wk.stage] ? SPECIAL[wk.stage](wi, items) : null;
    body = `${lockMsg}${endCard}${sp ? "" : un ? gateCard(wi) : ""}${!un ? `<div class="card locked-week"><p class="note">${wk.items.filter((x) => !x.opt).length} required items. You'll see them here when this week opens.</p></div>` : sp || `<div class="items" id="tour-items">${items}</div>`}${next}
    ${un && wi % 2 === 1 ? `<form class="card checkin" id="checkin" data-wk="${wi + 1}" novalidate><div class="ch"><h3>Weekly check-in</h3>${ck ? `<span class="pill ok">Sent ${fmtDay(ck.at)}</span>` : ""}</div>
      <p class="note">How confident do you feel about this week? Your facilitator reaches out if you need support.</p>
      <div class="rate conf" role="radiogroup" aria-label="Confidence this week">${[["1", "Lost"], ["2", "Unsure"], ["3", "Okay"], ["4", "Confident"], ["5", "Very confident"]].map(([n, t]) => `<label><input type="radio" name="conf" value="${n}" ${String(ck?.conf) === n ? "checked" : ""}><span>${n} · ${t}</span></label>`).join("")}</div>
      <div class="field"><label for="ck-note">Anything you're stuck on? (optional)</label><input id="ck-note" value="${esc(ck?.note || "")}" placeholder="e.g. I don't understand pivot tables yet"></div>
      <div><button class="btn sm" type="submit">${ck ? "Update check-in" : "Send check-in"}</button></div></form>` : ""}`; }
  if (tab === "about") body = `<div class="card about-card"><h3>By the end of this week you can</h3><ul class="obj">${(wk.objectives || []).map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      <h3>Deadlines</h3>${deadlineLine(wi)}
      ${wk.stage >= 1 && wk.stage <= 3 ? `<h3>How this week is passed</h3><p class="note">Your assessment score and week project grade are averaged. You need ${PASS()}% or more to move on; below that, you repeat the week.</p>` : ""}
      ${sess ? `<h3>Live session</h3><ul class="sess-list">${sessionRow(sess)}</ul>` : ""}
      <h3>About Stage ${wk.stage + 1}: ${esc(st.title)}</h3><p>${esc(st.objective || "")}</p>
      <dl class="kv"><div><dt>Weeks</dt><dd>${stWeeks.length > 1 ? `Weeks ${stWeeks[0]}–${stWeeks.at(-1)}` : `Week ${stWeeks[0]}`}</dd></div>${st.facilitators ? `<div><dt>Facilitators</dt><dd>${esc(st.facilitators)}</dd></div>` : ""}</dl></div>`;
  if (tab === "res") body = `<div class="card"><ul class="res">${(wk.resources || []).map((r) => `<li><span class="resbtn" aria-disabled="true">${LICON.file}<span>${esc(r[0])}</span><span class="tag">${r[1]}</span></span></li>`).join("")}</ul><p class="note" style="margin-top:.6rem">Your facilitators upload this week's files here.</p></div>`;
  return head(meta) + `<div class="wk-body">${body}</div>`;
}
function seqNav(wi, ii) {
  const flat = []; LS.W.forEach((w, i) => { if (unlockedW(i)) w.items.forEach((_, k) => flat.push([i, k])); });
  const at = flat.findIndex(([a, b]) => a === wi && b === ii), prev = at > 0 ? flat[at - 1] : null, nxt = at >= 0 && at < flat.length - 1 ? flat[at + 1] : null;
  const lbl = ([w, i]) => `${w !== wi ? `Week ${w + 1}: ` : ""}${esc(LS.W[w].items[i].title)}`, href = ([w, i]) => `#/learn/learning/${w + 1}/${LS.W[w].items[i].key}`;
  const right = nxt ? `<a class="seqbtn nx" href="${href(nxt)}"><small>Next →</small><span>${lbl(nxt)}</span></a>` : `<a class="seqbtn nx" href="#/learn/learning/${wi + 1}"><small>Done</small><span>Back to Week ${wi + 1}</span></a>`;
  return `<div class="seq">${prev ? `<a class="seqbtn" href="${href(prev)}"><small>← Previous</small><span>${lbl(prev)}</span></a>` : "<span></span>"}${right}</div>`;
}
function lessonBody(it) {
  const pts = it.points || [];
  return `<div class="lesson-doc" id="textver"><p class="eyebrow">Text version</p>
    <h3>Overview</h3><p>${esc(it.intro || "")} By the end of this lesson you'll be able to apply each idea below to real work.</p>
    ${pts.map((pt, i) => `<h4>${i + 1}. ${esc(pt)}</h4><p>${LESSON_TPL[i % LESSON_TPL.length](pt)}</p>`).join("")}
    ${pts[0] ? `<div class="ex-box"><span class="eyebrow">Real-world example</span><p>Chidera, a junior analyst, started applying “${esc(pts[0])}” in her first month. Her manager mentioned it in her 3-month review as the reason she was given her own client.</p></div>` : ""}
    <div class="try-box"><span class="eyebrow">Try it now · 10 minutes</span><p>Pick one point above and apply it to something you're working on today. Write two or three sentences in your notes about what you did and what changed.</p></div>
    <h3>Key takeaways</h3><ul>${pts.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
}
const internCertId = () => { const m = (LS.C.me.matric || "").split("/"); return `JNA-INT-${(m[0] || "") + (m[1] || "")}-${m[2] || ""}`.toUpperCase(); };
function seqBlock(wi, it) {
  const L = LS.W[wi].items, i = L.indexOf(it);
  const b = L.slice(0, i).find((x) => !x.opt && !isDoneIt(x));
  return b || null;
}
const QUIZ_MIN = 10, QUIZ_N = 5;
function quizReview(d) {
  return (d.review || []).map((q, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(q.q)}</legend>${q.o.map((o, oi) => `<label class="opt ${oi === q.a ? "right" : oi === q.ans ? "wrong" : ""}"><input type="radio" disabled ${oi === q.ans ? "checked" : ""}> ${esc(o)}</label>`).join("")}${q.ans == null ? `<p class="note">Not answered</p>` : ""}</fieldset>`).join("");
}
function quizBody(wi, it, r) {
  const d = r?.data || {}, retake = !!d.retake, att = d.attempt || 1, gate = LS.W[wi].stage >= 1;
  const Q = ui.quiz && ui.quiz.key === it.key ? ui.quiz : null;
  if (Q) return `<div class="qtimer" id="qtimer" aria-live="off"><span>⏱ <b class="mono" id="qt-left">--:--</b> left</span><span class="note">Question <b id="qt-done">0</b> of ${Q.d.qs.length} answered</span></div>
    <form id="ls-quiz" data-k="${it.key}" novalidate>${Q.d.qs.map((q, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(q.q)}</legend>${q.o.map((o, oi) => `<label class="opt"><input type="radio" name="q${qi}" value="${oi}" ${Q.ans[qi] === oi ? "checked" : ""}> ${esc(o)}</label>`).join("")}</fieldset>`).join("")}
      <p class="err" id="quiz-err" role="alert"></p><div style="margin-top:1rem"><button class="btn" type="submit">Submit answers</button></div></form>`;
  if (r && !retake) {
    const pass = r.score >= PASS();
    return `<div class="result ${pass ? "pass" : "fail"}">${att > 1 ? `Retake score: ${d.last}%. Your best score, <b>${r.score}%</b>, counts.` : `You scored <b>${r.score}%</b>.`} ${pass ? "Well done!" : ""}${d.late ? " Time ran out, so unanswered questions were marked wrong." : ""}</div>
      ${!pass && att < 2 ? `<div class="card retake"><h3>Below ${PASS()}%: redo the lessons, then retake</h3><p class="note">Go back through this week's lessons. When you've marked them complete again, you get <b>one retake</b> with new questions. Your best score counts.</p><div><button class="btn" data-act="ls-retry" data-k="${it.key}">Redo this week's lessons</button></div></div>` : ""}
      ${!pass && att >= 2 ? `<div class="card retake"><h3>You've used your retake</h3><p class="note">Your week result uses your best score. If the week isn't passed, you can repeat the week from the week page.</p></div>` : ""}
      <h3 style="margin-top:1.2rem">Your answers</h3>${quizReview(d)}`;
  }
  return `<div class="card qstart"><h3>${retake ? "Your retake" : "Before you start"}</h3><ul class="reqs"><li>The assessment contains <b>${QUIZ_N} questions</b>.</li><li>You have <b>${QUIZ_MIN} minutes</b> to complete it once you start.</li><li>Answers are submitted automatically when the time runs out.</li>
    <li>${retake ? "This is your only retake. Your best score counts." : `If you score below ${PASS()}%, review this week's lessons. You are allowed one retake.`}</li>${gate ? `<li>Your score contributes to the week's overall result.</li>` : ""}</ul>
    <div><button class="btn gold" data-act="ls-qstart" data-k="${it.key}">${retake ? "Start retake" : "Start assessment"}</button></div></div>`;
}
let QTIMER = null;
function quizTick() {
  const Q = ui.quiz, el = $("#qt-left"); if (!Q || !el) { clearInterval(QTIMER); QTIMER = null; return; }
  const left = Math.max(0, Math.round((Q.deadline - (Date.now() + Q.skew)) / 1000));
  el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  $("#qtimer").classList.toggle("warn", left <= 60);
  $("#qt-done").textContent = Q.ans.filter((x) => x != null).length;
  if (left <= 0 && !Q.sent) { Q.sent = true; toast("Time's up. Sending your answers."); quizSubmit(true); }
}
async function quizSubmit(auto) {
  const Q = ui.quiz; if (!Q) return;
  const btn = $("#ls-quiz button[type=submit]");
  if (!auto && Q.ans.some((x) => x == null)) { const n = Q.ans.filter((x) => x == null).length; if (!confirm(`${n} question${n === 1 ? " is" : "s are"} unanswered. Submit anyway?`)) return; }
  clearInterval(QTIMER); QTIMER = null;
  const key = Q.key, ans = Q.ans.slice();
  let r; try { r = await busy(btn, () => rpc("learn_quiz", { p_key: key, p_answers: ans })); } catch { Q.sent = false; QTIMER = setInterval(quizTick, 1000); return; }
  if (!r) return;
  ui.quiz = null; LS.L = r; toast("Answers submitted"); await lsRender(); window.scrollTo({ top: 0, behavior: "smooth" });
}
function lsItemView(wi, ii) {
  const it = LS.W[wi].items[ii], r = row(it), dn = isDoneIt(it), un = unlockedW(wi), me = LS.C.me;
  const head = `<a class="back" href="#/learn/learning/${wi + 1}">← Week ${wi + 1}: ${esc(LS.W[wi].title)}</a><div><p class="eyebrow">${LKIND[it.type] || "Activity"}${it.mins ? " · " + it.mins + " min" : ""}${it.opt ? " · Optional" : ""}</p><h2 style="margin-top:.4rem">${esc(it.title)}</h2></div>`;
  const nav = seqNav(wi, ii), btn = (lbl, undo) => `<div><button class="btn ${dn ? "ghost" : ""}" data-act="ls-done" data-k="${it.key}" data-v="${dn ? 0 : 1}">${dn ? undo : lbl}</button></div>`;
  if (!un) return `<div class="view">${head}<div class="gate">${LICON.lock}<span><b>Locked.</b> This opens when Week ${wi + 1} unlocks.</span></div></div>`;
  const blk = !dn && !r ? seqBlock(wi, it) : null;
  if (blk) return `<div class="view">${head}<div class="gate">${LICON.lock}<span><b>Do the steps in order.</b> Finish “${esc(blk.title)}” first, then this opens.</span></div><div><a class="btn" href="#/learn/learning/${wi + 1}/${blk.key}">Go to “${esc(blk.title)}”</a></div>${nav}</div>`;
  if (ON_WEEK_PAGE.includes(it.title)) return `<div class="view">${head}<p style="max-width:62ch">${esc(it.detail || "")}</p><div class="signoff ${dn ? "signed" : ""}"><b>${dn ? "Done ✓" : "Do this on the Week " + (wi + 1) + " page"}</b><p class="note">${it.title === "Mock interview simulation" ? "Your coach marks this after your call." : it.title === "Book your 1-on-1 session" ? "Pick a time on the Week 15 page. This ticks itself when you book." : "The tools for this step are on the week page."}</p></div><div><a class="btn" href="#/learn/learning/${wi + 1}">Open Week ${wi + 1}</a></div>${nav}</div>`;
  if (it.title === "Collect your internship certificate") return `<div class="view">${head}${LS.X.eval ? `<div class="signoff signed"><b>Your internship is complete 🎉</b><p class="note">${LS.X.placement ? `${esc(LS.X.placement.sup_name)} at ${esc(LS.X.placement.org)} submitted your final evaluation.` : "Your supervisor submitted your final evaluation."} Here is your internship certificate. Download it and add it to your CV in Week 14.</p></div>${LS.icert && LS.icert.cert_id ? certBlock(LS.icert) : `<p class="note">Your certificate is being prepared. Refresh in a moment.</p>`}${btn("Mark as collected", "Collected ✓ · Undo")}`
    : `<div class="gate">${LICON.lock}<span><b>Not yet.</b> This opens after your supervisor signs all four logbook weeks and submits your final evaluation.</span></div>`}${nav}</div>`;
  if (it.title === "Confirm your placement") return `<div class="view">${head}${placementCard()}${LS.X.placement ? btn("I confirm my placement", "Confirmed ✓ · Undo") : ""}${nav}</div>`;
  if (it.type === "oath") return `<div class="view">${head}${oathView(dn, r)}${nav}</div>`;
  if (it.type === "guide") return `<div class="view">${head}${guideView()}<div class="actions"><button class="btn ghost" data-act="tour">Take the guided tour again</button><button class="btn ${dn ? "ghost" : ""}" data-act="ls-done" data-k="${it.key}" data-v="${dn ? 0 : 1}">${dn ? "Done ✓ · Mark as not done" : "I know my way around"}</button></div>${nav}</div>`;
  if (it.title === "Read the Student Handbook") return `<div class="view">${head}${handbookView()}${btn("I've read the handbook", "Read ✓ · Mark as not read")}${nav}</div>`;
  if (it.title === "Join your cohort community") return `<div class="view">${head}${communityView()}${btn("I've joined and introduced myself", "Joined ✓ · Undo")}${nav}</div>`;
  if (it.title === "Read your project brief") return `<div class="view">${head}<p style="max-width:62ch">${esc(it.detail || "")}</p><div class="actions"><a class="btn ghost" href="#/learn/learning/${wi + 1}/brief">Read the full brief</a><button class="btn ${dn ? "ghost" : ""}" data-act="ls-done" data-k="${it.key}" data-v="${dn ? 0 : 1}">${dn ? "Read ✓ · Undo" : "I've read the brief"}</button></div>${nav}</div>`;
  if (STAFF_STEPS.includes(it.title)) return `<div class="view">${head}<p style="max-width:62ch">${esc(it.detail || "")}</p><div class="signoff ${dn ? "signed" : ""}"><b>${dn ? "Completed by staff" : "Waiting for staff"}</b><p class="note">${dn ? "This step is done." : "You don't need to do anything here. Staff mark it complete."}</p></div>${nav}</div>`;
  if (it.type === "logweek") return `<div class="view">${head}${logWeek(wi, it, r)}${nav}</div>`;
  if (it.type === "lesson") return `<div class="view">${head}<div class="video"><span class="play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg></span><span class="cap">${esc(it.title)} · video coming soon</span></div>
    <p class="note">Your facilitator adds the video here. Until then, the text version below covers the lesson.</p>${lessonBody(it)}${btn("Mark lesson complete", "Completed ✓ · Mark as not done")}${nav}</div>`;
  if (it.type === "quiz") return `<div class="view">${head}${quizBody(wi, it, r)}${nav}</div>`;
  if (it.link) {
    const st = aStatus(it), canEdit = !r || r.status === "revise" || (r.status !== "graded" && !it.proj) || r.status === "submitted";
    return `<div class="view">${head}<p style="max-width:64ch">${esc(it.detail || "")}</p>${deadlineLine(wi)}
      ${r?.feedback ? `<div class="card fb ${r.status === "graded" ? "ok" : "bad"}"><div class="ch"><h3>${r.status === "graded" ? "Facilitator feedback" : "Revision requested"}</h3>${r.status === "graded" ? `<span class="score mono">${r.score}/100</span>` : ""}</div><p>${esc(r.feedback)}</p><p class="note">${esc(r.graded_by || "Your facilitator")}${r.cap && r.cap < 1 && r.status === "graded" ? ` · Marked ${r.grade}/100, capped at ${r.cap * 100}% for late submission` : ""}</p></div>` : ""}
      ${r?.status === "graded" ? `<p>Submitted link: <a class="mono" style="word-break:break-all" href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a></p>` : `<form id="ls-link" data-k="${it.key}" class="form" novalidate>
        <div class="field"><label for="ls-url">Link to your work</label><input id="ls-url" inputmode="url" placeholder="https://" value="${esc(r?.link || "")}"></div>
        <p class="err" id="ls-err" role="alert"></p>
        ${r && r.cap != null && r.cap < 1 ? `<p class="note">Submitted after the first deadline: maximum ${r.cap * 100}% for this assignment.</p>` : ""}
        <div class="actions"><button class="btn" type="submit">${r ? (r.status === "revise" ? "Resubmit" : "Update link") : "Submit"}</button>${r && r.status !== "revise" ? `<button class="btn ghost" type="button" data-act="ls-unsubmit" data-k="${it.key}">Undo submission</button>` : ""}<a class="link" href="#/learn/assignments/${it.key}">See feedback & history</a></div></form>`}
      ${r ? `<p class="note">${pillS(st)} ${it.proj ? (r.status === "submitted" ? "Waiting for your facilitator to grade it. Feedback arrives within 5 working days." : "") : ""}</p>` : ""}${nav}</div>`;
  }
  return `<div class="view">${head}<p style="max-width:64ch">${esc(it.detail || "")}</p>${btn("Mark as done", "Done ✓ · Undo")}${nav}</div>`;
}
function oathView(dn, r) {
  const me = LS.C.me, name = `${me.first_name} ${me.surname || ""}`.trim();
  const crest = `<div class="crest">${LOGO}<div><p class="eyebrow">Jobnest Academy · ${esc(LS.C.cohort.name)}</p><h3 style="margin-top:.3rem">The Jobnest Student Oath</h3></div></div>`;
  const list = PLEDGES.map((t, i) => `<li><label class="pledge ${dn ? "ro" : ""}"><span class="num">${i + 1}</span><span>${t}</span><input type="checkbox" class="pl" ${dn ? "checked disabled" : ""}><span class="tick">${LICON.done.replace('width="20" height="20"', 'width="14" height="14"')}</span></label></li>`).join("");
  const sign = dn ? `<div class="signed-stamp"><span class="eyebrow">Signed</span><span class="sig">${esc(r?.data?.sig || name)}</span><span class="note">${esc(name)} · <span class="mono">${esc(me.matric)}</span> · ${r?.at ? fmtDateD(String(r.at).slice(0, 10)) : ""}</span></div>`
    : `<div class="sign-area"><p><b>Tick each pledge as you read it.</b> Then sign with your full name: <b>${esc(name)}</b>.</p>
      <div class="sig-line"><div class="field"><label for="oath-sig">Your signature</label><input id="oath-sig" class="sig-input" autocomplete="off" placeholder="${esc(name)}"></div>
      <div class="field"><span class="lbl">Date</span><span class="mono" style="padding-bottom:.6rem">${fmtDateD(new Date().toISOString().slice(0, 10))}</span></div></div>
      <p class="err" id="oath-err" role="alert"></p><div class="actions"><button class="btn gold" data-act="oath-sign" type="button">Sign the oath</button></div></div>`;
  return `<div class="oath-doc">${crest}<p class="pre">I, <b>${esc(name)}</b>, admitted into the <b>${esc(me.track || "")}</b> track of Jobnest Academy, solemnly pledge that:</p><ol class="pledges">${list}</ol>${sign}</div>`;
}
function guideView() {
  const rows = [["guide", "Home", "Your daily starting point: today's task, days left this week and your next live session."],
    ["lesson", "My Learning", "Every week is listed in order, grouped by stage. A week unlocks once you finish the week before it."],
    ["task", "Inside each week", "Every week has lessons, assessments and tasks. Open an item, complete it and it gets a green tick."],
    ["quiz", "Assessments", `Each assessment counts toward your week result. You need ${PASS()}% to move on.`],
    ["logweek", "Internship logbook", "In Weeks 10 to 13 you fill one logbook entry each week."],
    ["oath", "The More menu", "Assignments, your cohort, your profile and Help & Support live here."]].map(([ic, t, b]) => `<div class="guide-row"><span class="ic">${LICON[ic]}</span><div><b>${t}</b><span class="note" style="font-size:.9rem">${b}</span></div></div>`).join("");
  return `<p style="max-width:64ch">Here's everything you need to find your way around the Jobnest student portal.</p><div class="guide">${rows}</div>`;
}
const handbookView = () => `<div class="lesson-doc"><h3>1. Attendance</h3><p>Join every live session. If you can't, tell Student Success before the session and watch the recording within 48 hours.</p>
  <h3>2. Deadlines</h3><p>Weekly work is due Friday at 17:00 for full marks. Until Sunday 23:59 you can still get up to 80%. After that, the maximum is 50%.</p>
  <h3>3. Grading</h3><p>Assignments are graded out of 100 using a rubric. You'll get feedback within 5 working days and may be asked to revise.</p>
  <h3>4. Code of conduct</h3><p>Submit your own work, respect everyone in your cohort and represent Jobnest professionally at your internship. Breaking the Student Oath can lead to removal from the programme.</p>
  <h3>5. Getting help</h3><p>Use Help & Support in the portal, or message Student Success in your cohort community.</p>
  <h3>6. Certificates</h3><p>You earn your certificate when every requirement is met. It appears in your profile.</p></div>`;
const communityView = () => `<div class="lesson-doc"><p>Your cohort community is where announcements, reminders and peer help happen.</p>
  <h3>How to join</h3><ol class="obj"><li>Open the invite link your cohort manager shares.</li><li>Use your real name and add your matric number to your profile.</li><li>Post your introduction.</li></ol>
  <h3>Introduction template</h3><div class="tpl"><pre>Hi everyone! I'm ${esc(LS.C.me.first_name)} from [city], on the ${esc(LS.C.me.track || "")} track.
One goal I have for this programme: [your goal].
Fun fact: [something about you].</pre></div></div>`;
function lsBrief(wi) {
  const it = LS.W[wi].items.find((x) => x.title === "Read your project brief");
  return `<div class="view brief-doc"><a class="back" href="#/learn/learning/${wi + 1}">← Week ${wi + 1}: ${esc(LS.W[wi].title)}</a>
    <div><p class="eyebrow">Client project brief</p><h2 style="margin-top:.4rem">Your client project</h2><p class="note" style="font-size:.95rem;margin-top:.3rem">${esc(LS.C.me.track || "")} track · individual project · Weeks 8–9</p></div>
    <h3>Your task</h3><p>${esc(it?.detail || "")}</p>
    <h3>Timeline</h3><dl class="kv tl"><div><dt>Week 8</dt><dd>Project plan due ${fmtD(weekDue(7))}, 17:00. Check in with your supervisor.</dd></div><div><dt>Week 9</dt><dd>Final project due ${fmtD(weekDue(8))}, 17:00. Self-review, then supervisor grading.</dd></div></dl>
    <h3>How you'll be graded</h3><table class="tbl rub"><tbody>${RUBRIC.map((x) => `<tr><td><b>${x[0]}</b><span class="note">${x[1]}</span></td><td class="mono">${x[2]}</td></tr>`).join("")}</tbody></table>
    <h3>How to submit</h3><p>Put everything in one Google Drive or Notion folder, set sharing to “anyone with the link can view”, and paste the link into the Week 9 task “Submit your final project”.</p></div>`;
}
function logWeek(wi, it, r) {
  const w = it.wk || wi - 8, e = r?.data || {}, ro = !!r && r.status !== "revise", last = w === 4;
  const fld = (f) => { const v = esc(e[f.k] || ""), req = f.req ? " *" : "", ro2 = ro ? "readonly" : "";
    if (f.t === "area") return `<div class="field"><label for="lb-${f.k}">${f.l}${req}</label><textarea id="lb-${f.k}" ${ro2} placeholder="${esc(f.ph || "")}">${v}</textarea></div>`;
    return `<div class="field"><label for="lb-${f.k}">${f.l}${req}</label><input id="lb-${f.k}" type="${f.t}" ${f.min != null ? `min="${f.min}" max="${f.max}"` : ""} ${ro2} placeholder="${esc(f.ph || "")}" value="${v}"></div>`; };
  const sections = LB_FIELDS.map((s) => `<div class="lb-sec"><h3>${s.sec}</h3>${s.sec === "Week details" ? `<div class="grid2">${s.fields.map(fld).join("")}</div>` : s.fields.map(fld).join("")}${s.sec === "Learning & reflection" && last ? fld(LB_FINAL) : ""}</div>`).join("");
  const rating = `<div class="field"><span class="lbl" id="rate-l">How would you rate this week? *</span><div class="rate" role="radiogroup" aria-labelledby="rate-l">${[["1", "Tough"], ["2", "Okay"], ["3", "Good"], ["4", "Great"], ["5", "Excellent"]].map(([n, t]) => `<label><input type="radio" name="lb-rate" value="${n}" ${e.rate === n ? "checked" : ""} ${ro ? "disabled" : ""}><span>${n} · ${t}</span></label>`).join("")}</div></div>`;
  return `${r?.status === "revise" ? `<div class="card fb bad"><div class="ch"><h3>Changes requested</h3></div><p>${esc(r.feedback || "")}</p><p class="note">${esc(r.graded_by || "Your supervisor")} · update the entry below and resubmit.</p></div>` : ""}<div class="lb-due"><span class="eyebrow">Due</span><b>${fmtD(weekDue(wi))}, 17:00</b><span class="note">Internship week ${w} of 4 · fill this entry at the end of the week</span></div>
    <form class="lb-form" id="lb-form" data-k="${it.key}" data-last="${last ? 1 : 0}" novalidate>${sections}<div class="lb-sec">${rating}</div><p class="err" id="lb-err" role="alert"></p>
    ${ro ? (e.signed ? `<div class="signoff signed"><b>Signed by ${esc(e.signed_by || "your supervisor")}</b>${e.sup_comment ? `<p class="note">“${esc(e.sup_comment)}”</p>` : ""}<p class="note">${e.signed_at ? fmtDateD(String(e.signed_at).slice(0, 10)) : ""}</p></div>`
      : `<div class="signoff"><b>Submitted · waiting for sign-off</b><p class="note">Submitted on ${fmtDateD(String(r.at).slice(0, 10))}. ${LS.X.placement ? esc(LS.X.placement.sup_name) + " signs it from the secure link we send them." : "Your supervisor signs it from a secure link."}</p></div>`)
      : `<div class="actions"><button class="btn" type="submit">${r ? "Resubmit logbook entry" : "Submit logbook entry"}</button></div>`}</form>`;
}

/* ---------- Phase 2: special weeks ---------- */
const byTitle = (wi, t) => LS.W[wi].items.find((x) => x.title === t);
const doneT = (t) => { for (let wi = 0; wi < LS.W.length; wi++) { const it = byTitle(wi, t); if (it) return isDoneIt(it); } return false; };
const draft = (k, d) => (LS.X.drafts && LS.X.drafts[k]) ?? d;
const stepsOl = (L) => `<ol class="dc-steps">${L.map(([t, ok], i) => `<li class="${ok ? "done" : ""}"><span class="mono">${ok ? "✓" : i + 1}</span>${t}</li>`).join("")}</ol>`;
const PROJ_PHASES = [["Plan & build", "Read the brief, plan your project and check in with your supervisor."], ["Deliver", "Finish and submit your project, review it yourself and get graded."]];
function projectView(wi, items) {
  const projW = LS.W.map((w, i) => (w.stage === 3 ? i : -1)).filter((i) => i >= 0), ph = projW.indexOf(wi), finalWi = projW.at(-1);
  const finalIt = LS.W[finalWi].items.find((x) => x.proj), fr = finalIt ? row(finalIt) : null, daysToFinal = Math.max(0, Math.ceil((weekDue(finalWi) - Date.now()) / DAY));
  const brief = (byTitle(projW[0], "Read your project brief") || {}).detail || "";
  const ms = []; projW.forEach((w) => LS.W[w].items.forEach((it) => ms.push({ t: it.title, w, ok: isDoneIt(it) })));
  const firstOpen = ms.findIndex((m) => !m.ok), p = weekProgress(wi), msgs = LS.X.messages || [];
  return `<div class="proj-hero"><p class="eyebrow">Client project · ${ph + 1} of ${projW.length}</p><h2>${esc(LS.W[wi].title.replace("Project: ", ""))}</h2>
    <p class="ph-brief">${esc(brief)}</p>
    <div class="ph-stats"><div><span>Final project due</span><b class="mono">${daysToFinal}<small> days</small></b><span>${fmtD(weekDue(finalWi))}, 17:00</span></div>
      <div><span>This week</span><b class="mono">${p.d}<small>/${p.n}</small></b><span>tasks done</span></div>
      <div><span>Grade</span><b class="mono">${fr?.status === "graded" ? fr.score + "<small>%</small>" : "—"}</b><span>${fr?.status === "graded" ? "graded by your supervisor" : fr ? "waiting for grading" : "after you submit"}</span></div></div>
    <ol class="ph-steps">${PROJ_PHASES.map((x, i) => `<li class="${weekDone(projW[i]) ? "done" : i === ph ? "cur" : ""}"><span class="mono">Week ${projW[i] + 1}</span><b>${x[0]}</b><span>${x[1]}</span></li>`).join("")}</ol>
    <div class="actions"><a class="btn gold sm" href="#/learn/learning/${projW[0] + 1}/brief">${LICON.file} Read the full brief & rubric</a><span class="ph-note">Individual project · you work on your own, with your supervisor's support</span></div></div>
  <div style="margin-top:1rem">${gateCard(wi)}</div>
  <div class="proj-grid"><div class="stack">
    <div class="card"><div class="ch"><h3>This week's tasks</h3><span class="note">Due ${fmtD(weekDue(wi))}, 17:00</span></div><div class="items" id="tour-items" style="margin-top:.6rem">${items}</div></div>
    <div class="card"><div class="ch"><h3>Project milestones</h3><span class="note">${ms.filter((m) => m.ok).length} of ${ms.length}</span></div>
      <ol class="mstones">${ms.map((m, i) => `<li class="${m.ok ? "done" : i === firstOpen ? "cur" : ""}"><span class="dot"></span><div><b>${esc(m.t)}</b><span class="note">Week ${m.w + 1}${m.ok ? " · done" : i === firstOpen ? " · up next" : ""}</span></div></li>`).join("")}</ol></div></div>
    <div class="stack"><div class="card supcard"><div class="sup-h"><span class="sup-av">${LICON.guide}</span><div><span class="eyebrow">Your project supervisor</span><b>${LS.sup?.name ? esc(LS.sup.name) : "Ask about your project"}</b><span class="note">${LS.sup?.name ? "Your track facilitator · replies" : "Replies"} within 1 working day</span></div></div>
      <dl class="kv sup-kv"><div><dt>Best for</dt><dd>Questions about the brief, feedback on your plan, getting unstuck</dd></div></dl>
      ${msgs.length ? `<ul class="thread">${msgs.map((m) => `<li class="${m.staff ? "" : "me"}"><span>${esc(m.body)}</span><small>${m.staff ? esc(m.by || "Supervisor") : "You"} · ${fmtAt(m.at)}</small></li>`).join("")}</ul>` : ""}
      <form id="sup-msg-form" class="form" novalidate><div class="field"><label for="sup-msg-txt">Message your supervisor</label><textarea id="sup-msg-txt" placeholder="e.g. Can you check if my plan covers everything in the brief?"></textarea></div>
      <div><button class="btn sm" type="submit">Send message</button></div></form></div></div></div>`;
}
function placementCard() {
  const pl = LS.X.placement;
  return pl ? `<div class="card place-card"><div class="ch"><h3>Your placement</h3><span class="pill ok">Confirmed by Jobnest</span></div>
      <dl class="kv"><div><dt>Company</dt><dd>${esc(pl.org)}</dd></div><div><dt>Your role</dt><dd>${esc(pl.role)}</dd></div><div><dt>Your supervisor</dt><dd>${esc(pl.sup_name)}</dd></div></dl>
      <p class="note">Your supervisor signs your logbook each week from a secure link Jobnest sends them.</p></div>`
    : `<div class="card place-card"><div class="ch"><h3>Your placement</h3><span class="pill">Not assigned yet</span></div><p class="note">Student Success will add your host company and supervisor here before your internship starts.</p></div>`;
}
function internView(wi, items) {
  const entries = LS.W.map((w) => w.items.find((x) => x.type === "logweek")).filter(Boolean);
  return `${placementCard()}<div class="lbtrack-card card"><div class="ch"><h3>Logbook</h3><a class="link sm" href="#/learn/learning/${wi + 1}/logguide">Logbook guide</a></div>
    <ol class="lbtrack">${entries.map((it, i) => { const st = aStatus(it); return `<li class="${st === "Signed" ? "done" : st === "Submitted" ? "sub" : ""}"><span class="mono">Week ${i + 1}</span><small>${st === "Signed" ? "Signed" : st === "Submitted" ? "To sign" : st === "Revision Required" ? "Changes asked" : "Not yet"}</small></li>`; }).join("")}</ol></div>
    <div class="items" id="tour-items">${items}</div>`;
}
function lsLogGuide(wi) {
  const pl = LS.X.placement;
  return `<div class="view guide-doc"><a class="back" href="#/learn/learning/${wi + 1}">← Week ${wi + 1}: ${esc(LS.W[wi].title)}</a>
    <div><p class="eyebrow">Internship · Weeks 10–13</p><h2 style="margin-top:.4rem">Logbook guide</h2></div>
    <p>Your logbook is the official record of your internship. Your supervisor signs every entry, and it becomes verified work experience for your CV and portfolio.</p>
    <h3>When to fill it</h3><ul><li>Once a week, at the end of each internship week: 4 entries in total.</li><li>Submit by <b>Friday, 17:00</b>. Write notes during the week so Friday is quick.</li></ul>
    <h3>What to write</h3><ul><li><b>Tasks:</b> list each task and what you delivered. Be specific.</li><li><b>Tools:</b> the software you used, e.g. Excel, Trello, Zendesk.</li><li><b>Skills:</b> what you learned or got better at.</li><li><b>Challenges:</b> one problem and how you solved it.</li><li><b>Next week:</b> two or three clear goals.</li></ul>
    <div class="ex"><div class="ex-bad"><span class="eyebrow">Weak entry</span><p>"Did some work on reports and attended meetings."</p></div>
      <div class="ex-good"><span class="eyebrow">Strong entry</span><p>"Cleaned the March sales export (2,400 rows) in Google Sheets, removed 130 duplicates and built a pivot table of sales by region. Presented the top 3 findings at Thursday's team stand-up."</p></div></div>
    <h3>What your supervisor checks</h3><ul><li>The entry matches what you actually did that week.</li><li>Your hours and days are accurate.</li><li>You show initiative and reflect honestly on challenges.</li></ul>
    ${pl ? `<p class="note">Your supervisor: <b>${esc(pl.sup_name)}</b>, ${esc(pl.org)}. If anything in your placement isn't going well, tell Student Success early.</p>` : ""}</div>`;
}

/* CV builder */
const TRACK_SKILLS = { ADM: ["Calendar management", "Google Workspace", "Microsoft Office", "Meeting minutes", "Expense tracking"], CSP: ["Zendesk", "Live chat support", "Ticket triage", "CSAT", "De-escalation"],
  DAT: ["Excel", "Google Sheets", "Pivot tables", "Data cleaning", "Looker Studio"], DMK: ["Canva", "Meta Ads Manager", "Content calendars", "Copywriting", "Social media analytics"] };
function cvData() {
  const me = LS.C.me, pl = LS.X.placement, d = draft("cv", null); if (d) return d;
  const brief = (LS.W.flatMap((w) => w.items).find((x) => x.title === "Read your project brief") || {}).detail || "";
  return { name: `${me.first_name} ${me.surname || ""}`.trim(), email: me.email || "", phone: "", city: "Lagos, Nigeria", linkedin: "", summary: "",
    skills: [...(TRACK_SKILLS[LS.L.track] || []), "Communication", "Time management"].join(", "),
    exp: `${pl ? `${pl.role} · ${pl.org}` : "Intern · Host company"} · 4 weeks\n- \n- \n- `, proj: `Client project · Jobnest Academy\n- ${brief}`, edu: "", cert: `Jobnest Academy Career Accelerator · ${me.track || ""} (${new Date().getFullYear() + (new Date().getMonth() > 8 ? 1 : 0)})` };
}
const atsChecks = (c) => [["Contact details complete", !!(c.email && c.phone)], ["Summary is 2–3 sentences", (c.summary || "").trim().length >= 80], ["At least 6 skills", (c.skills || "").split(",").filter((x) => x.trim()).length >= 6],
  ["Experience shows results with numbers", /\d/.test((c.exp || "").replace(/4 weeks/, ""))], ["Education added", (c.edu || "").trim().length > 2]];
function cvPreview(c) {
  const ln = (t) => esc(t || "").split("\n").map((l) => l.trim().startsWith("-") ? `<li>${l.replace(/^-\s*/, "") || "&nbsp;"}</li>` : `<p><b>${l}</b></p>`).join("").replace(/(<li>.*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
  return `<div class="cv-page"><h3>${esc(c.name)}</h3><p class="cv-contact">${[c.city, c.email, c.phone, c.linkedin].filter(Boolean).map(esc).join(" · ")}</p>
    ${c.summary ? `<h4>Summary</h4><p>${esc(c.summary)}</p>` : ""}<h4>Skills</h4><p>${esc(c.skills)}</p><h4>Experience</h4>${ln(c.exp)}<h4>Projects</h4>${ln(c.proj)}${c.edu ? `<h4>Education</h4>${ln(c.edu)}` : ""}${c.cert ? `<h4>Certifications</h4><p>${esc(c.cert)}</p>` : ""}</div>`;
}
const atsList = (ch) => ch.map(([t, ok]) => `<li class="${ok ? "ok" : ""}">${ok ? "✓" : "○"} ${t}</li>`).join("");
const linkBox = (it, id, label, ph, btn) => { const r = row(it), dn = isDoneIt(it);
  return `<form class="form ls-tool-link" data-k="${it.key}" data-inp="${id}" novalidate><div class="field"><label for="${id}">${label}</label><input id="${id}" inputmode="url" placeholder="${ph}" value="${esc(r?.link || "")}"></div><p class="err" id="${id}-err" role="alert"></p><div><button class="btn sm" type="submit">${dn ? "Update link" : btn}</button></div></form>`; };
function cvView(wi, items) {
  const wk = LS.W[wi], c = cvData(), ch = atsChecks(c), score = ch.filter((x) => x[1]).length;
  const cvI = byTitle(wi, "ATS-compliant resume"), liI = byTitle(wi, "LinkedIn profile makeover"), pfI = byTitle(wi, "Publish your portfolio"), li = draft("li", {}), pl = LS.X.placement;
  const LI = [["photo", "Professional photo, face clearly visible"], ["head", "Headline with your target role, e.g. “Data Analyst | Excel · Dashboards”"], ["about", "About section: 3 short paragraphs"], ["feat", "Client project added to Featured"], ["skills", "At least 5 skills added"]];
  const f = (k, l, ta, ph) => `<div class="field"><label for="cv-${k}">${l}</label>${ta ? `<textarea id="cv-${k}" data-cv="${k}" rows="${ta}" placeholder="${esc(ph || "")}">${esc(c[k] || "")}</textarea>` : `<input id="cv-${k}" data-cv="${k}" value="${esc(c[k] || "")}" placeholder="${esc(ph || "")}">`}</div>`;
  const cvDone = cvI && isDoneIt(cvI);
  return `${stepsOl([["Build your CV", cvDone], ["Update LinkedIn", liI && isDoneIt(liI)], ["Publish portfolio", pfI && isDoneIt(pfI)]])}
  <div class="card cv-card"><div class="ch"><h3>CV builder</h3><span class="pill ${score >= 4 ? "ok" : "now"}" id="ats-pill">ATS check ${score}/5</span></div>
    <div class="cv-grid"><form class="form" id="cv-form" novalidate>
      <div class="grid2">${f("name", "Full name")}${f("city", "City")}${f("email", "Email")}${f("phone", "Phone", "", "e.g. 0803 000 0000")}</div>
      ${f("linkedin", "LinkedIn URL", "", "linkedin.com/in/your-name")}${f("summary", "Professional summary", 3, "Who you are, what you're good at and the role you want, in 2–3 sentences")}
      ${f("skills", "Skills (comma separated)", 2)}${f("exp", "Experience", 5, "Start each result with “-” and include numbers")}${f("proj", "Projects", 3)}
      ${f("edu", "Education", 2, "e.g. B.Sc Economics · University of Lagos · 2024")}${f("cert", "Certifications", 2)}<p class="note" id="cv-saved" aria-live="polite">Saves as you type.</p></form>
    <div class="cv-side"><div id="cv-preview">${cvPreview(c)}</div><ul class="mini" id="ats-list">${atsList(ch)}</ul>
      <div class="actions"><button class="btn ghost" data-act="cv-print" type="button">Download PDF</button>${cvI ? `<button class="btn" data-act="ls-done" data-k="${cvI.key}" data-v="${cvDone ? 0 : 1}" type="button">${cvDone ? "CV submitted ✓ · Undo" : "Submit CV for review"}</button>` : ""}</div>
      <p class="note">Download PDF opens your browser's print window. Choose “Save as PDF”.</p></div></div></div>
  <div class="cols"><div class="card"><div class="ch"><h3>LinkedIn makeover</h3>${liI && isDoneIt(liI) ? `<span class="pill ok">Done</span>` : ""}</div>
      <div class="li-list">${LI.map(([k, t]) => `<label class="check"><input type="checkbox" data-li="${k}" ${li[k] ? "checked" : ""}> ${t}</label>`).join("")}</div>
      ${liI ? linkBox(liI, "li-url", "Your LinkedIn profile URL", "https://linkedin.com/in/...", "Submit LinkedIn") : ""}</div>
    <div class="card"><div class="ch"><h3>Portfolio</h3>${pfI && isDoneIt(pfI) ? `<span class="pill ok">Published</span>` : ""}</div>
      <p class="note">Include these, with a short description of the result for each:</p>
      <ul class="reqs"><li>Your client project</li><li>Your internship${pl ? ` at ${esc(pl.org)}` : ""}</li><li>Your best practice exercise from Weeks 4–7</li><li>Your CV</li></ul>
      ${pfI ? linkBox(pfI, "pf-url", "Portfolio link (Canva, Notion or Google Sites)", "https://", "Publish portfolio") : ""}</div></div>
  <div class="items">${wk.items.filter((it) => it.opt).map((it) => itemRow(wi, it, true)).join("")}</div>`;
}

/* Discovery Call 2 */
function bookingUI() {
  const b = LS.X.booking;
  if (b) { const at = new Date(b.at), end = new Date(at.getTime() + 40 * 6e4);
    return `<div class="card booked"><div class="ch"><h3>Your call is booked</h3><span class="pill ok">Confirmed</span></div>
      <div class="bk-sum"><span class="date"><b>${fmt(at, { day: "numeric" })}</b><small>${fmt(at, { month: "short" })}</small></span>
      <div><b>${fmt(at, { weekday: "long", day: "numeric", month: "long" })}</b><span class="note">${fmtTime(at)}–${fmtTime(end)} WAT · 40 minutes · Video call</span><span class="note">With ${esc(b.coach)}, Career Coach</span>${b.note ? `<span class="note">Your note: “${esc(b.note)}”</span>` : ""}</div></div>
      <div class="actions">${LS.X.call_link ? `<a class="btn sm gold" href="${esc(LS.X.call_link)}" target="_blank" rel="noopener">Join the call</a>` : ""}${LS.X.result ? "" : `<button class="btn sm ghost" data-act="dc2-cancel">Cancel or change time</button>`}</div>
      <p class="note">Join from a quiet place with your CV and portfolio open.</p></div>`; }
  const S2 = LS.slots || [], days = [...new Set(S2.map((s) => fmt(s.at, { year: "numeric", month: "2-digit", day: "2-digit" })))];
  const day = ui.dcDay && days.includes(ui.dcDay) ? ui.dcDay : days[0], pick = S2.find((s) => s.id === ui.dcSlot);
  if (!S2.length) return `<div class="card booker"><div class="ch"><h3>Book your call</h3></div><p class="empty">No times are open yet. Your career coaches add times before Week 15. Check back soon.</p></div>`;
  return `<div class="card booker"><div class="ch"><h3>Book your call</h3><span class="note">40 minutes · All times WAT (Lagos)</span></div>
    <div class="bk-step"><span class="bk-n">1</span><b>Pick a day</b></div>
    <div class="days">${days.map((d) => { const s0 = S2.find((s) => fmt(s.at, { year: "numeric", month: "2-digit", day: "2-digit" }) === d); const n = S2.filter((s) => fmt(s.at, { year: "numeric", month: "2-digit", day: "2-digit" }) === d).length;
      return `<button class="day" data-act="dc-day" data-k="${d}" aria-pressed="${d === day}"><small>${fmt(s0.at, { weekday: "short" })}</small><b class="mono">${fmt(s0.at, { day: "numeric" })}</b><small>${fmt(s0.at, { month: "short" })}</small><span class="free">${n} free</span></button>`; }).join("")}</div>
    <div class="bk-step"><span class="bk-n">2</span><b>Pick a time</b></div>
    <div class="slots">${S2.filter((s) => fmt(s.at, { year: "numeric", month: "2-digit", day: "2-digit" }) === day).map((s) => `<button class="slot" data-act="dc-slot" data-k="${s.id}" aria-pressed="${ui.dcSlot === s.id}">${fmtTime(s.at)}<small style="display:block;font-size:.7rem;opacity:.8">${esc(s.coach)}</small></button>`).join("")}</div>
    ${pick ? `<div class="bk-confirm"><div><span class="eyebrow">You're booking</span><b>${fmt(pick.at, { weekday: "long", day: "numeric", month: "long" })} at ${fmtTime(pick.at)} WAT</b><span class="note">with ${esc(pick.coach)}</span></div>
      <div class="field"><label for="bk-note">Anything you'd like your coach to know? (optional)</label><input id="bk-note" placeholder="e.g. I'm aiming for junior data analyst roles in fintech"></div>
      <div><button class="btn gold" data-act="dc-book" data-k="${pick.id}">Confirm booking</button></div></div>` : ""}</div>`;
}
function dcView(wi) {
  const prep = [["cv", "Your updated CV from Week 14"], ["port", "Your portfolio link"], ["roles", "3 roles you're targeting"], ["pitch", "Your 60-second introduction"]], pd = draft("prep", {});
  const apI = byTitle(wi, "Finalise your Job Search Action Plan"), callDone = doneT("Mock interview simulation"), r = LS.X.result;
  return `<p style="max-width:64ch">A 40-minute, 1-on-1 video call with a Career Coach. You'll do a short <b>mock interview</b>, sharpen your pitch and leave with a <b>Job Search Action Plan</b>.</p>
    ${stepsOl([["Book your call", doneT("Book your 1-on-1 session")], ["Have your call", callDone], ["Submit your action plan", apI && isDoneIt(apI)]])}
    <div class="prep"><span class="eyebrow">Have these ready</span><div class="prep-l">${prep.map(([k, t]) => `<label class="check"><input type="checkbox" data-prep="${k}" ${pd[k] ? "checked" : ""}> ${t}</label>`).join("")}</div></div>
    <div class="dc-col">${bookingUI()}
    ${r ? `<div class="card result-card"><div class="ch"><h3>Your call results</h3><span class="pill ok">From ${esc(r.by || "your coach")}</span></div>
      <div class="conf-score"><b class="mono">${r.score}<small>/10</small></b><span><b>Interview Confidence Score</b><span class="note">${esc(r.note || "")}</span></span></div>
      ${(r.next || []).length ? `<ul class="reqs">${r.next.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>` : ""}
    ${apI ? `<div class="card ${isDoneIt(apI) ? "booked" : ""}"><div class="ch"><h3>Your Job Search Action Plan</h3>${isDoneIt(apI) ? `<span class="pill ok">Submitted</span>` : callDone ? `<span class="pill now">Due ${fmtD(weekDue(wi))}</span>` : `<span class="pill">After your call</span>`}</div>
      <p class="note">Write up the plan you agreed with your coach: target roles, target companies and your weekly application goal. Share the link here.</p>
      ${callDone || isDoneIt(apI) ? linkBox(apI, "ap-link", "Link to your action plan", "https://", "Submit action plan") : ""}</div>` : ""}</div>`;
}

/* Job search */
const APP_ST = ["Applied", "Interviewing", "Offer", "Not selected"];
function jobView(wi) {
  const stW = LS.W.map((w, i) => (w.stage === 7 ? i : -1)).filter((i) => i >= 0), first = wi === stW[0];
  const outs = draft("outreach", []), apps = draft("apps", []), pt = draft("pitch", {});
  const words = [pt.a, pt.b, pt.c].join(" ").trim().split(/\s+/).filter(Boolean).length;
  const stats = `<div class="ph-stats js-stats"><div><span>Outreach sent</span><b class="mono">${outs.length}<small>/10</small></b></div><div><span>Applications</span><b class="mono">${apps.length}</b></div><div><span>Interviews</span><b class="mono">${apps.filter((a) => a.st === "Interviewing" || a.st === "Offer").length}</b></div></div>`;
  if (first) { const pI = byTitle(wi, "Record your elevator pitch"), oI = byTitle(wi, "Send 10 cold outreach messages");
    return stats + `<div class="cols"><div class="card"><div class="ch"><h3>Your 60-second pitch</h3>${pI && isDoneIt(pI) ? `<span class="pill ok">Recorded</span>` : ""}</div>
      <form class="form" novalidate>
        <div class="field"><label for="pt-a">Who you are</label><textarea id="pt-a" data-pitch="a" rows="2" placeholder="I'm a ${esc(LS.C.me.track || "")} professional who…">${esc(pt.a || "")}</textarea></div>
        <div class="field"><label for="pt-b">What you've done (with a result)</label><textarea id="pt-b" data-pitch="b" rows="2" placeholder="At my internship I…">${esc(pt.b || "")}</textarea></div>
        <div class="field"><label for="pt-c">What you're looking for</label><textarea id="pt-c" data-pitch="c" rows="2" placeholder="I'm looking for a junior role where…">${esc(pt.c || "")}</textarea></div></form>
      <p class="note" id="pitch-count">${words} words · about ${Math.round(words / 2.3)} seconds spoken (aim for 120–150 words)</p>
      ${pI ? linkBox(pI, "pt-link", "Link to your recorded pitch (Loom, YouTube unlisted, Google Drive)", "https://", "Submit pitch recording") : ""}</div>
    <div class="card"><div class="ch"><h3>Outreach log</h3><span class="pill ${outs.length >= 10 ? "ok" : "now"}">${outs.length} of 10</span></div><div class="bar"><i style="width:${Math.min(100, outs.length * 10)}%"></i></div>
      <form id="out-form" class="form" style="margin-top:.8rem" novalidate><div class="grid2"><div class="field"><label for="o-name">Person</label><input id="o-name" placeholder="e.g. Head of Data"></div><div class="field"><label for="o-co">Company</label><input id="o-co" placeholder="e.g. Paystack"></div></div>
        <div class="grid2"><div class="field"><label for="o-ch">Channel</label><select id="o-ch"><option>LinkedIn</option><option>Email</option><option>WhatsApp</option><option>In person</option></select></div><div class="field"><label for="o-st">Status</label><select id="o-st"><option>Sent</option><option>Replied</option><option>Meeting booked</option></select></div></div>
        <div><button class="btn sm" type="submit">Log message</button></div></form>
      ${outs.length ? `<ul class="roles">${outs.slice().reverse().map((o) => `<li><b>${esc(o.name)} · ${esc(o.co)}</b><span class="note">${esc(o.ch)} · ${esc(o.on)}</span><span class="pill ${o.st === "Sent" ? "" : "ok"}">${esc(o.st)}</span></li>`).join("")}</ul>` : `<p class="empty">No messages logged yet. Aim for 2 a day.</p>`}
      ${oI ? `<div class="actions" style="margin-top:.8rem"><button class="btn sm ${isDoneIt(oI) ? "ghost" : ""}" data-act="ls-done" data-k="${oI.key}" data-v="${isDoneIt(oI) ? 0 : 1}" ${outs.length < 10 && !isDoneIt(oI) ? "disabled" : ""}>${isDoneIt(oI) ? "Done ✓ · Undo" : `Mark outreach done (${outs.length}/10)`}</button></div>` : ""}</div></div>`; }
  const tI = byTitle(wi, "Weekly job application tracker"), rI = byTitle(wi, "Report your first interview invite"), hasInt = apps.some((a) => a.st === "Interviewing" || a.st === "Offer");
  return stats + `<div class="card"><div class="ch"><h3>Add an application</h3></div>
    <form id="app-form" class="form" novalidate><div class="app-row"><div class="field"><label for="a-role">Role</label><input id="a-role" placeholder="e.g. Junior Data Analyst"></div><div class="field"><label for="a-co">Company</label><input id="a-co" placeholder="e.g. Flutterwave"></div><div class="field"><label for="a-st">Status</label><select id="a-st">${APP_ST.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="field"><span class="lbl">&nbsp;</span><button class="btn sm" type="submit">Add</button></div></div></form></div>
  <div class="board">${APP_ST.map((st) => `<div class="col"><div class="col-h"><b>${st}</b><span class="mono">${apps.filter((a) => a.st === st).length}</span></div>${apps.map((a, i) => a.st !== st ? "" : `<div class="app-card"><b>${esc(a.role)}</b><span class="note">${esc(a.co)} · ${esc(a.on)}</span><label class="sr-only" for="as-${i}">Status</label><select id="as-${i}" data-app="${i}">${APP_ST.map((x) => `<option ${x === a.st ? "selected" : ""}>${x}</option>`).join("")}</select></div>`).join("") || `<p class="note">None yet</p>`}</div>`).join("")}</div>
  <div class="cols"><div class="card"><div class="ch"><h3>This week's tracker</h3>${tI && isDoneIt(tI) ? `<span class="pill ok">Submitted</span>` : ""}</div><p class="note">Submit your tracker every Friday. Aim for at least 5 targeted applications a week (minimum 3 to submit).</p>
      ${tI ? `<div><button class="btn sm" data-act="ls-done" data-k="${tI.key}" data-v="${isDoneIt(tI) ? 0 : 1}" ${apps.length < 3 && !isDoneIt(tI) ? "disabled" : ""}>${isDoneIt(tI) ? "Submitted ✓ · Undo" : `Submit tracker (${apps.length} applications)`}</button></div>` : ""}</div>
    <div class="card"><div class="ch"><h3>Got an interview?</h3>${rI && isDoneIt(rI) ? `<span class="pill ok">Reported</span>` : ""}</div><p class="note">Move an application to Interviewing, then tell your coach so they can help you prepare.</p>
      ${rI ? `<div><button class="btn sm gold" data-act="ls-done" data-k="${rI.key}" data-v="1" ${!hasInt || isDoneIt(rI) ? "disabled" : ""}>${isDoneIt(rI) ? "Coach notified ✓" : "Report interview to my coach"}</button></div>` : ""}</div></div>`;
}
const SPECIAL = { 3: projectView, 4: internView, 5: cvView, 6: dcView, 7: jobView };
// Items that are done from their week page rather than their own page.
const ON_WEEK_PAGE = ["Book your 1-on-1 session", "Mock interview simulation", "ATS-compliant resume", "Weekly job application tracker", "Send 10 cold outreach messages", "Report your first interview invite"];
let draftT = {};
function saveDraft(k, data, now) { LS.X.drafts = { ...(LS.X.drafts || {}), [k]: data }; clearTimeout(draftT[k]); draftT[k] = setTimeout(() => rpc("learn_draft", { p_key: k, p_data: data }).then(() => { const s = $("#cv-saved"); if (s && k === "cv") s.textContent = "Saved"; }).catch((x) => toast(x.message)), now ? 0 : 600); }

/* ---------- graduation & alumni ---------- */
const OUT_ST = [["hired", "Hired (full-time or part-time job)"], ["internship", "Paid internship or graduate trainee"], ["freelance", "Freelance or contract work"], ["study", "Further study"], ["searching", "Still searching"]];
const OUT_L = Object.fromEntries(OUT_ST.map(([k, l]) => [k, l.split(" (")[0]]));
const VIA = [["jobnest", "Through Jobnest (an opportunity or introduction)"], ["own", "My own application"], ["referral", "A referral or my network"], ["other", "Other"]];
const allWeeksDone = () => LS.W.every((_, i) => weekDone(i));
function gradHero() {
  return `<div class="card grad-hero" id="t-today"><div><p class="eyebrow">Programme complete</p><h2>You did it, ${esc(LS.C.me.first_name)}! 🎓</h2>
    <p>You've finished all ${LS.W.length} weeks of Jobnest Academy. See what's left for your certificate, tell us where you land, and keep your job search going.</p>
    <div class="actions"><a class="btn gold" href="#/learn/graduate">See your next steps →</a></div></div></div>`;
}
const optSel = (L, v, id, ph) => `<select id="${id}">${ph ? `<option value="">${ph}</option>` : ""}${L.map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
function lsGraduatePage() {
  const G = LS.G || {}, me = LS.C.me, done = LS.W.filter((_, i) => weekDone(i)).length, all = done === LS.W.length, cert = LS.cert, o = G.outcome, sv = G.survey;
  const apps = draft("apps", []), ints = apps.filter((a) => a.st === "Interviewing" || a.st === "Offer").length, avg = avgScore();
  const ends = G.end_date ? new Date(G.end_date + "T12:00:00+01:00") : weekDue(LS.W.length - 1);
  const chk = [[`All ${LS.W.length} weeks complete`, all, `${done} of ${LS.W.length} done`], ["Internship evaluation from your supervisor", !!G.eval, G.eval ? "Received" : "Your host supervisor completes this in Week 13"],
    ["Exit survey", !!sv, sv ? "Thank you!" : "Below, 3 minutes"], ["Certificate issued", !!cert, cert ? "Ready to download" : "Jobnest issues it once the steps above are done"]];
  const ck = (d) => { const c = (G.checkins || {})[d], opens = new Date(ends.getTime() + (d - 7) * DAY), open = LS.L.unlock_all || Date.now() >= opens.getTime();
    return `<form class="card form grad-ck" data-day="${d}" novalidate><div class="ch"><h3>${d}-day check-in</h3>${c ? `<span class="pill ok">Sent ${fmtDay(c.at)}</span>` : open ? `<span class="pill now">Open</span>` : `<span class="pill">Opens ${fmtD(opens)}</span>`}</div>
      ${open ? `<div class="field"><label for="ck${d}-st">What are you doing now?</label>${optSel(OUT_ST, c?.status || o?.status, `ck${d}-st`, "Choose one")}</div>
        <div class="field"><label for="ck${d}-note">Anything we can help with? (optional)</label><input id="ck${d}-note" value="${esc(c?.note || "")}" placeholder="e.g. I have an interview next week and want to practise"></div>
        <div><button class="btn sm" type="submit">${c ? "Update" : "Send check-in"}</button></div>` : `<p class="note">We'll check in ${d} days after the programme ends to see how you're doing.</p>`}</form>`; };
  lsShell("graduate", pageHead("Graduation & next steps", all ? `Congratulations, ${esc(me.first_name)}! 🎓` : "Graduation & next steps", all ? "You've completed Jobnest Academy. Here's what's left, and how we stay with you after the programme." : "This page fills in as you finish the programme. Everything here opens after Week 17.") + `<section class="wrap pagebody">
    <div class="strip"><div class="sti"><span class="eyebrow">Weeks done</span><b class="mono">${done}/${LS.W.length}</b></div><div class="sti"><span class="eyebrow">Average</span><b class="mono">${avg != null ? avg + "%" : "—"}</b></div>
      <div class="sti"><span class="eyebrow">Applications</span><b class="mono">${apps.length}</b></div><div class="sti"><span class="eyebrow">Interviews</span><b class="mono">${ints}</b></div></div>
    <div class="cols"><div class="stack">
      <div class="card"><div class="ch"><h3>Your certificate</h3>${cert ? `<span class="pill ok">Issued</span>` : ""}</div>
        <ul class="grad-list">${chk.map(([t, ok, n]) => `<li class="${ok ? "ok" : ""}"><span class="gl-ic">${ok ? "✓" : "○"}</span><span><b>${t}</b><span class="note">${n}</span></span></li>`).join("")}</ul>
        ${cert ? `<div class="actions"><a class="btn gold" href="#/learn/certificate">View and download</a></div>` : ""}</div>
      <form class="card form" id="grad-out" novalidate><div class="ch"><h3>Where are you now?</h3>${o ? `<span class="pill ok">Updated ${fmtDay(o.at)}</span>` : ""}</div>
        <p class="note">Got a job, an internship or freelance work? Tell us, so we can celebrate you and track how Jobnest graduates do. Update it any time.</p>
        <div class="field"><label for="go-st">What are you doing now?</label>${optSel(OUT_ST, o?.status, "go-st", "Choose one")}</div>
        <div class="grid2"><div class="field"><label for="go-co">Company</label><input id="go-co" placeholder="e.g. Kuda" value="${esc(o?.company || "")}"></div><div class="field"><label for="go-role">Your role</label><input id="go-role" placeholder="e.g. Data Analyst" value="${esc(o?.role || "")}"></div></div>
        <div class="grid2"><div class="field"><label for="go-start">Start date</label><input id="go-start" type="date" value="${esc(o?.start_date || "")}"></div><div class="field"><label for="go-via">How did you get it?</label>${optSel(VIA, o?.via, "go-via", "Choose one")}</div></div>
        <p class="err" id="go-err" role="alert"></p><div><button class="btn" type="submit">${o ? "Update" : "Save"}</button></div></form>
    </div><div class="stack">
      ${sv ? `<div class="card"><div class="ch"><h3>Exit survey</h3><span class="pill ok">Sent</span></div><p class="note">Thank you for your feedback. It helps us make the next cohort better.</p></div>`
        : `<form class="card form" id="grad-survey" novalidate><div class="ch"><h3>Exit survey</h3><span class="note">3 minutes</span></div>
        <div class="field"><span class="lbl">How likely are you to recommend Jobnest Academy to a friend? (0 = not at all, 10 = definitely)</span><div class="rate nps">${[...Array(11)].map((_, n) => `<label><input type="radio" name="gs-rec" value="${n}"><span>${n}</span></label>`).join("")}</div></div>
        <div class="field"><label for="gs-best">What helped you most?</label><textarea id="gs-best" placeholder="e.g. The internship and the weekly feedback" rows="2"></textarea></div>
        <div class="field"><label for="gs-imp">What should we improve?</label><textarea id="gs-imp" placeholder="e.g. More practice exercises before the project" rows="2"></textarea></div>
        <div class="field"><label for="gs-quote">A sentence about your experience (optional)</label><textarea id="gs-quote" rows="2" placeholder="e.g. Jobnest gave me real work experience and the confidence to apply."></textarea></div>
        <label class="check"><input type="checkbox" id="gs-ok"> Jobnest may share this sentence with my first name and track on its website and social media.</label>
        <p class="err" id="gs-err" role="alert"></p><div><button class="btn" type="submit">Send survey</button></div></form>`}
      <div class="card next-opp ${cert ? "" : "lk"}"><div class="ch"><h3>Find your next opportunity</h3>${cert ? `<span class="pill ok">Open</span>` : `<span class="pill">🔒 Locked</span>`}</div>
        ${cert ? `<p class="note">You're a Jobnest graduate. Browse jobs, internships and graduate programmes on Jobnest Careers, and apply with your verified certificate.</p><div class="actions"><a class="btn gold" href="https://jobnestcareers.com/#opportunities" target="_blank" rel="noopener">Go to Jobnest Opportunities ↗</a></div>`
          : `<p class="note">Jobnest Career Opportunities opens here once your certificate is issued. Finish the steps on the left first.</p>`}</div>
      <div class="card"><h3>Keep your job search going</h3><p class="note">Your portal stays open after the programme. Keep using your tools:</p>
        <div class="actions"><a class="btn sm ghost" href="#/learn/learning/${LS.W.length}">Applications board</a><a class="btn sm ghost" href="#/learn/learning/${LS.W.findIndex((w) => w.stage === 5) + 1}">CV builder</a><a class="btn sm ghost" href="#/learn/help">Help & Support</a></div></div>
    </div></div>
    <h2 style="margin:1.6rem 0 .8rem">Alumni check-ins</h2><p class="note" style="margin-bottom:1rem">We check in 30, 60 and 90 days after the programme. Tell us how you're doing, and ask for help if you need it.</p>
    <div class="grad-cks">${[30, 60, 90].map(ck).join("")}</div></section>`);
}

/* ---------- staff: outcomes ---------- */
async function tabOutcomes() {
  const L = await rpc("acad_outcomes"), work = ["hired", "internship", "freelance"];
  const rep = L.filter((x) => x.outcome), emp = rep.filter((x) => work.includes(x.outcome.status)), sv = L.filter((x) => x.survey);
  const nps = sv.length ? Math.round(((sv.filter((x) => x.survey.recommend >= 9).length - sv.filter((x) => x.survey.recommend <= 6).length) / sv.length) * 100) : null;
  const pill = (st) => st ? `<span class="pill ${work.includes(st) ? "ok" : st === "searching" ? "now" : "info"}">${esc(OUT_L[st] || st)}</span>` : `<span class="pill">Not reported</span>`;
  const row5 = (x, i) => { const o = x.outcome, s = x.survey;
    return `<details class="arow noav" data-id="oc${i}" ${ui.open === "oc" + i ? "open" : ""}><summary><span class="an"><b>${esc(x.name)}</b><span class="note">${esc(x.matric)} · ${esc(x.track || "")}${o && o.company ? ` · ${esc(o.role || "")} at ${esc(o.company)}` : ""}</span></span>
      <span class="anext">${[30, 60, 90].map((d) => x.checkins[d] ? `${d}d ✓` : `${d}d –`).join(" · ")}${s ? ` · survey ${s.recommend}/10` : ""}</span>${pill(o?.status)}</summary>
    <div class="abody"><dl class="kv">${o ? `<div><dt>Now</dt><dd>${esc(OUT_L[o.status])}${o.company ? ` · ${esc(o.role || "")} at ${esc(o.company)}` : ""}</dd></div>${o.start_date ? `<div><dt>Started</dt><dd>${fmtDateD(o.start_date)}</dd></div>` : ""}${o.via ? `<div><dt>How</dt><dd>${esc((VIA.find((v) => v[0] === o.via) || [])[1] || o.via)}</dd></div>` : ""}<div><dt>Updated</dt><dd>${fmtDay(o.at)}</dd></div>` : `<div><dt>Now</dt><dd>Not reported yet</dd></div>`}
      ${[30, 60, 90].map((d) => x.checkins[d] ? `<div><dt>${d}-day check-in</dt><dd>${esc(OUT_L[x.checkins[d].status])}${x.checkins[d].note ? ` · “${esc(x.checkins[d].note)}”` : ""}</dd></div>` : "").join("")}
      ${s ? `<div><dt>Would recommend</dt><dd>${s.recommend}/10</dd></div>${s.best ? `<div><dt>Helped most</dt><dd>${esc(s.best)}</dd></div>` : ""}${s.improve ? `<div><dt>Improve</dt><dd>${esc(s.improve)}</dd></div>` : ""}${s.testimonial ? `<div><dt>Testimonial</dt><dd>“${esc(s.testimonial)}” ${s.consent ? `<span class="pill ok">OK to share</span>` : `<span class="pill">Private</span>`}</dd></div>` : ""}` : ""}</dl>
      ${x.phone ? `<div class="actions"><a class="link sm" href="https://wa.me/${esc(String(x.phone).replace(/\D/g, "").replace(/^0/, "234"))}" target="_blank" rel="noopener">WhatsApp ↗</a></div>` : ""}</div></details>`; };
  const quotes = sv.filter((x) => x.survey.testimonial && x.survey.consent);
  shell("outcomes", "Outcomes", "Where graduates land, 30/60/90-day check-ins and exit survey results.",
    `<div class="kpis">${[["Certificates issued", L.filter((x) => x.cert).length], ["In work", `${emp.length}${L.length ? ` · ${Math.round((emp.length / L.length) * 100)}%` : ""}`], ["Reported so far", `${rep.length}/${L.length}`], ["Recommend score (NPS)", nps != null ? (nps > 0 ? "+" : "") + nps : "–"]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    <div class="card" style="margin-top:1rem">${L.length ? `<div class="arows">${L.map(row5).join("")}</div>` : empty("No admitted students yet.")}</div>
    ${quotes.length ? `<div class="card" style="margin-top:1rem"><h3>Testimonials you can share</h3><p class="note">These students agreed to share their words with their first name and track.</p><ul class="quotes">${quotes.map((x) => `<li><p>“${esc(x.survey.testimonial)}”</p><span class="note">${esc(x.name.split(" ")[0])}, ${esc(x.track || "")}</span></li>`).join("")}</ul></div>` : ""}`);
}

/* ---------- More pages ---------- */
function lsAssignmentsPage(key) {
  if (key) return lsAssignmentDetail(key);
  const list = lsAssignments(), f = ui.asf || "All", groups = ["All", "Not Started", "Submitted", "Revision Required", "Graded"];
  const shown = list.filter((a) => f === "All" || aStatus(a.it) === f);
  const hist = (LS.L.history || []).slice().reverse().slice(0, 8).map((h) => ({ ...h, f: findItem(h.key) }));
  lsShell("assignments", pageHead("Assignments & Projects", "Your submissions", "Everything you need to submit across the 17 weeks, with deadlines, rubrics and facilitator feedback.") +
  `<section class="wrap pagebody"><div class="chips" role="group" aria-label="Filter by status">${groups.map((g) => `<button class="chipf" data-act="ls-asf" data-k="${g}" aria-pressed="${f === g}">${g}${g === "All" ? "" : ` <span class="mono">${list.filter((a) => aStatus(a.it) === g).length}</span>`}</button>`).join("")}</div>
    <div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Assignment</th><th>Week</th><th>Deadline</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>
    ${shown.length ? shown.map((a) => { const un = unlockedW(a.wi), st = aStatus(a.it);
      return `<tr><td data-label="Assignment"><b>${esc(a.it.title)}</b><span class="note" style="display:block">${esc(a.wk.title)}</span></td><td data-label="Week" class="mono">W${a.wi + 1}</td><td data-label="Deadline">${fmtD(weekDue(a.wi))}</td><td data-label="Type">${a.it.type === "logweek" ? "Logbook form" : "Link submission"}</td><td data-label="Status">${un ? pillS(st) : `<span class="pill">Opens in Week ${a.wi + 1}</span>`}</td>
        <td>${un ? `<a class="btn sm ghost" href="${a.it.type === "logweek" ? `#/learn/learning/${a.wi + 1}/${a.it.key}` : `#/learn/assignments/${a.it.key}`}">${st === "Revision Required" ? "Revise" : st === "Not Started" ? "Start" : "View"}</a>` : ""}</td></tr>`; }).join("") : `<tr><td colspan="6"><p class="empty">No assignments with the status “${f}”.</p></td></tr>`}
    </tbody></table></div>
    <div class="card"><h3>Submission history</h3>${hist.length ? `<ul class="hist">${hist.map((h) => `<li><span class="mono note">${fmtAt(h.at)}</span><span><b>${esc(h.f ? h.f.it.title : "Week " + h.key.slice(1))}</b> · ${esc(h.action)}</span></li>`).join("")}</ul>` : `<p class="empty">Nothing submitted yet. Your submissions and feedback will appear here.</p>`}</div></section>`);
}
function lsAssignmentDetail(key) {
  const f = findItem(key); if (!f) return go("#/learn/assignments");
  const { wi, it } = f, r = row(it), st = aStatus(it), un = unlockedW(wi), total = RUBRIC.reduce((s, x) => s + x[2], 0);
  const hist = (LS.L.history || []).filter((h) => h.key === key).slice().reverse();
  lsShell("assignments", pageHead(`Week ${wi + 1} · ${esc(LS.W[wi].title)}`, esc(it.title)) + `<section class="wrap pagebody"><nav class="crumbs"><a class="link" href="#/learn/assignments">Assignments & Projects</a> / <span>${esc(it.title)}</span></nav>
  <div class="cols wide"><div class="stack">
    <div class="card"><div class="ch"><h3>Instructions</h3>${pillS(st)}</div><p>${esc(it.detail || "")}</p>${deadlineLine(wi)}<ul class="reqs"><li>Submit one link that anyone with the link can view (Google Drive, Notion, Canva, GitHub, etc.).</li><li>Feedback arrives within 5 working days.</li></ul></div>
    ${r?.feedback ? `<div class="card fb ${r.status === "graded" ? "ok" : "bad"}"><div class="ch"><h3>${r.status === "graded" ? "Facilitator feedback" : "Revision requested"}</h3>${r.status === "graded" ? `<span class="score mono">${r.score}/100</span>` : ""}</div><p>${esc(r.feedback)}</p><p class="note">${esc(r.graded_by || "Your facilitator")}${r.cap && r.cap < 1 && r.status === "graded" ? ` · Marked ${r.grade}/100, capped at ${r.cap * 100}% for late submission` : ""}</p></div>` : ""}
    <div class="card"><h3>${st === "Revision Required" ? "Resubmit your work" : "Your submission"}</h3>${!un ? `<p class="empty">This assignment opens in Week ${wi + 1}.</p>` : r?.status === "graded" ? `<p>Submitted link: <a class="mono" style="word-break:break-all" href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a></p>`
      : `<form id="ls-link" data-k="${it.key}" class="form" style="margin-top:.8rem" novalidate><div class="field"><label for="ls-url">Link to your work *</label><input id="ls-url" inputmode="url" placeholder="https://" value="${esc(r?.link || "")}"></div><p class="err" id="ls-err" role="alert"></p>
        <div class="actions"><button class="btn" type="submit">${st === "Revision Required" ? "Resubmit" : r ? "Update link" : "Submit assignment"}</button></div></form>${r?.status === "submitted" ? `<p class="note" style="margin-top:.6rem">Waiting for your facilitator to grade it. Feedback arrives within 5 working days.</p>` : ""}`}</div></div>
    <div class="stack"><div class="card"><h3>Details</h3><dl class="kv"><div><dt>Deadlines</dt><dd>Full marks: ${fmtD(weekDue(wi))}, 17:00<br>80% max: ${fmtD(graceDue(wi))}, 23:59</dd></div><div><dt>Stage</dt><dd>${esc(COURSE_STAGES[LS.W[wi].stage].title)}</dd></div><div><dt>In My Learning</dt><dd><a class="link" href="#/learn/learning/${wi + 1}/${it.key}">Week ${wi + 1} item</a></dd></div></dl></div>
      ${it.proj ? `<div class="card"><h3>Assessment rubric</h3><table class="tbl rub"><tbody>${RUBRIC.map((x) => `<tr><td><b>${x[0]}</b><span class="note">${x[1]}</span></td><td class="mono">${x[2]}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="mono">${total}</td></tr></tbody></table></div>` : ""}
      <div class="card"><h3>History</h3>${hist.length ? `<ul class="hist">${hist.map((h) => `<li><span class="mono note">${fmtAt(h.at)}</span><span>${esc(h.action)}${h.by ? ` · ${esc(h.by)}` : ""}</span></li>`).join("")}</ul>` : `<p class="empty">No activity yet.</p>`}</div></div></div></section>`);
}
function discussionCard(D, staff, ch = "cohort") {
  const post = (x, top) => `<li class="dp ${x.staff ? "staff" : ""} ${x.hidden ? "hid" : ""}"><div class="dp-h"><b>${esc(x.author)}</b>${x.pinned ? `<span class="pill info">Pinned</span>` : ""}${x.hidden ? `<span class="pill bad">Hidden</span>` : ""}<span class="note">${ago(x.at)}</span></div><p>${lines(x.body)}</p>
    <div class="dp-a">${top ? `<button class="link sm" data-act="dp-reply" data-k="${x.id}">Reply</button>` : ""}${!staff && x.mine ? `<button class="link sm" data-act="dp-del" data-k="${x.id}">Delete</button>` : ""}${staff ? `<button class="link sm" data-act="dp-hide" data-k="${x.id}" data-v="${x.hidden ? 0 : 1}">${x.hidden ? "Show" : "Hide"}</button>${top ? `<button class="link sm" data-act="dp-pin" data-k="${x.id}" data-v="${x.pinned ? 0 : 1}">${x.pinned ? "Unpin" : "Pin"}</button>` : ""}` : ""}</div>
    ${top ? `${(x.replies || []).length ? `<ul class="dp-r">${x.replies.map((r) => post(r, false)).join("")}</ul>` : ""}<form class="dp-form reply" data-parent="${x.id}" ${ui.dpReply === x.id ? "" : "hidden"} novalidate><textarea rows="2" maxlength="2000" placeholder="Write a reply"></textarea><div><button class="btn sm" type="submit">Reply</button></div></form>` : ""}</li>`;
  const career = ch === "career";
  return `<div class="card disc" data-ch="${ch}"><div class="ch"><h3>${career ? "Career chat" : "Cohort discussion"}</h3><span class="note">${staff ? "Staff view" : career ? "Career coaches answer here" : "Be kind and helpful"}</span></div>
    ${career && !staff ? `<p class="note">Ask about CVs, interviews, job offers or your next move. Your career coach and cohort can see this.</p>` : ""}
    <form class="dp-form" data-parent="" novalidate><textarea rows="2" maxlength="2000" placeholder="${staff ? (career ? "Answer or share career advice" : "Post to the cohort") : career ? "e.g. How do I answer the salary question in an interview?" : "Ask a question or share something useful with your cohort"}"></textarea><div><button class="btn sm" type="submit">Post</button></div></form>
    ${D.length ? `<ul class="dp-list">${D.map((x) => post(x, true)).join("")}</ul>` : `<p class="empty">No posts yet. Start the conversation.</p>`}</div>`;
}
function lsCohortPage() {
  const C = LS.C, up = lsSessions().filter((x) => x.at.getTime() + x.minutes * 6e4 > Date.now()), past = lsSessions().filter((x) => x.at.getTime() + x.minutes * 6e4 <= Date.now()).reverse();
  lsShell("cohort", pageHead("My Cohort", esc(C.cohort.name), "Your pod, live sessions and announcements.") + `<section class="wrap pagebody"><div class="cols">
    <div class="stack">${podCard(LS.pod)}<div class="card"><h3>Coming up</h3>${up.length ? `<ul class="sess-list">${up.slice(0, 8).map(sessionRow).join("")}</ul>` : `<p class="empty">No sessions scheduled yet.</p>`}</div>
      ${past.length ? `<div class="card"><h3>Earlier sessions</h3><ul class="sess-list">${past.slice(0, 10).map(sessionRow).join("")}</ul></div>` : ""}</div>
    <div class="stack">${discussionCard(LS.disc || [], false)}<div class="card"><h3>Announcements</h3>${(C.news || []).length ? C.news.map((n) => `<div class="ann"><span class="eyebrow">${fmtAt(n.at)} · ${esc(n.by || "")}</span><b>${esc(n.title)}</b><p class="note">${lines(n.body)}</p></div>`).join("") : `<p class="empty">No announcements yet.</p>`}</div></div></div></section>`);
}
function profileForm() {
  const P = LS.profile || {};
  return `<form class="card form" id="profile-form" novalidate><h3>Your details</h3>
    <div class="pf-photo">${avatar("pf-av")}<div><b>Profile photo</b><span class="note">A clear, friendly head-and-shoulders photo. It shows on your student ID.</span>
      <div class="actions"><label class="btn sm ghost" for="pf-photo-in">${LS.photo ? "Change photo" : "Upload photo"}</label><input type="file" id="pf-photo-in" accept="image/*" class="sr-only">${LS.photo ? `<button type="button" class="link sm" data-act="pf-photo-rm">Remove</button>` : ""}</div></div></div><p class="note">Your name is fixed because it appears on your certificate. Ask Student Success if it's spelled wrong.</p>
    <div class="field"><label for="pf-phone">WhatsApp number</label><input id="pf-phone" type="tel" inputmode="tel" value="${esc(P.phone || "")}" placeholder="+2348031234567"></div>
    <div class="field"><label for="pf-city">City or town</label><input id="pf-city" maxlength="120" value="${esc(P.city || "")}" placeholder="e.g. Ikeja, Lagos"></div>
    <div class="field"><label for="pf-li">LinkedIn profile (optional)</label><input id="pf-li" inputmode="url" value="${esc(P.linkedin || "")}" placeholder="https://linkedin.com/in/your-name"></div>
    <div class="field"><label for="pf-bio">About you (optional)</label><textarea id="pf-bio" rows="3" maxlength="400" placeholder="One or two sentences your cohort and coaches will see.">${esc(P.bio || "")}</textarea></div>
    <label class="check"><input type="checkbox" id="pf-rem" ${P.email_reminders === false ? "" : "checked"}> Email me reminders about deadlines, check-ins, new weeks and live classes</label>
    <p class="err" id="pf-err" role="alert"></p><div><button class="btn" type="submit">Save my details</button></div></form>`;
}
function lsProfilePage(cert) {
  const me = LS.C.me;
  lsShell("profile", pageHead("Profile & Achievements", "Your profile", "Your student ID, certificate and badges.") + `<section class="wrap pagebody"><div class="cols">
    <div class="stack"><div class="card idcard"><div class="ch"><h3>Student ID</h3>${LOGO}</div><div class="id-row">${avatar("id-av")}<p style="margin:.4rem 0 0;font-size:1.3rem"><b>${esc(me.first_name)} ${esc(me.surname || "")}</b></p></div>
      <dl class="kv"><div><dt>Matric number</dt><dd class="mono">${esc(me.matric)}</dd></div><div><dt>Track</dt><dd>${esc(me.track || "")}</dd></div><div><dt>Cohort</dt><dd>${esc(LS.C.cohort.name)}</dd></div><div><dt>Email</dt><dd>${esc(me.email || "")}</dd></div></dl></div>
      ${cert ? `<div class="card cert-card"><span class="eyebrow">Certificate of completion</span><h2>Your certificate is ready 🎓</h2><div class="actions"><a class="btn gold" href="#/learn/certificate">View and download</a></div></div>` : `<div class="card"><h3>Certificate</h3><p class="note">Your certificate appears here once you complete the programme.</p></div>`}
      ${LS.icert && LS.icert.cert_id ? `<div class="card cert-card"><span class="eyebrow">Certificate of internship</span><h2>${esc(LS.icert.role)} at ${esc(LS.icert.org)}</h2><div class="actions"><a class="btn gold" href="#/learn/learning/13/${(LS.W[12]?.items.find((x) => x.title === "Collect your internship certificate") || {}).key || ""}">View and download</a></div></div>` : ""}
      ${installCard()}</div>
    <div class="stack">${progressCard(LS.C, cert)}${profileForm()}<div class="card"><h3>Account</h3><div class="actions"><a class="btn ghost" href="#/learn/forgot">Change password</a><button class="btn ghost" data-act="signout-learn">Sign out</button></div></div></div></div></section>`);
}
const SUPPORT_CATS = ["Technical problem", "Course content", "Deadlines or extension", "Payment", "Internship", "Personal or wellbeing", "Other"];
function lsHelpPage() {
  const Q = [["I can't open the next week", "Each week opens when you pass the week before it, and not earlier than the Saturday before it starts. Check the week result on the previous week."],
    ["Why can't I open a lesson?", "Inside each week, items open in order. Finish the step before it first. Optional items never block you."],
    ["How are weeks passed?", `In Stages 2–4, your assessment score and week project grade are averaged. You need ${PASS()}% or more. If your assessment is below ${PASS()}%, redo the week's lessons and retake it once.`],
    ["What if I submit late?", "Work is due Friday at 17:00 for full marks. Until Sunday 23:59 the maximum is 80%. After that, it's 50%."],
    ["How do I join a live session?", "Open My Cohort or Home and tap Join. Joining through the portal records your attendance."],
    ["I forgot my password", "Use Forgot password on the sign-in page. We'll email you a link."]];
  const R = LS.support || [], pill = (st) => `<span class="pill ${st === "Resolved" ? "ok" : st === "In progress" ? "info" : "now"}">${st}</span>`;
  lsShell("help", pageHead("Help & Support", "How can we help?", "Check the answers below, or send a request to Student Success. We reply within 1 working day.") + `<section class="wrap pagebody"><div class="cols">
    <div class="stack"><form class="card form" id="support-form" novalidate><h3>Contact Student Success</h3>
      <div class="field"><label for="sp-cat">What is it about?</label><select id="sp-cat"><option value="">Choose one</option>${SUPPORT_CATS.map((c) => `<option>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="sp-sub">Subject</label><input id="sp-sub" maxlength="120" placeholder="e.g. I can't open the Week 4 assessment"></div>
      <div class="field"><label for="sp-msg">Your message</label><textarea id="sp-msg" rows="4" maxlength="3000" placeholder="Tell us what happened and what you've tried. Add the week and task if it's about your work."></textarea></div>
      <p class="err" id="sp-err" role="alert"></p><div><button class="btn" type="submit">Send request</button></div></form>
      <div class="card"><h3>Your requests</h3>${R.length ? `<ul class="req-list">${R.map((r) => `<li><div class="ch"><b>${esc(r.subject)}</b>${pill(r.status)}</div><span class="note">${esc(r.category)} · ${fmtAt(r.at)}</span><p>${lines(r.message)}</p>${r.reply ? `<div class="reply"><span class="eyebrow">${esc(r.by || "Student Success")} · ${fmtAt(r.replied_at)}</span><p>${lines(r.reply)}</p></div>` : ""}</li>`).join("")}</ul>` : `<p class="empty">No requests yet.</p>`}</div></div>
    <div class="stack"><div class="card">${Q.map(([q, a], i) => `<details ${i ? "" : "open"} class="faq-i"><summary><b>${q}</b></summary><p class="note">${a}</p></details>`).join("")}</div>
      <div class="card"><h3>Other ways to reach us</h3><p>Email <a href="mailto:info@jobnestcareers.com">info@jobnestcareers.com</a> with your matric number, or message Student Success in your cohort community.</p></div></div></div></section>`);
}


/* ---------- fee lock, locked pages ---------- */
function feeLockPage() {
  const F = LS.fee;
  lsShell("home", pageHead("Payment", "Your learning is paused", "Your second instalment is overdue. Pay the balance and everything opens again straight away.") + `<section class="wrap pagebody"><div class="cols">
    <div class="stack"><div class="card fee-lock"><span class="eyebrow">Balance to pay</span><b class="mono fee-amt">${naira(F.balance)}</b>
      <dl class="kv"><div><dt>Was due</dt><dd>${fmtDateD(F.due_date)}</dd></div><div><dt>Application</dt><dd class="mono">${esc(F.ref)}</dd></div></dl>
      <div class="actions"><a class="btn gold" href="#/a/${esc(F.ref)}/${esc(F.token)}/pay">Pay ${naira(F.balance)} now</a><a class="btn ghost" href="#/learn">Back to Home</a></div>
      <p class="note">Your work, grades and progress are saved. Access comes back automatically once Paystack confirms your payment, usually within a minute.</p></div></div>
    <div class="stack"><div class="card"><h3>Need more time?</h3><p class="note">If something has happened that makes paying hard right now, talk to Student Success before you fall further behind.</p><div class="actions"><a class="btn sm ghost" href="#/learn/help">Contact Student Success</a></div></div></div></div></section>`);
}
function lockedPage(k) {
  const m = MORE_PAGES.find((x) => x[0] === k);
  lsShell(k, pageHead(m[1], `Opens in Week ${m[3] + 1}`, `${m[1]} opens when you reach Week ${m[3] + 1}. Until then, focus on your weekly learning. You'll get an alert when it opens.`) +
    `<section class="wrap pagebody"><div class="card locked-week"><span class="lock-ic" aria-hidden="true">🔒</span><p><b>${esc(m[2])}</b></p><p class="note">Locked until Week ${m[3] + 1}.</p><div class="actions"><a class="btn" href="#/learn/learning">Back to My Learning</a></div></div></section>`);
}

/* ---------- My Career ---------- */
const CAREER_SKILLS = { DAT: ["Spreadsheet formulas & pivot tables", "Data cleaning", "Data visualisation", "Dashboards & reporting"],
  CSP: ["Support fundamentals & tone", "Ticketing tools", "Live chat & email support", "CX metrics"],
  DMK: ["Marketing strategy & funnels", "Content creation", "Social media management", "Paid ads & analytics"],
  ADM: ["Calendar & inbox management", "Business documents", "Spreadsheets", "Travel, expenses & vendors"] };
const INTERVIEW_QS = [["Tell me about yourself.", "Use present–past–future: what you do now, the experience that got you here (your Jobnest project and internship), and why this role is next."],
  ["Why do you want this role?", "Link the job description to one skill you've proved in your portfolio and one thing you want to learn."],
  ["Tell me about a challenge you solved.", "Use STAR. Your internship logbook challenges are great material."],
  ["How do you manage your time with several deadlines?", "Mention time-blocking, your Trello or Notion board and how you speak up early when a deadline is at risk."],
  ["Describe a time you received difficult feedback.", "Show you listened, what you changed and the result. A revision request on an assignment works well."],
  ["Do you have any questions for us?", "Ask about the first 90 days, how success is measured and who you'd work with."]];
const OPP_ST = ["", "Interested", "Planning to apply", "Applied", "Interviewing", "Offer received", "Not selected"];
const stageWeeks = (st) => LS.W.map((w, i) => (w.stage === st ? i : -1)).filter((i) => i >= 0);
const stageDone = (st) => { const w = stageWeeks(st); return w.length > 0 && w.every(weekDone); };
function careerJourney() {
  const o = draft("opps", {}), applied = Object.values(o.st || {}).some((x) => ["Applied", "Interviewing", "Offer received"].includes(x)) || draft("apps", []).length > 0;
  const tn = LS.C.me.track || "your track";
  return [["Complete the skills foundation", "Weeks 2–3 complete, including the Workplace Readiness assessment", stageDone(1)],
    ["Build track skills", `The ${tn} core weeks complete, with each week passed`, stageDone(2)],
    ["Complete a practical project", "Client project submitted and graded by your project supervisor", stageDone(3)],
    ["Gain verified work experience", "Internship logbook signed and evaluation received", !!LS.X.eval || stageDone(4)],
    ["Build a professional CV", "ATS-ready CV submitted in Week 14", stageDone(5)],
    ["Complete interview preparation", "Mock interview done in Discovery Call 2", stageDone(6)],
    ["Explore opportunities", "At least one application tracked as Applied or further", applied]];
}
function lsCareerPage() {
  const c = draft("career", {}), J = careerJourney(), ok = J.filter((x) => x[2]).length;
  const core = stageWeeks(2), skills = [["Professional communication & workplace readiness", stageWeeks(1).at(-1)], ...(CAREER_SKILLS[LS.L.track] || CAREER_SKILLS.DAT).map((n, i) => [n, core[i]])];
  const ev = (wi) => { if (wi == null) return [""]; const sc = weekScore(wi), g = weekGate(wi);
    return weekDone(wi) ? ["assessed", `Week ${wi + 1} passed${sc != null ? ` · ${sc}%` : ""}`] : g && g.state === "grading" ? ["pending", `Week ${wi + 1} waiting for grading`] : ["", `Evidence comes from Week ${wi + 1}`]; };
  const port = lsAssignments().filter((a) => a.it.proj && aStatus(a.it) === "Graded" && LS.W[a.wi].stage >= 2);
  const intern = LS.X.eval ? LS.icert || { role: LS.X.placement?.role, org: LS.X.placement?.org } : null;
  const opt = (k, v) => `<option value="${k}" ${String(c["sk_" + v] ?? 0) === String(k) ? "selected" : ""}>${["Not rated", "1 · Beginner", "2 · Basic", "3 · Comfortable", "4 · Strong", "5 · Expert"][k]}</option>`;
  lsShell("career", pageHead("My Career", "Your career workspace", "Set your direction, track the skills you've proved, practise for interviews and talk to your career coach.") + `<section class="wrap pagebody"><div class="cols wide">
    <div class="stack">
      <div class="card"><div class="ch"><h3>Career readiness checklist</h3><span class="pill ${ok === J.length ? "ok" : "now"}">${ok} of ${J.length} met</span></div>
        <p class="note">Readiness is based on these programme requirements, not on finishing lessons alone.</p>
        <ol class="journey">${J.map(([t, n, d], i) => `<li class="${d ? "done" : ""}"><span class="jd">${d ? "✓" : i + 1}</span><div><b>${t}</b><span class="note">${n}</span></div></li>`).join("")}</ol></div>
      <div class="card"><h3>Skills profile</h3><p class="note">Your own rating sits beside what has been <b>proved through assessed work</b>. Assessed skills are what employers can trust.</p>
        <div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Skill</th><th>Self-rating</th><th>Evidence</th></tr></thead><tbody>
        ${skills.map(([n, wi], i) => { const [st, t] = ev(wi); return `<tr><td data-label="Skill"><b>${esc(n)}</b></td><td data-label="Self-rating"><label class="sr-only" for="sk-${i}">Self-rating for ${esc(n)}</label><select id="sk-${i}" data-cr="sk_${i}">${[0, 1, 2, 3, 4, 5].map((k) => opt(k, i)).join("")}</select></td>
          <td data-label="Evidence">${st === "assessed" ? `<span class="pill ok">Assessed</span>` : st === "pending" ? `<span class="pill info">Pending</span>` : `<span class="pill">Not yet</span>`} <span class="note">${esc(t || "")}</span></td></tr>`; }).join("")}</tbody></table></div></div>
      <div class="card"><h3>Portfolio</h3><p class="note">Only graded work can go in your portfolio, and only if you choose to show it.</p>
        ${port.length || intern ? `<ul class="port">${port.map((a) => `<li><div><b>${esc(a.it.title)}</b><span class="note">Week ${a.wi + 1} · Graded ${row(a.it).score}% · Verified by your facilitator</span></div><label class="check"><input type="checkbox" data-cr="port_${a.it.key}" ${c["port_" + a.it.key] ? "checked" : ""}> Visible</label></li>`).join("")}
          ${intern ? `<li><div><b>Internship${intern.org ? " at " + esc(intern.org) : ""}</b><span class="note">${esc(intern.role || "Intern")} · Logbook signed · Evaluated by your supervisor</span></div><label class="check"><input type="checkbox" data-cr="port_intern" ${c.port_intern ? "checked" : ""}> Visible</label></li>` : ""}</ul>`
          : `<p class="empty">Your graded projects and internship appear here once they're graded or signed off.</p>`}</div>
      <div class="card"><h3>Interview preparation</h3>
        <div class="star"><div><b>S</b>ituation<span class="note">Set the scene briefly.</span></div><div><b>T</b>ask<span class="note">What you had to achieve.</span></div><div><b>A</b>ction<span class="note">What <i>you</i> did, step by step.</span></div><div><b>R</b>esult<span class="note">The outcome, with a number if you can.</span></div></div>
        ${INTERVIEW_QS.map(([q, t], i) => `<details class="iq" ${c["iq_" + i] ? "open" : ""}><summary>${q}</summary><p class="note">${t}</p><div class="field"><label for="iq-${i}">Practise your answer</label><textarea id="iq-${i}" data-cr="iq_${i}" rows="4" placeholder="Write your answer using STAR">${esc(c["iq_" + i] || "")}</textarea></div></details>`).join("")}
        <p class="note" id="cr-saved" style="margin-top:.6rem">Your answers save as you type.</p></div>
    </div>
    <div class="stack">
      <div class="card form"><h3>Career goals</h3>
        <div class="field"><label for="cg-role">Role you're aiming for</label><input id="cg-role" data-cr="role" placeholder="e.g. Junior Data Analyst" value="${esc(c.role || "")}"></div>
        <div class="field"><label for="cg-stage">Where you are now</label><select id="cg-stage" data-cr="stage">${["", "Final-year student", "Recent graduate", "NYSC member", "Graduate looking for work", "Working, looking to switch"].map((o) => `<option value="${o}" ${c.stage === o ? "selected" : ""}>${o || "Choose one"}</option>`).join("")}</select></div>
        <div class="field"><label for="cg-int">Industries that interest you</label><input id="cg-int" data-cr="interests" placeholder="e.g. Fintech, logistics, e-commerce" value="${esc(c.interests || "")}"></div>
        <div class="field"><label for="cg-grow">Skills you want to develop</label><textarea id="cg-grow" data-cr="grow" rows="2" placeholder="e.g. SQL, presenting to managers">${esc(c.grow || "")}</textarea></div>
        <div class="field"><label for="cg-plan">Your 90-day action plan</label><textarea id="cg-plan" data-cr="plan" rows="3" placeholder="Three concrete things you'll do in the next 90 days">${esc(c.plan || "")}</textarea></div>
        <p class="note">Saved automatically. Your career coach can see your goals.</p></div>
      ${discussionCard(LS.discCareer || [], false, "career")}
      <div class="card"><h3>Talent matching</h3><p class="note">When Jobnest Recruit is connected, you can choose to share your verified skills and portfolio with employers. Nothing is shared without your consent.</p>
        <label class="check"><input type="checkbox" data-cr="consent" ${c.consent ? "checked" : ""}> I'd like to be considered for talent matching</label></div>
    </div></div></section>`);
}

/* ---------- Opportunities ---------- */
function lsOppsPage() {
  const O = LS.opps || [], d = draft("opps", {}), saved = d.saved || {}, st = d.st || {}, f = ui.oppF || "All";
  const kinds = ["All", "Saved", ...new Set(O.map((o) => o.kind))];
  const shown = O.filter((o) => f === "All" || (f === "Saved" ? saved[o.id] : o.kind === f)), tracked = O.filter((o) => st[o.id]);
  const days = (dl) => dl ? Math.ceil((new Date(dl + "T23:59:00+01:00") - Date.now()) / DAY) : null;
  lsShell("opps", pageHead("Opportunities", "Find your next step", "Jobs, internships, graduate programmes, freelance work and career events, shared by the Jobnest team. Listings for your track come first.") + `<section class="wrap pagebody">
    ${O.length ? `<div class="chips" role="group" aria-label="Filter opportunities">${kinds.map((t) => `<button class="chipf" data-act="opp-f" data-k="${esc(t)}" aria-pressed="${f === t}">${esc(t)}${t === "Saved" && Object.keys(saved).length ? ` (${Object.keys(saved).length})` : ""}</button>`).join("")}</div>` : ""}
    <div class="cols wide"><div class="opps">${shown.length ? shown.map((o) => { const dd = days(o.deadline); return `<article class="card opp"><div class="ch"><div><span class="tag">${esc(o.kind)}</span>${o.match ? ` <span class="pill ok">Matches your track</span>` : ""}<h3 style="margin-top:.5rem">${esc(o.title)}</h3><p class="note">${esc(o.org)}${o.location ? " · " + esc(o.location) : ""}</p></div>
      <button class="save" data-act="opp-save" data-k="${o.id}" aria-pressed="${!!saved[o.id]}" aria-label="${saved[o.id] ? "Remove from saved" : "Save opportunity"}"><svg width="20" height="20" viewBox="0 0 24 24" fill="${saved[o.id] ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button></div>
      ${o.description ? `<p>${lines(o.description)}</p>` : ""}${o.requirements ? `<p class="note"><b>Requirements:</b> ${esc(o.requirements)}</p>` : ""}
      ${o.skills ? `<div class="skl">${o.skills.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      <div class="ofoot"><span class="note">${o.deadline ? `Deadline: ${fmtD(new Date(o.deadline + "T12:00:00+01:00"))}${dd != null && dd <= 7 ? ` · <b class="warn-t">${dd <= 0 ? "closes today" : dd + " day" + (dd > 1 ? "s" : "") + " left"}</b>` : ""}` : "Open until filled"}</span>
        <div class="actions"><label class="sr-only" for="os-${o.id}">Your status</label><select id="os-${o.id}" data-ostat="${o.id}">${OPP_ST.map((x) => `<option value="${x}" ${(st[o.id] || "") === x ? "selected" : ""}>${x || "Track status…"}</option>`).join("")}</select>${o.link ? `<a class="btn sm" href="${esc(o.link)}" target="_blank" rel="noopener">Apply ↗</a>` : ""}</div></div></article>`; }).join("")
      : `<div class="card"><p class="empty">${f === "Saved" ? "No saved opportunities yet. Tap the bookmark on any listing to save it." : O.length ? "Nothing in this category right now." : "No opportunities posted yet. The Jobnest team adds new jobs, internships and events here. We'll send you an alert when they do."}</p></div>`}</div>
      <div class="stack"><div class="card"><h3>My applications</h3>${tracked.length ? `<ul class="roles">${tracked.map((o) => `<li><b>${esc(o.title)}</b><span class="note">${esc(o.org)}</span><span class="pill ${st[o.id] === "Offer received" ? "ok" : st[o.id] === "Not selected" ? "" : "info"}">${esc(st[o.id])}</span></li>`).join("")}</ul>` : `<p class="empty">Track an opportunity's status to see it here.</p>`}
        <p class="note" style="margin-top:.6rem">You update these statuses yourself. Jobnest never marks an application as sent for you.</p></div>
        <div class="card"><h3>Got an offer?</h3><p class="note">Tell us on your Graduation page so we can celebrate you.</p><div class="actions"><a class="btn sm ghost" href="#/learn/graduate">Report a job</a></div></div></div></div></section>`);
}

/* ---------- profile photo ---------- */
function saveCareer(el) { const c = { ...draft("career", {}), [el.dataset.cr]: el.type === "checkbox" ? el.checked : el.value }; saveDraft("career", c); const s0 = $("#cr-saved"); if (s0) s0.textContent = "Saved"; }
function photoPick(file) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)?/.test(file.type)) return toast("Choose a JPG or PNG photo");
  const fr = new FileReader();
  fr.onload = () => { const img = new Image();
    img.onload = async () => { const c = document.createElement("canvas"), sz = 256, m = Math.min(img.width, img.height); c.width = c.height = sz;
      c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, sz, sz);
      const data = c.toDataURL("image/jpeg", 0.85);
      try { await rpc("profile_photo", { p_data: data }); LS.photo = data; toast("Photo updated"); lsRender(); } catch { /* shown */ } };
    img.onerror = () => toast("That image couldn't be read. Try another photo."); img.src = fr.result; };
  fr.readAsDataURL(file);
}

/* ---------- staff: opportunities ---------- */
const OPP_KINDS = ["Job", "Internship", "Graduate programme", "Freelance project", "Work experience", "Career event"];
async function tabOpps() {
  const d = await rpc("acad_opps"), O = d.opps || [], e = ui.oppEdit, cur = e && e !== "new" ? O.find((o) => o.id === e) || {} : {};
  const form = e ? `<form class="card form" id="opp-form" data-id="${cur.id || ""}" novalidate><div class="ch"><h3>${cur.id ? "Edit opportunity" : "New opportunity"}</h3><button type="button" class="link sm" data-act="opp-edit" data-k="">Cancel</button></div>
      <div class="grid2"><div class="field"><label for="op-kind">Type</label><select id="op-kind">${OPP_KINDS.map((k) => `<option ${cur.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
        <div class="field"><label for="op-track">Best for</label><select id="op-track"><option value="">All tracks</option>${(d.tracks || []).map((t) => `<option value="${t.code}" ${cur.track_code === t.code ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div></div>
      <div class="grid2"><div class="field"><label for="op-title">Title</label><input id="op-title" value="${esc(cur.title || "")}" placeholder="e.g. Junior Data Analyst"></div><div class="field"><label for="op-org">Company</label><input id="op-org" value="${esc(cur.org || "")}" placeholder="e.g. Kuda"></div></div>
      <div class="grid2"><div class="field"><label for="op-loc">Location</label><input id="op-loc" value="${esc(cur.location || "")}" placeholder="e.g. Lagos · Hybrid"></div><div class="field"><label for="op-dl">Deadline (optional)</label><input id="op-dl" type="date" value="${esc(cur.deadline || "")}"></div></div>
      <div class="field"><label for="op-desc">What the role involves</label><textarea id="op-desc" rows="3">${esc(cur.description || "")}</textarea></div>
      <div class="field"><label for="op-req">Requirements</label><input id="op-req" value="${esc(cur.requirements || "")}" placeholder="e.g. Strong spreadsheets, a portfolio project"></div>
      <div class="grid2"><div class="field"><label for="op-skills">Skills (comma-separated)</label><input id="op-skills" value="${esc(cur.skills || "")}" placeholder="Excel, Dashboards"></div><div class="field"><label for="op-link">Apply link</label><input id="op-link" inputmode="url" value="${esc(cur.link || "")}" placeholder="https://"></div></div>
      <label class="check"><input type="checkbox" id="op-active" ${cur.active === false ? "" : "checked"}> Show to students</label>
      <p class="err" id="op-err" role="alert"></p><div><button class="btn" type="submit">Save</button></div></form>` : "";
  shell("opps", "Opportunities", "Jobs, internships and events students see on their Opportunities page (opens in Week 16). New listings send students an alert.",
    `${e ? form : `<div class="actions" style="margin-bottom:1rem"><button class="btn" data-act="opp-edit" data-k="new">Add an opportunity</button></div>`}
    <div class="card" style="margin-top:1rem">${O.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Opportunity</th><th>Type</th><th>Track</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
      ${O.map((o) => `<tr><td data-label="Opportunity"><b>${esc(o.title)}</b><span class="note">${esc(o.org)}${o.location ? " · " + esc(o.location) : ""}</span></td><td data-label="Type">${esc(o.kind)}</td><td data-label="Track">${esc(tName(d.tracks || [], o.track_code))}</td>
        <td data-label="Deadline">${o.deadline ? fmtDay(o.deadline) : "—"}</td><td data-label="Status">${o.active ? `<span class="pill ok">Live</span>` : `<span class="pill">Hidden</span>`}</td><td><button class="link sm" data-act="opp-edit" data-k="${o.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : empty("No opportunities yet. Add the first one.")}</div>`);
}

/* ---------- entry ---------- */
let COURSE_STAGES = null, COURSE_DATA = null;
async function pageLearn(p1, p2, p3) {
  if (!auth.session) return pageLearnSignIn();
  if (!isStudent()) { app.innerHTML = learnCard(`<h1>You're signed in as staff</h1><p>Sign out first to use the student portal.</p><div class="actions"><a class="btn" href="#/portal">Go to the staff portal</a><button class="btn ghost" data-act="signout-learn">Sign out</button></div>`); return; }
  if (!LS) loading();
  try {
    const [C, L, ex, ct, mod, X, G, POD, N, FEE, PF] = await Promise.all([rpc("student_campus"), rpc("learn_state"), rpc("student_campus_extra").catch(() => ({})), rpc("student_certificate").catch(() => null), COURSE_DATA ? null : import("./course.js"), rpc("learn_extra").catch(() => ({})), rpc("grad_state").catch(() => ({})), rpc("student_pod").catch(() => null), rpc("notices_list").catch(() => null), rpc("learn_fee_lock").catch(() => null), LS && LS.photo !== undefined ? null : rpc("profile_get").catch(() => ({}))]);
    if (mod) { COURSE_DATA = mod.COURSE; COURSE_STAGES = mod.COURSE.stages; }
    CAMPUS = C; CAMPUS.cert = ct;
    const cert = ct && ct.cert_id ? ct : null; CAMPUS.cert = cert;
    LS = { C, L, X: X || {}, G: G || {}, pod: POD && POD.name ? POD : null, N: N && N.items ? N : { unread: 0, items: [] }, W: COURSE_DATA.tracks[L.track] || COURSE_DATA.tracks.DAT, cert, extra: ex || {}, fee: FEE && FEE.balance ? FEE : null, photo: PF ? PF.photo || null : LS.photo, sup: LS?.sup, opps: LS?.opps };
  } catch (e) { if (e.status === 401 || /sign in/i.test(e.message)) { await auth.signOut(); LS = null; return pageLearnSignIn("Please sign in again."); } throw e; }
  ui.lsMore = false; ui.lsBell = false;
  const wk = p1 === "learning" ? (p2 || "") + "|" + (p3 || "") : null;
  if (wk !== null && wk.split("|")[0] !== (ui.lsWk || "").split("|")[0]) ui.wtab = "tasks";
  ui.lsWk = wk || ui.lsWk;
  await lsRender(p1, p2, p3);
  if (!p1 || p1 === "home") setTimeout(() => { let seen = false; try { seen = localStorage.getItem("jn.tour." + LS.C.me.matric) === "1"; } catch { /* ignore */ } if ((ui.wantTour || (!LS.extra.tour_done && !seen)) && TOUR_I == null) { ui.wantTour = false; startTour(); } }, 400);
}
const lsParts = () => location.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent).slice(1);
function gradCelebrate() {
  if (!allWeeksDone() || TOUR_I != null) return;
  if (!LS.gradSent) { LS.gradSent = true; rpc("grad_complete").catch(() => {}); }
  const k = "jn.grad." + LS.C.me.matric; let seen = false; try { seen = localStorage.getItem(k) === "1"; } catch { /* ignore */ }
  if (seen || $("#grad-modal")) return;
  try { localStorage.setItem(k, "1"); } catch { /* ignore */ }
  const n = LS.W.reduce((t, w) => t + w.items.filter((it) => !it.opt).length, 0), avg = avgScore();
  const m = document.createElement("div"); m.id = "grad-modal";
  m.innerHTML = `<div class="scrim"></div><div class="tour grad-pop" role="dialog" aria-modal="true" aria-labelledby="gp-t"><div class="hd"><span class="badge">Programme complete</span><button class="x" data-act="grad-close" aria-label="Close">✕</button></div>
    <div class="gp-emoji" aria-hidden="true">🎓</div><h2 id="gp-t">You've completed Jobnest Academy, ${esc(LS.C.me.first_name)}!</h2>
    <p>${LS.W.length} weeks · ${n} tasks${avg != null ? ` · ${avg}% average` : ""}. That took real commitment. We're proud of you.</p>
    <div class="ft"><button class="skip" data-act="grad-close">Not now</button><button class="btn gold" data-act="grad-go">See your next steps →</button></div></div>`;
  document.body.appendChild(m); m.querySelector("[data-act=grad-go]").focus({ preventScroll: true });
}
async function lsRender(p1, p2, p3) {
  setTimeout(gradCelebrate, 300); setTimeout(() => { if ($(".cert-box")) fitCert(); }, 30);
  setTimeout(() => { if (ui.quiz && $("#qt-left") && !QTIMER) { QTIMER = setInterval(quizTick, 1000); quizTick(); } }, 0);
  if (p1 === undefined) [p1, p2, p3] = lsParts();
  const page = p1 || "home", cert = LS.cert;
  if (LS.fee && !["home", "help", "profile"].includes(page)) return feeLockPage();
  if (MORE_PAGES.some((m) => m[0] === page && m[3] != null) && !pageOpen(page)) return lockedPage(page);
  if (page === "learning") { const wi = Math.min(Math.max((parseInt(p2, 10) || curWeek() + 1) - 1, 0), LS.W.length - 1);
    if (LS.W[wi].stage === 6 && !LS.X.booking && !p3 && unlockedW(wi) && !LS.slots) { try { LS.slots = await rpc("dc2_slots"); } catch { LS.slots = []; } }
    const f3 = p3 ? findItem(p3) : null;
    if (f3 && f3.it.title === "Collect your internship certificate" && LS.X.eval && LS.icert === undefined) LS.icert = await rpc("certificate_view", { p_cert: internCertId() }).catch(() => null);
    if (LS.W[wi].stage === 3 && LS.sup === undefined) LS.sup = await rpc("learn_supervisor").catch(() => null);
    lsLearning(wi, p3 || null); }
  else if (page === "career") { LS.discCareer = await rpc("disc_list2", { p_channel: "career" }).catch(() => []); lsCareerPage(); }
  else if (page === "opps") { LS.opps = await rpc("opps_list").catch(() => LS.opps || []); lsOppsPage(); }
  else if (page === "assignments") lsAssignmentsPage(p2 || null);
  else if (["cohort", "sessions", "news"].includes(page)) { LS.disc = await rpc("disc_list2", { p_channel: "cohort" }).catch(() => []); lsCohortPage(); }
  else if (page === "profile") { LS.profile = await rpc("profile_get").catch(() => ({})); if (LS.X.eval && LS.icert === undefined) LS.icert = await rpc("certificate_view", { p_cert: internCertId() }).catch(() => null); lsProfilePage(cert); }
  else if (page === "help") { LS.support = await rpc("support_list").catch(() => []); lsHelpPage(); }
  else if (page === "graduate") lsGraduatePage();
  else if (page === "certificate" && cert) {
    let c = null; try { c = await rpc("certificate_view", { p_cert: cert.cert_id }); } catch { c = null; }
    lsShell("profile", pageHead("Certificate", `Congratulations, ${esc(LS.C.me.first_name)}! 🎓`, "Download your certificate, add it to LinkedIn, or share the link with employers.") + `<section class="wrap pagebody">${c ? certBlock(c) : empty("Your certificate couldn't load. Please refresh.")}</section>`);
    fitCert();
  } else lsHome(cert);
}
// Run a learn_* call, keep the new state, redraw in place.
async function lsCall(fn, args, btn, msg) {
  let r;
  try { r = await busy(btn || null, () => rpc(fn, args)); } catch { return false; }
  if (!r) return false;
  LS.L = r; if (msg) toast(msg); await lsRender(); return true;
}

/* ---------- welcome tour (student portal) ---------- */
const TOUR = [
  { t: "Welcome to your student portal", b: "Here's a quick look around. It takes less than a minute." },
  { t: "Today", b: "Your next task and how many days are left this week. Tap Continue to pick up where you left off.", sel: "#t-today" },
  { t: "Your week at a glance", b: "Required tasks done, assignments due and your scores.", sel: "#t-strip" },
  { t: "My Learning", b: "All 17 weeks, grouped into stages. Each week opens when you pass the one before it.", sel: "#nav-learning" },
  { t: "More", b: "Assignments & Projects, My Cohort, your profile and Help & Support live here.", sel: "#more" },
  { t: "You're all set", b: "Start with Week 1: Orientation and sign your Student Oath. You can take this tour again from the More menu." },
];
let TOUR_I = null;
function clearSpot() { $$(".spot").forEach((x) => x.classList.remove("spot")); $$(".spot-host").forEach((x) => x.classList.remove("spot-host")); }
function startTour() { ui.lsMore = false; if (!$("#t-today")) { ui.wantTour = true; return go("#/learn"); } TOUR_I = 0; $("#toast").hidden = true; clearTimeout(toast.t); renderTour(); }
function renderTour() {
  clearSpot();
  let root = $("#tour-root");
  if (!root) { root = document.createElement("div"); root.id = "tour-root"; document.body.appendChild(root); }
  if (TOUR_I == null) { root.innerHTML = ""; return; }
  const i = TOUR_I, st = TOUR[i], last = i === TOUR.length - 1;
  const el = st.sel ? [].concat(st.sel).map((x) => $(x)).find((x) => x && x.offsetParent !== null) : null;
  if (el) { el.classList.add("spot"); el.closest(".appnav, header, .top")?.classList.add("spot-host"); el.scrollIntoView({ block: "center", behavior: "auto" }); }
  root.innerHTML = `<div class="scrim"></div><div class="tour ${el ? "placed" : ""}" role="dialog" aria-modal="true" aria-labelledby="tour-t">
    <div class="hd"><span class="badge">${i + 1} of ${TOUR.length}</span><button class="x" data-act="tour-end" aria-label="Close tour">✕</button></div>
    <h2 id="tour-t">${st.t}</h2><p>${st.b}</p>
    <div class="dots" aria-hidden="true">${TOUR.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
    <div class="ft">${i > 0 ? `<button class="skip" data-act="tour-back">Back</button>` : `<button class="skip" data-act="tour-end">Skip tour</button>`}
    <button class="btn" data-act="${last ? "tour-end" : "tour-next"}" id="tour-next">${last ? "Get started" : "Next →"}</button></div></div>`;
  if (el) placeTour(el);
  $("#tour-next").focus({ preventScroll: true });
}
// Put the tour box above or below the highlighted part so it never covers it.
function placeTour(el) {
  const box = $(".tour.placed"); if (!box || !el) return;
  const H = window.innerHeight, gap = 12, h = box.offsetHeight;
  let r = el.getBoundingClientRect();
  if (r.height + h + gap * 3 > H) { window.scrollBy(0, r.top - gap - (el.closest(".appnav") ? 0 : 60)); r = el.getBoundingClientRect(); }
  let top;
  if (H - r.bottom >= h + gap * 2) top = r.bottom + gap;
  else if (r.top >= h + gap * 2) top = r.top - h - gap;
  else { window.scrollBy(0, r.top - gap - 60); r = el.getBoundingClientRect(); top = Math.max(r.bottom + gap, H - h - gap); }
  box.style.top = Math.max(gap, Math.min(top, H - h - gap)) + "px";
}
window.addEventListener("resize", () => { const el = $(".spot"); if (el && TOUR_I != null) placeTour(el); });
function endTour() {
  TOUR_I = null; renderTour(); window.scrollTo({ top: 0, behavior: "smooth" });
  try { localStorage.setItem("jn.tour." + (CAMPUS?.me?.matric || ""), "1"); } catch { /* ignore */ }
  rpc("student_tour_done").catch(() => {});
}

/* ---------- host supervisor link (no login) ---------- */
const EVAL_CRIT = ["Quality of work", "Reliability & punctuality", "Communication", "Initiative", "Teamwork"];
let HOST = null;
async function pageHost(token, fresh) {
  if (!HOST || HOST.token !== token || !fresh) { loading(); try { HOST = { token, d: await rpc("host_view", { p_token: token }) }; } catch (e) {
    app.innerHTML = `<section class="wrap pub-wrap"><div class="card verify"><h1>This link isn't working</h1><p>${esc(e.message)}</p></div></section>`; return; } }
  const d = HOST.d, pl = d.placement, E = d.entries, allSigned = E.length && E.every((e) => e.data?.signed);
  const row2 = (l, v) => v ? `<div><dt>${l}</dt><dd>${lines(String(v))}</dd></div>` : "";
  app.innerHTML = `<header class="top"><div class="wrap"><div class="logo">${LOGO}Jobnest Academy</div></div></header>
  <section class="wrap host-wrap">
    <div class="card host-intro"><span class="eyebrow">Internship logbook · secure link</span><h1>Hello ${esc(pl.sup_name)},</h1>
      <p>${esc(d.student)} is interning with you at <b>${esc(pl.org)}</b> as a ${esc(pl.role)}. Each week they fill a logbook entry. Please read it, add a short comment and sign it off. It takes about 2 minutes.</p>
      <p class="note">No account or password is needed. This link only opens ${esc(d.first)}'s logbook, so please don't share it.</p>
      <ol class="lbtrack">${E.map((e, i) => `<li class="${e.data?.signed ? "done" : e.status === "done" ? "sub" : ""}"><span class="mono">Week ${i + 1}</span><small>${e.data?.signed ? "Signed" : e.status === "done" ? "To sign" : e.status === "revise" ? "Changes asked" : "Not yet"}</small></li>`).join("")}</ol></div>
    ${E.map((e, i) => { const x = e.data || {}, w = i + 1;
      if (!e.status) return `<div class="card"><div class="ch"><h3>Week ${w}</h3><span class="pill">Not submitted yet</span></div><p class="note">This entry appears here once ${esc(d.first)} submits it. Open this link again then.</p></div>`;
      if (e.status === "revise") return `<div class="card"><div class="ch"><h3>Week ${w}</h3><span class="pill bad">Changes requested</span></div><p class="note">You asked for: “${esc(e.feedback || "")}”. It comes back here when ${esc(d.first)} resubmits.</p></div>`;
      return `<div class="card host-entry"><div class="ch"><h3>Week ${w}${x.from ? ` · ${fmtDay(x.from + "T12:00:00Z")} to ${fmtDay(x.to + "T12:00:00Z")}` : ""}</h3>${x.signed ? `<span class="pill ok">Signed ${fmtDay(x.signed_at)}</span>` : `<span class="pill now">Waiting for your sign-off</span>`}</div>
        <dl class="kv">${row2("Days / hours", `${x.days || "–"} days · ${x.hours || "–"} hours`)}${row2("Tasks completed", x.tasks)}${row2("Tools", x.tools)}${row2("Meetings", x.meetings)}${x.evidence ? `<div><dt>Evidence</dt><dd><a class="link" href="${esc(x.evidence)}" target="_blank" rel="noopener">Open ↗</a></dd></div>` : ""}${row2("Skills learned", x.skills)}${row2("Challenges", x.challenges)}${row2("Feedback received", x.feedback)}${row2("Next week", x.next)}${row2("Biggest achievement", x.achievement)}${row2("Their rating of the week", x.rate ? x.rate + "/5" : "")}</dl>
        ${x.signed ? `<div class="signoff signed"><b>Your comment</b><p class="note">${esc(x.sup_comment || "No comment")}</p></div>`
          : `<div class="field"><label for="hc-${w}">Your comment</label><textarea id="hc-${w}" rows="2" placeholder="e.g. Reliable and quick to learn. Keep asking questions early."></textarea></div>
          <label class="check"><input type="checkbox" id="hok-${w}"> I confirm this entry is an accurate record of ${esc(d.first)}'s week.</label>
          <div class="actions"><button class="btn" data-act="host-sign" data-k="${esc(e.key)}" data-w="${w}">Sign off Week ${w}</button><button class="btn ghost" data-act="host-revise" data-k="${esc(e.key)}" data-w="${w}">Ask for changes</button></div>`}</div>`; }).join("")}
    <div class="card"><div class="ch"><h3>Final performance evaluation</h3>${d.eval ? `<span class="pill ok">Submitted ${fmtDay(d.eval.at)}</span>` : allSigned ? `<span class="pill now">Ready</span>` : `<span class="pill">After all 4 weeks are signed</span>`}</div>
      ${d.eval ? `<ul class="roles">${EVAL_CRIT.map((c, i) => `<li><b>${c}</b><span class="mono">${d.eval.ratings[i]}/5</span></li>`).join("")}</ul><p class="note">${esc(d.eval.comment || "")}</p>`
        : allSigned ? `${EVAL_CRIT.map((c, i) => `<div class="field"><span class="lbl">${c}</span><div class="rate">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="ev-${i}" value="${n}"><span>${n}</span></label>`).join("")}</div></div>`).join("")}
          <div class="field"><label for="ev-c">Overall comment</label><textarea id="ev-c" rows="3" placeholder="What did they do well? What should they work on next?"></textarea></div><p class="err" id="ev-err" role="alert"></p><div><button class="btn" data-act="host-eval">Submit evaluation</button></div>`
        : `<p class="note">Available once all four weekly entries are signed off.</p>`}</div>
    <p class="note" style="text-align:center">Questions? Email <a href="mailto:info@jobnestcareers.com">info@jobnestcareers.com</a>.</p></section>`;
}

/* ---------- staff: internships ---------- */
async function tabIntern() {
  const L = await rpc("acad_placements"); ui.places = L;
  const can = ["director", "cohort_manager", "academy_admin", "super"].includes(ME.role), base = location.origin + location.pathname;
  const row3 = (x, i) => { const p = x.placement, link = x.token ? `${location.origin}/host/${x.token}` : "";
    return `<details class="arow noav" data-id="pl${i}" ${ui.open === "pl" + i ? "open" : ""}><summary><span class="an"><b>${esc(x.name)}</b><span class="note">${esc(x.matric)} · ${esc(x.track || "")}${p ? ` · ${esc(p.org)}` : ""}</span></span>
      <span class="anext">${p ? `${x.signed}/4 signed${x.to_sign ? ` · ${x.to_sign} waiting` : ""}${x.eval ? " · evaluated" : ""}` : "No placement yet"}</span>${p ? (x.eval ? `<span class="pill ok">Done</span>` : `<span class="pill now">Placed</span>`) : `<span class="pill">To place</span>`}</summary>
      <div class="abody">${link ? `<div class="notice"><span><b>Supervisor's link</b> · share it with ${esc(p.sup_name)} by WhatsApp or email. Anyone with it can sign this logbook.</span>
          <span class="actions"><button class="btn sm" data-act="copy-host" data-k="${esc(link)}">Copy link</button>${p.sup_phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="https://wa.me/${esc(p.sup_phone.replace(/\D/g, "").replace(/^0/, "234"))}?text=${encodeURIComponent(`Hello ${p.sup_name}, this is Jobnest Academy. Please use this link each Friday to sign ${x.name}'s internship logbook: ${link}`)}">WhatsApp</a>` : ""}</span></div>` : ""}
        ${can ? `<form class="form place-form" data-i="${i}" novalidate><div class="grid2"><div class="field"><label for="po-${i}">Company</label><input id="po-${i}" placeholder="e.g. Brightpath Logistics Ltd" value="${esc(p?.org || "")}"></div><div class="field"><label for="pr-${i}">Role</label><input id="pr-${i}" value="${esc(p?.role || "")}" placeholder="e.g. Data Analyst Intern"></div></div>
          <div class="grid2"><div class="field"><label for="ps-${i}">Supervisor's name</label><input id="ps-${i}" placeholder="e.g. Funmi Bello" value="${esc(p?.sup_name || "")}"></div><div class="field"><label for="pp-${i}">Supervisor's WhatsApp</label><input id="pp-${i}" placeholder="e.g. 0803 000 0000" value="${esc(p?.sup_phone || "")}" inputmode="tel"></div></div>
          <div class="field"><label for="pe-${i}">Supervisor's email (optional)</label><input id="pe-${i}" placeholder="e.g. funmi@company.com" type="email" value="${esc(p?.sup_email || "")}"></div>
          <div class="actions"><button class="btn sm" type="submit">${p ? "Save changes" : "Save placement"}</button></div></form>` : ""}</div></details>`; };
  shell("intern", "Internships", "Weeks 10–13. Add each student's placement, then share the supervisor's link so they can sign the weekly logbook and give the final evaluation.",
    `<div class="card">${L.length ? `<div class="arows">${L.map(row3).join("")}</div>` : empty("No admitted students yet.")}</div>`);
}

/* ---------- staff: Discovery Call 2 ---------- */
async function tabDc2() {
  const L = await rpc("coach_calls"); ui.dc2 = L;
  const isCoach = ["coach", "super"].includes(ME.role), mine = L.filter((x) => x.mine || !isCoach);
  const days = [...Array(28)].map((_, i) => fmt(new Date(Date.now() + (i + 1) * 864e5), { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"))
    .filter((iso) => { const wd = new Date(iso + "T12:00:00Z").getUTCDay(); return wd !== 0 && wd !== 6; });
  const booked = L.filter((x) => x.app), open = mine.filter((x) => !x.app && new Date(x.at) > new Date());
  const call = (x, i) => `<details class="arow noav" data-id="dc${x.id}" ${ui.open === "dc" + x.id ? "open" : ""}><summary><span class="an"><b>${esc(x.name)}</b><span class="note">${fmtAt(x.at)} WAT · ${esc(x.track || "")}${isCoach ? "" : ` · ${esc(x.coach)}`}</span></span>
      <span class="anext">${x.result ? `Score ${x.result.score}/10` : new Date(x.at) < new Date() ? "Add the result" : "Booked"}</span>${x.result ? `<span class="pill ok">Done</span>` : `<span class="pill now">${new Date(x.at) < new Date() ? "To complete" : "Upcoming"}</span>`}</summary>
    <div class="abody">${x.note ? `<p class="note">Their note: “${esc(x.note)}”</p>` : ""}${x.cv ? `<details><summary class="link sm">See their CV</summary><div style="margin-top:.6rem">${cvPreview(x.cv)}</div></details>` : `<p class="note">No CV saved yet.</p>`}
      <form class="form dc2-form" data-i="${i}" novalidate><div class="grid2"><div class="field"><label for="dsc-${i}">Interview Confidence Score (1–10)</label><input id="dsc-${i}" placeholder="1 to 10" type="number" min="1" max="10" value="${x.result?.score ?? ""}"></div></div>
        <div class="field"><label for="dno-${i}">Summary for the student</label><textarea id="dno-${i}" placeholder="e.g. Strong pitch. Slow down and use numbers." rows="2">${esc(x.result?.note || "")}</textarea></div>
        <div class="field"><label for="dnx-${i}">Next steps (one per line)</label><textarea id="dnx-${i}" placeholder="One step per line" rows="3">${esc((x.result?.next || []).join("\n"))}</textarea></div>
        <div class="actions"><button class="btn sm" type="submit">${x.result ? "Update result" : "Save result"}</button></div></form></div></details>`;
  shell("dc2", "Discovery Call 2", "Week 15. Students book a 40-minute call with a career coach, then you record their Interview Confidence Score and next steps.",
    `<div class="grid2">${isCoach ? `<form class="card form" id="dc2-times" novalidate><h3>Add times</h3><p class="note">Each call is 40 minutes. Times are in WAT.</p>
      <div class="field"><span class="lbl">Days</span><div class="chips-row">${days.map((d) => `<label class="chip-cb"><input type="checkbox" name="dday" value="${d}"><span>${fmt(d + "T12:00:00Z", { weekday: "short", day: "numeric", month: "short" })}</span></label>`).join("")}</div></div>
      <div class="field"><span class="lbl">Times</span><div class="chips-row">${CALL_TIMES.map((t) => `<label class="chip-cb"><input type="checkbox" name="dtime" value="${t}"><span>${t}</span></label>`).join("")}</div></div>
      <div><button class="btn" type="submit">Add these times</button></div></form>` : ""}
    <div class="card"><div class="ch"><h3>Open times</h3><span class="note">${open.length}</span></div>${open.length ? `<ul class="slot-list">${open.map((s) => `<li><span class="mono">${fmtAt(s.at)}</span>${isCoach ? `<button class="link sm" data-act="dc2-rm" data-k="${s.id}">Remove</button>` : `<span class="note">${esc(s.coach)}</span>`}</li>`).join("")}</ul>` : empty("No open times.")}</div></div>
    <div class="card" style="margin-top:1rem"><div class="ch"><h3>Booked calls</h3><span class="note">${booked.length}</span></div>${booked.length ? `<div class="arows">${booked.map((x) => call(x, L.indexOf(x))).join("")}</div>` : empty("No calls booked yet.")}</div>`);
}

/* ---------- staff: job search (Weeks 14–17) ---------- */
async function tabJobs() {
  const L = await rpc("acad_jobsearch");
  const lk = (x, t, l) => x.links[t] ? `<a class="link sm" href="${esc(x.links[t])}" target="_blank" rel="noopener">${l} ↗</a>` : `<span class="note">${l}: not yet</span>`;
  const has = (x, t) => x.done.includes(t);
  const ints = (x) => x.apps.filter((a) => a.st === "Interviewing" || a.st === "Offer").length;
  const tot = { out: L.reduce((s, x) => s + x.outreach.length, 0), apps: L.reduce((s, x) => s + x.apps.length, 0), ints: L.reduce((s, x) => s + ints(x), 0), offers: L.reduce((s, x) => s + x.apps.filter((a) => a.st === "Offer").length, 0) };
  const row4 = (x, i) => `<details class="arow noav" data-id="js${i}" ${ui.open === "js" + i ? "open" : ""}><summary><span class="an"><b>${esc(x.name)}</b><span class="note">${esc(x.matric)} · ${esc(x.track || "")}${x.updated ? ` · active ${ago(x.updated)}` : ""}</span></span>
      <span class="anext">${x.outreach.length}/10 outreach · ${x.apps.length} applications · ${ints(x)} interview${ints(x) === 1 ? "" : "s"}</span>${x.apps.some((a) => a.st === "Offer") ? `<span class="pill ok">Offer</span>` : ints(x) ? `<span class="pill now">Interviewing</span>` : x.apps.length || x.outreach.length ? `<span class="pill info">Searching</span>` : `<span class="pill">Not started</span>`}</summary>
    <div class="abody">
      <div class="actions" style="flex-wrap:wrap">${lk(x, "LinkedIn profile makeover", "LinkedIn")}${lk(x, "Publish your portfolio", "Portfolio")}${lk(x, "Record your elevator pitch", "Pitch recording")}${lk(x, "Finalise your Job Search Action Plan", "Action plan")}${x.phone ? `<a class="link sm" href="https://wa.me/${esc(String(x.phone).replace(/\D/g, "").replace(/^0/, "234"))}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ""}</div>
      <p class="note">${[["ATS-compliant resume", "CV submitted"], ["Weekly job application tracker", "Tracker submitted"], ["Report your first interview invite", "Interview reported"]].map(([t, l]) => `${has(x, t) ? "✓" : "○"} ${l}`).join(" · ")}${x.score ? ` · Discovery Call 2 score ${x.score}/10` : ""}</p>
      ${x.pitch && (x.pitch.a || x.pitch.b || x.pitch.c) ? `<h4 style="margin:.8rem 0 .3rem">Pitch</h4><p class="note">${esc([x.pitch.a, x.pitch.b, x.pitch.c].filter(Boolean).join(" "))}</p>` : ""}
      <h4 style="margin:.8rem 0 .3rem">Applications</h4>${x.apps.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Role</th><th>Company</th><th>Status</th><th>Added</th></tr></thead><tbody>${x.apps.map((a) => `<tr><td data-label="Role"><b>${esc(a.role)}</b></td><td data-label="Company">${esc(a.co)}</td><td data-label="Status"><span class="pill ${a.st === "Offer" ? "ok" : a.st === "Interviewing" ? "now" : a.st === "Not selected" ? "bad" : ""}">${esc(a.st)}</span></td><td data-label="Added" class="note">${esc(a.on || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">None yet.</p>`}
      <h4 style="margin:.8rem 0 .3rem">Outreach</h4>${x.outreach.length ? `<ul class="roles">${x.outreach.map((o) => `<li><b>${esc(o.name)} · ${esc(o.co)}</b><span class="note">${esc(o.ch)} · ${esc(o.on || "")}</span><span class="pill ${o.st === "Sent" ? "" : "ok"}">${esc(o.st)}</span></li>`).join("")}</ul>` : `<p class="note">None yet.</p>`}
      ${x.cv ? `<details style="margin-top:.8rem"><summary class="link sm">See their CV</summary><div style="margin-top:.6rem">${cvPreview(x.cv)}</div></details>` : ""}
    </div></details>`;
  shell("jobs", "Job search", "Weeks 14–17. Each student's CV, LinkedIn, portfolio, pitch, outreach and job applications. It updates as students work.",
    `<div class="kpis">${[["Outreach sent", tot.out], ["Applications", tot.apps], ["Interviews", tot.ints], ["Offers", tot.offers]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    <div class="card" style="margin-top:1rem">${L.length ? `<div class="arows">${L.map(row4).join("")}</div>` : empty("No admitted students yet.")}</div>`);
}

/* ---------- staff: accountability pods ---------- */
async function tabPods() {
  const d = await rpc("acad_pods"); ui.pods = d;
  const can = ["director", "cohort_manager", "academy_admin", "super"].includes(ME.role);
  const tn = (c) => (d.tracks.find((t) => t.code === c) || {}).name || "All tracks";
  const podSel = (app, cur) => `<select data-change="pod-move" data-app="${app}" aria-label="Move to pod">${cur ? "" : `<option value="">Add to a pod…</option>`}${d.pods.map((p) => `<option value="${p.id}" ${p.id === cur ? "selected" : ""}>${esc(p.name)}</option>`).join("")}${cur ? `<option value="0">Remove from pod</option>` : ""}</select>`;
  const pod = (p) => `<div class="card"><div class="ch"><h3>${esc(p.name)}</h3><span class="pill">${p.members.length}</span></div>
    <p class="note">${esc(tn(p.track))}${p.meet ? ` · ${esc(p.meet)}` : ""}${p.link ? ` · <a class="link" href="${esc(p.link)}" target="_blank" rel="noopener">Meeting link ↗</a>` : ""}</p>
    <ul class="pod-m">${p.members.map((m) => `<li><span><b>${esc(m.name)}</b> <span class="note mono">${esc(m.matric)}</span></span>${can ? podSel(m.app, p.id) : ""}</li>`).join("") || `<li class="note">No one yet.</li>`}</ul>
    ${can ? `<details style="margin-top:.8rem"><summary class="link sm">Edit pod</summary><form class="form pod-form" data-id="${p.id}" novalidate style="margin-top:.6rem">${podFields(p, d.tracks)}<div class="actions"><button class="btn sm" type="submit">Save</button><button class="link sm danger" type="button" data-act="pod-del" data-k="${p.id}">Delete pod</button></div></form></details>` : ""}</div>`;
  shell("pods", "Accountability pods", "Small groups of students who check in with each other every week to keep each other on pace. Students see their pod in My Cohort.",
    `${can ? `<div class="grid2"><form class="card form" id="pods-auto" novalidate><h3>Create pods automatically</h3><p class="note">Puts everyone not yet in a pod into new pods, grouped by track.</p>
        <div class="grid2"><div class="field"><label for="pa-size">People per pod</label><input id="pa-size" type="number" min="3" max="10" value="5"></div><div class="field"><label for="pa-meet">Weekly check-in</label><input id="pa-meet" placeholder="e.g. Thursdays, 19:00 WAT" value="Thursdays, 19:00 WAT"></div></div>
        <div><button class="btn" type="submit">Create pods</button></div></form>
      <form class="card form pod-form" data-id="" novalidate><h3>New pod</h3>${podFields(null, d.tracks)}<div><button class="btn sm" type="submit">Add pod</button></div></form></div>` : ""}
    ${d.unassigned.length ? `<div class="card" style="margin-top:1rem"><div class="ch"><h3>Not in a pod yet</h3><span class="pill now">${d.unassigned.length}</span></div><ul class="pod-m">${d.unassigned.map((m) => `<li><span><b>${esc(m.name)}</b> <span class="note">${esc(tn(m.track))}</span></span>${can && d.pods.length ? podSel(m.app, null) : ""}</li>`).join("")}</ul></div>` : ""}
    <div class="pod-grid">${d.pods.map(pod).join("") || `<div class="card">${empty("No pods yet.")}</div>`}</div>`);
}
const podFields = (p, tracks) => `<div class="field"><label>Pod name</label><input name="name" value="${esc(p?.name || "")}" placeholder="e.g. Data Analysis pod 1"></div>
  <div class="field"><label>Track</label><select name="track"><option value="">All tracks</option>${tracks.map((t) => `<option value="${t.code}" ${p?.track === t.code ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
  <div class="field"><label>Weekly check-in</label><input name="meet" value="${esc(p?.meet || "")}" placeholder="e.g. Thursdays, 19:00 WAT"></div>
  <div class="field"><label>Meeting link (optional)</label><input name="link" value="${esc(p?.link || "")}" placeholder="https://"></div>`;
function podCard(P) {
  if (!P || !P.name) return `<div class="card"><h3>Your accountability pod</h3><p class="note">You'll be put in a small pod of classmates who check in with each other every week. It appears here once it's set up.</p></div>`;
  return `<div class="card"><div class="ch"><h3>Your accountability pod</h3><span class="note">${esc(P.name)}</span></div>
    <div class="pod">${P.members.map((m) => `<span class="pm ${m.me ? "me" : ""}"><span class="pa">${esc(m.initials)}</span><span class="note">${esc(m.name)}${m.me ? " (you)" : ""}</span></span>`).join("")}</div>
    <p class="note">${P.meet ? `Pod check-in every <b>${esc(P.meet)}</b> (30 minutes). ` : ""}Share your progress, help each other through blockers, and keep each other on pace.</p>
    ${P.link ? `<div><a class="btn sm" href="${esc(P.link)}" target="_blank" rel="noopener">Join pod check-in</a></div>` : ""}</div>`;
}

/* ---------- staff: help requests and discussion ---------- */
async function tabSupport() {
  const L = await rpc("acad_support"); ui.sup = L;
  const open = L.filter((r) => r.status !== "Resolved");
  const row = (r, i) => `<details class="arow noav" data-id="sp${r.id}" ${ui.open === "sp" + r.id ? "open" : ""}><summary><span class="an"><b>${esc(r.subject)}</b><span class="note">${esc(r.name)} · ${esc(r.matric)} · ${esc(r.category)} · ${ago(r.at)}</span></span>
      <span class="pill ${r.status === "Resolved" ? "ok" : r.status === "In progress" ? "info" : "now"}">${r.status}</span></summary>
    <div class="abody"><p>${lines(r.message)}</p>${r.reply ? `<div class="reply-box"><span class="eyebrow">${esc(r.by || "")} · ${fmtAt(r.replied_at)}</span><p>${lines(r.reply)}</p></div>` : ""}
      ${r.phone ? `<p><a class="link sm" href="https://wa.me/${esc(String(r.phone).replace(/\D/g, "").replace(/^0/, "234"))}" target="_blank" rel="noopener">WhatsApp ${esc(r.name.split(" ")[0])} ↗</a></p>` : ""}
      <form class="form sp-form" data-i="${i}" novalidate><div class="field"><label for="spr-${i}">Reply (the student gets an email and an alert)</label><textarea id="spr-${i}" rows="3" placeholder="Write your reply"></textarea></div>
        <div class="field"><label for="sps-${i}">Status</label><select id="sps-${i}">${["Open", "In progress", "Resolved"].map((s0) => `<option ${s0 === (r.status === "Open" ? "In progress" : r.status) ? "selected" : ""}>${s0}</option>`).join("")}</select></div>
        <div class="actions"><button class="btn sm" type="submit">Send</button></div></form></div></details>`;
  shell("support", "Help requests", "Requests students send from Help & Support. Reply here; they get an email and an alert in the portal.",
    `<div class="card"><div class="ch"><h3>Open</h3><span class="note">${open.length}</span></div>${open.length ? `<div class="arows">${open.map((r) => row(r, L.indexOf(r))).join("")}</div>` : empty("Nothing waiting. 🎉")}</div>
    <div class="card" style="margin-top:1rem"><h3>Resolved (last 60 days)</h3>${L.length - open.length ? `<div class="arows">${L.filter((r) => r.status === "Resolved").map((r) => row(r, L.indexOf(r))).join("")}</div>` : empty("Nothing yet.")}</div>`);
}
async function tabDiscussion() {
  const ch = ui.discCh || "cohort", d = await rpc("acad_discussion2", { p_channel: ch });
  shell("discussion", "Discussion", `${d.cohort ? esc(d.cohort) + ". " : ""}What students are saying. Reply, pin useful posts, or hide anything inappropriate.`,
    `<div class="chips" role="group" aria-label="Channel" style="margin-bottom:1rem">${[["cohort", "Cohort discussion"], ["career", "Career chat"]].map(([k, l]) => `<button class="chipf" data-act="disc-ch" data-k="${k}" aria-pressed="${ch === k}">${l}</button>`).join("")}</div>` +
    (d.cohort ? `<div class="staff-disc">${discussionCard(d.posts, true, ch)}</div>` : `<div class="card">${empty("There's no active cohort yet.")}</div>`));
}

/* ---------- staff: academy ---------- */
const trackOpts = (tracks, mine, val) => (mine ? tracks.filter((t) => t.code === mine) : [{ code: "", name: "All tracks" }, ...tracks]).map((t) => `<option value="${t.code}" ${t.code === (val ?? "") ? "selected" : ""}>${esc(t.name)}</option>`).join("");
const tName = (tracks, c) => c ? (tracks.find((t) => t.code === c)?.name || c) : "All tracks";

async function tabStudents() {
  const [d, certs, ls] = await Promise.all([rpc("acad_students"), rpc("acad_certificates").catch(() => ({})), rpc("acad_learn_stats").catch(() => ({}))]);
  const canCert = ["director", "academy_admin", "super"].includes(ME.role);
  const S = d.students, set = S.filter((s) => s.account).length;
  const att = S.filter((s) => s.sessions_past).map((s) => s.sessions_attended / s.sessions_past);
  const canInvite = ["cohort_manager", "academy_admin", "adm_admin", "super"].includes(ME.role);
  shell("students", "Students", `${esc(d.cohort.name)} · ${d.week < 1 ? `starts ${fmtDateD(d.cohort.start_date)}` : `week ${d.week}`}${d.my_track ? ` · ${esc(tName(d.tracks, d.my_track))} only` : ""}`,
    `<div class="kpis">${[["Students", S.length], ["Accounts set up", `${set}/${S.length}`], ["Waiting for grading", S.reduce((t, s) => t + (ls[s.id]?.to_grade || 0), 0)], ["Average attendance", att.length ? Math.round((att.reduce((a, b) => a + b, 0) / att.length) * 100) + "%" : "–"]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    ${canInvite && S.length > set ? `<div class="notice" style="margin-top:1rem"><span>${S.length - set} student${S.length - set === 1 ? " hasn't" : "s haven't"} set up their portal account yet.</span><button class="btn sm" data-act="invite">Email them a set-up link</button></div>` : ""}
    <div class="card" style="margin-top:1rem">${S.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Student</th><th>Track</th><th>Portal</th><th>Progress</th><th>Attendance</th><th>Fees</th><th>Certificate</th></tr></thead><tbody>
      ${S.map((s) => `<tr><td data-label="Student"><b>${esc(s.first_name)} ${esc(s.surname)}</b><span class="note" style="display:block"><span class="mono">${esc(s.matric)}</span> · ${esc(s.phone)}</span></td><td data-label="Track">${esc(s.track || "")}</td>
        <td data-label="Portal">${s.account ? `<span class="pill ok">Set up</span>` : `<span class="pill">${s.invited_at ? `Invited ${fmtDay(s.invited_at)}` : "Not yet"}</span>`}</td>
        <td data-label="Progress" class="mono">${ls[s.id] ? `${ls[s.id].done}/${ls[s.id].total}${ls[s.id].avg != null ? ` · avg ${ls[s.id].avg}%` : ""}${ls[s.id].to_grade ? ` <span class="note">(${ls[s.id].to_grade} to grade)</span>` : ""}` : "–"}</td>
        <td data-label="Attendance" class="mono">${s.sessions_past ? `${s.sessions_attended}/${s.sessions_past}` : "–"}</td><td data-label="Fees">${s.balance ? `<span class="pill bad">Owes ${naira(s.balance)}</span>` : `<span class="pill ok">Paid</span>`}</td>
        <td data-label="Certificate">${certs[s.id] ? `<a class="link sm" href="#/certificate/${esc(certs[s.id].cert_id)}" target="_blank" rel="noopener">View</a>${canCert ? ` · <button class="link sm" data-act="cert-revoke" data-k="${s.id}">Withdraw</button>` : ""}` : canCert ? `<button class="btn sm" data-act="cert-issue" data-k="${s.id}">Issue</button>` : `<span class="note">Not yet</span>`}</td></tr>`).join("")}</tbody></table></div>` : empty("No admitted students yet.")}</div>`);
}

async function tabContent() {
  const d = await rpc("acad_content");
  const canEdit = ["cohort_manager", "facilitator", "academy_admin", "super"].includes(ME.role);
  if (!ui.week) ui.week = Math.min(Math.max(d.week, 1), d.weeks);
  const wk = ui.week, L = d.lessons.filter((l) => l.week === wk), T = d.tasks.filter((t) => t.week === wk);
  const mine = (x) => !d.my_track || x.track_code === d.my_track;
  const e = ui.edit || {};
  const defDue = watParts(new Date(new Date(d.cohort.start_date + "T12:00:00Z").getTime() + ((wk - 1) * 7 + 6) * 864e5));
  shell("content", "Content", "Add each week's lessons, links and tasks. Students see a week from the Saturday before it starts.",
    `<div class="chips-row wk-chips">${[...Array(d.weeks)].map((_, i) => { const n = i + 1, c = d.lessons.filter((l) => l.week === n).length + d.tasks.filter((t) => t.week === n).length; return `<button class="chip-w ${n === wk ? "on" : ""}" data-act="week" data-k="${n}" aria-pressed="${n === wk}">W${n}${c ? `<small>${c}</small>` : ""}</button>`; }).join("")}</div>
    <div class="grid2" style="margin-top:1rem"><div class="stack"><div class="card"><div class="ch"><div><h3>Week ${wk}: ${esc(stageOf(wk))}</h3><span class="note">${d.week === wk ? "This week" : wk < d.week ? "Already open" : `Opens ${fmtDay(new Date(new Date(d.cohort.start_date + "T12:00:00Z").getTime() + ((wk - 1) * 7 - 2) * 864e5))}`}</span></div></div>
      ${L.length ? `<ul class="lessons">${L.map((l) => `<li class="lesson ${l.published ? "" : "hid"}"><span class="lk">${KIND_I[l.kind]}</span><div><b>${esc(l.title)}</b><span class="note"> · ${tName(d.tracks, l.track_code)}${l.published ? "" : " · hidden"}</span>${l.url ? `<span class="note" style="display:block;overflow-wrap:anywhere">${esc(l.url)}</span>` : ""}</div>${canEdit && mine(l) ? `<span class="actions"><button class="link sm" data-act="edit-lesson" data-k="${l.id}">Edit</button><button class="link sm danger" data-act="del-lesson" data-k="${l.id}">Delete</button></span>` : ""}</li>`).join("")}</ul>` : empty("No lessons for this week yet.")}</div>
      <div class="card"><h3>Tasks</h3>${T.length ? `<ul class="lessons">${T.map((t) => `<li class="lesson ${t.published ? "" : "hid"}"><span class="lk">📝</span><div><b>${esc(t.title)}</b><span class="note" style="display:block">${tName(d.tracks, t.track_code)} · due ${fmtAt(t.due_at)} · ${t.submitted} submitted${t.waiting ? `, ${t.waiting} to mark` : ""}${t.published ? "" : " · hidden"}</span></div>${canEdit && mine(t) ? `<span class="actions"><button class="link sm" data-act="edit-task" data-k="${t.id}">Edit</button><button class="link sm danger" data-act="del-task" data-k="${t.id}">Delete</button></span>` : ""}</li>`).join("")}</ul>` : empty("No tasks for this week.")}</div></div>
    ${canEdit ? `<div class="stack"><form class="card form" id="lesson-form" data-id="${e.type === "lesson" ? e.id : ""}" novalidate><h3>${e.type === "lesson" ? "Edit item" : "Add a lesson or link"}</h3>
        <div class="grid2"><div class="field"><label for="le-kind">Type</label><select id="le-kind">${Object.entries(KIND_L).map(([k, l]) => `<option value="${k}" ${e.type === "lesson" && e.kind === k ? "selected" : ""}>${KIND_I[k]} ${l}</option>`).join("")}</select></div>
        <div class="field"><label for="le-track">For</label><select id="le-track">${trackOpts(d.tracks, d.my_track, e.type === "lesson" ? e.track_code : null)}</select></div></div>
        <div class="field"><label for="le-title">Title</label><input id="le-title" placeholder="e.g. Welcome video" value="${e.type === "lesson" ? esc(e.title) : ""}"></div>
        <div class="field"><label for="le-url">Link (YouTube, Google Drive, …)</label><input id="le-url" type="url" placeholder="https://" value="${e.type === "lesson" ? esc(e.url || "") : ""}"></div>
        <div class="field"><label for="le-body">Notes for students (optional)</label><textarea id="le-body" placeholder="e.g. Watch this before the live class" rows="3">${e.type === "lesson" ? esc(e.body || "") : ""}</textarea></div>
        <label class="consent"><input type="checkbox" id="le-pub" ${e.type === "lesson" && !e.published ? "" : "checked"}> Visible to students</label>
        <div class="actions"><button class="btn sm" type="submit">${e.type === "lesson" ? "Save changes" : `Add to week ${wk}`}</button>${e.type === "lesson" ? `<button class="btn sm ghost" type="button" data-act="cancel-edit">Cancel</button>` : ""}</div></form>
      <form class="card form" id="task-form" data-id="${e.type === "task" ? e.id : ""}" novalidate><h3>${e.type === "task" ? "Edit task" : "Add a task"}</h3>
        <div class="field"><label for="tk-title">Title</label><input id="tk-title" placeholder="e.g. Introduce yourself" value="${e.type === "task" ? esc(e.title) : ""}"></div>
        <div class="field"><label for="tk-brief">What should they do and hand in?</label><textarea id="tk-brief" placeholder="What they should do and hand in" rows="3">${e.type === "task" ? esc(e.brief || "") : ""}</textarea></div>
        <div class="field"><label for="tk-url">Materials link (optional)</label><input id="tk-url" type="url" placeholder="https://" value="${e.type === "task" ? esc(e.url || "") : ""}"></div>
        <div class="grid2"><div class="field"><label for="tk-date">Due date</label><input id="tk-date" type="date" value="${e.type === "task" ? watParts(e.due_at).date : defDue.date}"></div><div class="field"><label for="tk-time">Time (WAT)</label><input id="tk-time" type="time" value="${e.type === "task" ? watParts(e.due_at).time : "23:59"}"></div></div>
        <div class="field"><label for="tk-track">For</label><select id="tk-track">${trackOpts(d.tracks, d.my_track, e.type === "task" ? e.track_code : null)}</select></div>
        <label class="consent"><input type="checkbox" id="tk-pub" ${e.type === "task" && !e.published ? "" : "checked"}> Visible to students</label>
        <div class="actions"><button class="btn sm" type="submit">${e.type === "task" ? "Save task" : `Add task to week ${wk}`}</button>${e.type === "task" ? `<button class="btn sm ghost" type="button" data-act="cancel-edit">Cancel</button>` : ""}</div></form></div>` : ""}</div>`);
  ui.content = d;
}

async function tabGrading() {
  const [d, M] = await Promise.all([rpc("acad_learn_queue"), rpc("acad_messages").catch(() => [])]); ui.lq = d; ui.msgs = M;
  const wait = d.work.filter((x) => x.status === "submitted"), done = d.work.filter((x) => x.status !== "submitted");
  const canGrade = ["cohort_manager", "facilitator", "director", "super"].includes(ME.role);
  const row = (x) => { const i = d.work.indexOf(x), late = x.cap != null && x.cap < 1;
    return `<details class="arow noav" data-id="lg${i}" ${ui.open === "lg" + i ? "open" : ""}><summary><span class="an"><b>${esc(x.name)}</b><span class="note">${esc(x.matric)} · ${esc(x.track)} · Week ${x.week}: ${esc(x.title)}</span></span>
      <span class="anext">${x.status === "submitted" ? `Sent ${ago(x.at)}${late ? ` · late, max ${x.cap * 100}%` : ""}` : x.status === "graded" ? `${x.score}%${x.graded_by ? " · " + esc(x.graded_by) : ""}` : "Waiting for resubmission"}</span>
      ${x.status === "submitted" ? `<span class="pill now">To grade</span>` : x.status === "graded" ? `<span class="pill ok">Graded</span>` : `<span class="pill bad">Revise</span>`}</summary>
    <div class="abody"><p><a class="btn sm ghost" href="${esc(x.link)}" target="_blank" rel="noopener">Open their work ↗</a></p>${x.feedback && x.status !== "submitted" ? `<p class="note"><b>Feedback:</b> ${lines(x.feedback)}</p>` : ""}
      ${canGrade && x.status === "submitted" ? `<form class="form lgrade-form" data-i="${i}" novalidate><div class="rate"><label><input type="radio" name="lg-${i}" value="graded" checked><span>Grade it</span></label><label><input type="radio" name="lg-${i}" value="revise"><span>Ask for changes</span></label></div>
        <div class="grid2"><div class="field"><label for="lgg-${i}">Grade out of 100</label><input id="lgg-${i}" placeholder="0 to 100" type="number" min="0" max="100" inputmode="numeric">${late ? `<span class="note">Late: their score is capped at ${x.cap * 100}% of this.</span>` : ""}</div></div>
        <div class="field"><label for="lgf-${i}">Feedback (required when asking for changes)</label><textarea id="lgf-${i}" placeholder="What was good, and what to improve" rows="2"></textarea></div>
        <p class="note">Rubric: meets the brief 30 · quality & accuracy 30 · clarity & presentation 20 · timeliness 20. Students need ${70}% averaged with the week's quiz to move on.</p>
        <div class="actions"><button class="btn sm" type="submit">Send result</button></div></form>` : ""}</div></details>`; };
  const steps = d.staff_steps, open = steps.filter((x) => !x.done);
  shell("grading", "Grading", "Week projects students have submitted. Students get an email with your grade and feedback.",
    `<div class="card"><div class="ch"><h3>To grade</h3><span class="note">${wait.length}</span></div>${wait.length ? `<div class="arows">${wait.map(row).join("")}</div>` : empty("Nothing waiting. 🎉")}</div>
    <div class="card" style="margin-top:1rem"><div class="ch"><h3>Project messages</h3><span class="note">${M.filter((m) => m.waiting).length} waiting for a reply</span></div>
      ${M.length ? `<div class="arows">${M.map((m, i) => `<details class="arow noav" data-id="mg${i}" ${ui.open === "mg" + i ? "open" : ""}><summary><span class="an"><b>${esc(m.name)}</b><span class="note">${esc(m.matric)} · ${esc(m.track)} · ${ago(m.last_at)}</span></span>${m.waiting ? `<span class="pill now">Reply</span>` : `<span class="pill ok">Answered</span>`}</summary>
        <div class="abody"><ul class="thread">${m.messages.map((x) => `<li class="${x.staff ? "me" : ""}"><span>${esc(x.body)}</span><small>${x.staff ? esc(x.by || "Staff") : esc(m.name)} · ${fmtAt(x.at)}</small></li>`).join("")}</ul>
        <div class="field"><label for="mr-${i}">Your reply</label><textarea id="mr-${i}" placeholder="Write your reply" rows="2"></textarea></div><div><button class="btn sm" data-act="msg-reply" data-k="${i}">Send reply</button></div></div></details>`).join("")}</div>` : empty("No messages yet.")}</div>
    <div class="card" style="margin-top:1rem"><div class="ch"><h3>Supervisor steps</h3><span class="note">${open.length} open</span></div><p class="note">Internship steps staff complete for each student. Tick them when done.</p>
      ${steps.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Student</th><th>Week</th><th>Step</th><th></th></tr></thead><tbody>${steps.map((x) => `<tr><td data-label="Student"><b>${esc(x.name)}</b><span class="note" style="display:block">${esc(x.matric)}</span></td><td data-label="Week" class="mono">W${x.week}</td><td data-label="Step">${esc(x.title)}</td>
        <td>${canGrade ? `<label class="consent" style="margin:0"><input type="checkbox" data-change="lmark" data-app="${x.app}" data-key="${esc(x.key)}" ${x.done ? "checked" : ""}> Done</label>` : x.done ? `<span class="pill ok">Done</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : empty("No admitted students yet.")}</div>
    <div class="card" style="margin-top:1rem"><h3>Graded and sent back</h3>${done.length ? `<div class="arows">${done.map(row).join("")}</div>` : empty("Nothing yet.")}</div>`);
}

async function tabSessions() {
  const d = await rpc("acad_sessions");
  const canEdit = ["cohort_manager", "facilitator", "academy_admin", "super"].includes(ME.role);
  const canMark = ["cohort_manager", "facilitator", "super"].includes(ME.role);
  const now = Date.now(), up = d.sessions.filter((x) => new Date(x.starts_at).getTime() + x.minutes * 6e4 > now), past = d.sessions.filter((x) => !up.includes(x)).reverse();
  const e = ui.edit?.type === "session" ? ui.edit : null;
  const row = (x) => `<details class="arow noav" data-id="s${x.id}" ${ui.open === "s" + x.id ? "open" : ""} data-act-toggle="att" data-k="${x.id}"><summary><span class="an"><b>${esc(x.title)}</b><span class="note">${fmtAt(x.starts_at)} WAT · ${x.minutes} min · ${esc(x.track || "All tracks")}${x.host ? ` · ${esc(x.host)}` : ""}</span></span><span class="anext">${x.joined} joined${x.marked ? ` · ${x.marked} marked` : ""}</span>${x.link ? "" : `<span class="pill bad">No link</span>`}</summary>
    <div class="abody">${x.link ? `<p><a class="link" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.link)}</a></p>` : ""}${canEdit && (!d.my_track || x.track_code === d.my_track) ? `<div class="actions"><button class="link sm" data-act="edit-session" data-k="${x.id}">Edit</button><button class="link sm danger" data-act="del-session" data-k="${x.id}">Delete</button></div>` : ""}
      <div class="att-body" data-k="${x.id}" data-mark="${canMark ? 1 : ""}"><p class="note">Open to load attendance…</p></div></div></details>`;
  const dv = e ? watParts(e.starts_at) : { date: "", time: "10:00" };
  shell("sessions", "Live sessions", "Students join from their portal, which records who joined. Confirm attendance after each session.",
    `<div class="grid2"><div class="stack"><div class="card"><h3>Coming up</h3>${up.length ? `<div class="arows">${up.map(row).join("")}</div>` : empty("Nothing scheduled.")}</div>
      <div class="card"><h3>Past</h3>${past.length ? `<div class="arows">${past.map(row).join("")}</div>` : empty("No past sessions.")}</div></div>
    ${canEdit ? `<form class="card form" id="session-form" data-id="${e ? e.id : ""}" novalidate><h3>${e ? "Edit session" : "Schedule a session"}</h3>
      <div class="field"><label for="se-title">Title</label><input id="se-title" placeholder="e.g. Week 3 live class" value="${e ? esc(e.title) : ""}"></div>
      <div class="grid2"><div class="field"><label for="se-kind">Type</label><select id="se-kind">${[["class", "Class"], ["clinic", "Clinic / office hours"], ["orientation", "Orientation"], ["other", "Other"]].map(([k, l]) => `<option value="${k}" ${e?.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="se-track">For</label><select id="se-track">${trackOpts(d.tracks, d.my_track, e?.track_code)}</select></div></div>
      <div class="grid2"><div class="field"><label for="se-date">Date</label><input id="se-date" type="date" value="${dv.date}"></div><div class="field"><label for="se-time">Start (WAT)</label><input id="se-time" type="time" value="${dv.time}"></div></div>
      <div class="grid2"><div class="field"><label for="se-min">Minutes</label><input id="se-min" type="number" min="10" max="480" value="${e ? e.minutes : 60}"></div><div class="field"><label for="se-host">Host</label><input id="se-host" placeholder="e.g. Tolu Bello" value="${e ? esc(e.host || "") : esc(ME.name)}"></div></div>
      <div class="field"><label for="se-link">Meeting link (Google Meet, Zoom…)</label><input id="se-link" type="url" placeholder="https://" value="${e ? esc(e.link || "") : ""}"></div>
      <div class="actions"><button class="btn sm" type="submit">${e ? "Save changes" : "Add session"}</button>${e ? `<button class="btn sm ghost" type="button" data-act="cancel-edit">Cancel</button>` : ""}</div></form>` : ""}</div>`);
  ui.sessions = d;
}

async function loadAttendance(box) {
  const k = box.dataset.k;
  try {
    const d = await rpc("acad_attendance", { p_session: +k });
    const ST = [["present", "Present"], ["late", "Late"], ["absent", "Absent"], ["excused", "Excused"]];
    box.innerHTML = d.students.length ? `<form class="form att-form" data-k="${k}"><ul class="att-list">${d.students.map((s) => { const v = s.status || (s.joined_at ? "present" : "absent"); return `<li><span><b>${esc(s.name)}</b><span class="note" style="display:block">${esc(s.matric)}${s.joined_at ? ` · joined ${fmtTime(s.joined_at)}` : ""}</span></span>${box.dataset.mark ? `<select data-sid="${s.id}" aria-label="Attendance for ${esc(s.name)}">${ST.map(([a, l]) => `<option value="${a}" ${a === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : `<span class="pill">${s.status || (s.joined_at ? "joined" : "–")}</span>`}</li>`; }).join("")}</ul>
      ${box.dataset.mark ? `<div class="actions"><button class="btn sm" type="submit">Save attendance</button><span class="note">Pre-filled from who joined through the portal.</span></div>` : ""}</form>` : empty("No students in this session's track.");
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

async function tabNews() {
  const d = await rpc("acad_news");
  const canPost = ["director", "cohort_manager", "facilitator", "academy_admin", "super"].includes(ME.role);
  shell("news", "Announcements", "Shown on every student's portal, and emailed if you choose.",
    `<div class="grid2">${canPost ? `<form class="card form" id="news-form" novalidate><h3>New announcement</h3>
      <div class="field"><label for="nw-title">Title</label><input id="nw-title" placeholder="e.g. Live class moved to Thursday"></div>
      <div class="field"><label for="nw-body">Message</label><textarea id="nw-body" placeholder="Your message to students" rows="5"></textarea></div>
      <div class="field"><label for="nw-track">Send to</label><select id="nw-track">${trackOpts(d.tracks, d.my_track, null)}</select></div>
      <label class="consent"><input type="checkbox" id="nw-email" checked> Also email it to them</label>
      <p class="err" id="nw-err" role="alert"></p><div><button class="btn" type="submit">Post</button></div></form>` : ""}
    <div class="stack">${d.news.length ? d.news.map((n) => `<article class="card"><span class="eyebrow">${fmtAt(n.created_at)} · ${esc(n.by || "")} · ${esc(n.track || "All tracks")}${n.emailed ? " · emailed" : ""}</span><h3 style="margin:.4rem 0">${esc(n.title)}</h3><p>${lines(n.body)}</p></article>`).join("") : `<div class="card">${empty("No announcements yet.")}</div>`}</div></div>`);
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
  if (ui.lsMore && LS && !e.target.closest(".morepanel,#more")) { ui.lsMore = false; lsRender(); }
  if (ui.lsBell && LS && !e.target.closest(".bellpanel,.bell")) { ui.lsBell = false; LS.N.unread = 0; lsRender(); }
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const a = t.dataset.act, k = t.dataset.k;
  if (a === "eye") { const i = t.parentNode.querySelector("input"); const show = i.type === "password"; i.type = show ? "text" : "password"; t.innerHTML = show ? EYE_OFF : EYE; t.setAttribute("aria-label", show ? "Hide password" : "Show password"); return; }
  if (a === "print") { window.print(); return; }
  if (a === "install") { if (INSTALL_EVT) { INSTALL_EVT.prompt(); const r = await INSTALL_EVT.userChoice.catch(() => null); INSTALL_EVT = null; if (r?.outcome === "accepted") $("#inst-card")?.remove(); } return; }
  if (a === "install-off") { try { localStorage.setItem("jn.install.off", "1"); } catch { /* ignore */ } $("#inst-card")?.remove(); return; }
  if (a === "cert-pdf") { try { await downloadCertPdf(t); } catch (x) { toast("Couldn't make the PDF. Please try again."); } return; }
  if (a === "cert-copy") { const u = CERT_NOW ? certUrl(CERT_NOW) : location.href; try { await navigator.clipboard.writeText(u); } catch { const ta = document.createElement("textarea"); ta.value = u; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); } toast("Verification link copied"); return; }
  if (a === "cert-issue" || a === "cert-revoke") {
    const issue = a === "cert-issue";
    if (!confirm(issue ? "Issue a certificate to this student? They'll get an email with it." : "Withdraw this certificate? Its code will stop verifying.")) return;
    try { await busy(t, () => rpc(issue ? "acad_issue_certificate" : "acad_revoke_certificate", { p_app: k })); toast(issue ? "Certificate issued" : "Certificate withdrawn"); route(); } catch (x) { toast(x.message); }
    return;
  }
  if (a === "jump") { e.preventDefault(); const el = document.getElementById(k); if (el?.tagName === "DETAILS") el.open = true; el?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (a === "signout") { await auth.signOut(); ME = null; return go("#/staff"); }
  if (a === "copy-link") { const v = $("#my-ref")?.textContent || ""; try { await navigator.clipboard.writeText(v); } catch { const t = document.createElement("textarea"); t.value = v; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); } return toast("Application number copied"); }
  if (a === "pick-day") { ui.pick = { day: k, slot: null }; return route(); }
  if (a === "pick-slot") { ui.pick.slot = +k; return route(); }
  if (a === "book") {
    try { await busy(t, () => rpc("book_call", { p_ref: t.dataset.ref, p_token: t.dataset.token, p_slot: +k })); toast("Call booked. Check your email."); ui.pick = null; go(`#/a/${t.dataset.ref}/${t.dataset.token}`); }
    catch { ui.pick = null; route(); }
    return;
  }
  if (a === "group") { ui.admG = k; ui.q = ""; const q = $("#adm-q"); if (q) q.value = ""; $$(".gtile").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k)); applyFilter(); return; }
  if (a === "decide") {
    const labels = { offer: "Offer sent", waitlist: "Waitlisted", reject: "Marked not selected", defer: "Deferred to the next batch" };
    try { const r = await busy(t, () => rpc("admin_decide", { p_id: k, p_decision: t.dataset.x, p_note: null })); toast(r.status === "Waitlisted" && t.dataset.x === "offer" ? "That track is full, so they're on the waitlist." : labels[t.dataset.x]); ui.open = null; route(); } catch { /* shown */ }
    return;
  }
  if (a === "approve-all") {
    const { apps } = await loadAdm();
    const L = apps.filter((x) => x.status === "Under review" && x.rec);
    await busy(t, async () => { for (const x of L) await rpc("admin_decide", { p_id: x.id, p_decision: REC_X[x.rec.d], p_note: null }); });
    toast(`${L.length} decisions sent`); return route();
  }
  if (a === "rm-slot") { try { await busy(t, () => rpc("officer_remove_slot", { p_id: +k })); toast("Time removed"); route(); } catch { /* shown */ } return; }
  if (a === "copy-mail") { const txt = $("#mail-" + k).textContent; try { await navigator.clipboard.writeText(txt); toast("Email copied"); } catch { toast("Select the text and copy it"); } return; }
  if (a === "retry-mail") { await busy(t, () => rpc("admin_retry_email", { p_id: +k })); toast("Will try again within a minute"); return route(); }
  if (a === "mark-sent") { await busy(t, () => rpc("admin_mark_sent", { p_id: +k })); toast("Marked as sent"); return route(); }
  if (a === "pay") { try { await startPay(t); } catch { /* shown */ } return; }
  if (a === "start-assess") { t.disabled = true; t.textContent = "Starting…"; const base = `#/a/${t.dataset.ref}/${t.dataset.token}`; return pageAssess({ ref: t.dataset.ref }, t.dataset.token, base); }
  if (a === "host-sign" || a === "host-revise") {
    const w = t.dataset.w, ok = a === "host-sign", c = $("#hc-" + w).value.trim();
    if (ok && !$("#hok-" + w).checked) return toast("Tick the box to confirm the entry is accurate");
    if (!ok && !c) { $("#hc-" + w).focus(); return toast("Write what they should change in the comment box"); }
    try { const d = await busy(t, () => rpc("host_sign", { p_token: HOST.token, p_key: k, p_ok: ok, p_comment: c })); if (d) { HOST.d = d; toast(ok ? `Week ${w} signed. Thank you!` : "Sent back with your comment"); pageHost(HOST.token, true); } } catch { /* shown */ }
    return;
  }
  if (a === "host-eval") {
    const r = EVAL_CRIT.map((_, i) => +($(`input[name="ev-${i}"]:checked`)?.value || 0));
    if (r.some((x) => !x)) { $("#ev-err").textContent = "Rate each area from 1 to 5."; return; }
    try { const d = await busy(t, () => rpc("host_eval", { p_token: HOST.token, p_ratings: r, p_comment: $("#ev-c").value })); if (d) { HOST.d = d; toast("Evaluation submitted. Thank you!"); pageHost(HOST.token, true); } } catch { /* shown */ }
    return;
  }
  if (a === "copy-host") { try { await navigator.clipboard.writeText(k); } catch { const ta = document.createElement("textarea"); ta.value = k; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); } return toast("Link copied"); }
  if (a === "pod-del") { if (!confirm("Delete this pod? Its members go back to 'Not in a pod yet'.")) return; try { await busy(t, () => rpc("acad_pod_delete", { p_id: +k })); toast("Pod deleted"); route(); } catch { /* shown */ } return; }
  if (a === "dc2-rm") { try { await busy(t, () => rpc("coach_remove_slot", { p_id: +k })); toast("Time removed"); route(); } catch { /* shown */ } return; }
  if (a === "msg-reply") { const tx = $("#mr-" + k).value.trim(); if (!tx) return toast("Write a reply first"); try { await busy(t, () => rpc("acad_message_reply", { p_app: ui.msgs[+k].app, p_body: tx })); toast("Reply sent"); route(); } catch { /* shown */ } return; }
  if (a === "grad-close" || a === "grad-go") { $("#grad-modal")?.remove(); if (a === "grad-go") go("#/learn/graduate"); return; }
  if (a === "ls-qstart") {
    let d; try { d = await busy(t, () => rpc("learn_quiz_start", { p_key: k })); } catch { return; }
    if (!d) return;
    ui.quiz = { key: k, d, ans: d.qs.map(() => null), deadline: Date.parse(d.deadline), skew: Date.parse(d.now) - Date.now() };
    await lsRender(); clearInterval(QTIMER); QTIMER = setInterval(quizTick, 1000); quizTick(); return;
  }
  if (a === "ls-retry") { if (!confirm("Redo this week's lessons? They'll be marked not done until you complete them again. Then your retake opens.")) return; const wk = findItem(k)?.wi; if (await lsCall("learn_quiz_retry", { p_key: k }, t, "Lessons reopened. Go through them, then retake.")) go(`#/learn/learning/${(wk ?? 0) + 1}`); return; }
  if (a === "dc-day") { ui.dcDay = k; ui.dcSlot = null; return lsRender(); }
  if (a === "dc-slot") { ui.dcSlot = +k; return lsRender(); }
  if (a === "dc-book") { try { const X = await busy(t, () => rpc("dc2_book", { p_slot: +k, p_note: $("#bk-note")?.value || "" })); if (X) { LS.X = X; LS.L = await rpc("learn_state"); toast("Booked. Check your email for the link."); lsRender(); } } catch { LS.slots = await rpc("dc2_slots").catch(() => []); ui.dcSlot = null; lsRender(); } return; }
  if (a === "dc2-cancel") { if (!confirm("Cancel this booking? Your time will be released for other students.")) return; try { const X = await busy(t, () => rpc("dc2_cancel")); if (X) { LS.X = X; LS.L = await rpc("learn_state"); LS.slots = await rpc("dc2_slots").catch(() => []); toast("Booking cancelled. Pick a new time."); lsRender(); } } catch { /* shown */ } return; }
  if (a === "cv-print") { document.body.classList.add("print-cv"); window.print(); setTimeout(() => document.body.classList.remove("print-cv"), 500); return; }
  if (a === "ls-bell") { ui.lsBell = !ui.lsBell; ui.lsMore = false; if (ui.lsBell && LS.N.unread) { rpc("notices_read").then((n) => { if (n && n.items) LS.N = n; }).catch(() => {}); } await lsRender(); if (ui.lsBell) { LS.N.unread = 0; } return; }
  if (a === "ls-bell-go") { ui.lsBell = false; return; }
  if (a === "dp-reply") { ui.dpReply = ui.dpReply === +k ? null : +k; const f = $(`.dp-form[data-parent="${k}"]`); if (f) { f.hidden = ui.dpReply !== +k; if (!f.hidden) f.querySelector("textarea").focus(); } return; }
  if (a === "dp-del") { if (!confirm("Delete your post?")) return; try { await busy(t, () => rpc("disc_delete_mine", { p_id: +k })); lsRender(); } catch { /* shown */ } return; }
  if (a === "dp-hide" || a === "dp-pin") { try { await busy(t, () => rpc("acad_disc_moderate", { p_id: +k, p_hidden: a === "dp-hide" ? t.dataset.v === "1" : null, p_pinned: a === "dp-pin" ? t.dataset.v === "1" : null })); route(); } catch { /* shown */ } return; }
  if (a === "disc-ch") { ui.discCh = k; return route(); }
  if (a === "opp-f") { ui.oppF = k; return lsRender(); }
  if (a === "opp-save") { const o = draft("opps", {}), sv = { ...(o.saved || {}) }; if (sv[k]) delete sv[k]; else sv[k] = 1; saveDraft("opps", { ...o, saved: sv }, true); return lsRender(); }
  if (a === "pf-photo-rm") { try { await busy(t, () => rpc("profile_photo", { p_data: null })); LS.photo = null; toast("Photo removed"); lsRender(); } catch { /* shown */ } return; }
  if (a === "opp-edit") { ui.oppEdit = k === "new" ? "new" : +k; return route(); }
  if (a === "ls-more") { ui.lsMore = !ui.lsMore; return lsRender(); }
  if (a === "ls-wtab") { ui.wtab = k; return lsRender(); }
  if (a === "ls-asf") { ui.asf = k; return lsRender(); }
  if (a === "ls-done") { await lsCall("learn_done", { p_key: k, p_done: t.dataset.v === "1", p_data: null }, t, t.dataset.v === "1" ? "Marked complete" : null); return; }
  if (a === "ls-unsubmit") { await lsCall("learn_unsubmit", { p_key: k }, t, "Submission removed"); return; }
  if (a === "ls-repeat") { if (!confirm(`Start Week ${k} again? Your work for this week resets.`)) return; ui.wtab = "tasks"; await lsCall("learn_repeat", { p_week: +k }, t, `Week ${k} reset. You've got this.`); return; }
  if (a === "oath-sign") {
    const me = LS.C.me, name = `${me.first_name} ${me.surname || ""}`.trim(), sig = $("#oath-sig").value.trim(), err = $("#oath-err");
    if ($$(".pl").some((x) => !x.checked)) { err.textContent = "Tick every pledge first."; return; }
    if (sig.toLowerCase().replace(/\s+/g, " ") !== name.toLowerCase().replace(/\s+/g, " ")) { err.textContent = `Sign with your full name: ${name}.`; return; }
    const key = LS.W[0].items.find((x) => x.type === "oath").key;
    if (await lsCall("learn_done", { p_key: key, p_done: true, p_data: { sig } }, t, "Oath signed. Week 2 is on its way.")) window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (a === "signout-learn") { $("#grad-modal")?.remove(); TOUR_I = null; renderTour(); await auth.signOut(); CAMPUS = null; LS = null; return go("#/learn/signin"); }
  if (a === "tour") { $$("details.snav-m").forEach((d) => (d.open = false)); return startTour(); }
  if (a === "tour-next") { TOUR_I++; return renderTour(); }
  if (a === "tour-back") { TOUR_I--; return renderTour(); }
  if (a === "tour-end") return endTour();
  if (a === "join") {
    const w = window.open("", "_blank");
    try { const link = await rpc("student_join", { p_session: +k }); if (w) w.location = link; else location.href = link; } catch (err) { if (w) w.close(); toast(err.message); }
    return;
  }
  if (a === "invite") { try { const n = await busy(t, () => rpc("acad_invite")); toast(n ? `Set-up links sent to ${n} student${n === 1 ? "" : "s"}` : "Everyone was invited in the last 2 days"); route(); } catch { /* shown */ } return; }
  if (a === "week") { ui.week = +k; ui.edit = null; return route(); }
  if (a === "cancel-edit") { ui.edit = null; return route(); }
  if (a === "edit-lesson") { ui.edit = { type: "lesson", ...ui.content.lessons.find((x) => x.id === +k) }; route(); return; }
  if (a === "edit-task") { ui.edit = { type: "task", ...ui.content.tasks.find((x) => x.id === +k) }; route(); return; }
  if (a === "edit-session") { ui.edit = { type: "session", ...ui.sessions.sessions.find((x) => x.id === +k) }; route(); return; }
  if (a === "del-lesson" || a === "del-task" || a === "del-session") {
    if (!confirm("Delete this? Students will no longer see it.")) return;
    const fn = { "del-lesson": "acad_delete_lesson", "del-task": "acad_delete_task", "del-session": "acad_delete_session" }[a];
    try { await busy(t, () => rpc(fn, { p_id: +k })); toast("Deleted"); ui.edit = null; route(); } catch { /* shown */ }
    return;
  }
  if (a === "print") return window.print();
  if (a === "decline-offer") {
    if (!confirm("Decline your place? Your seat will go to someone on the waitlist, and this can't be undone.")) return;
    try { await busy(t, () => rpc("applicant_decline", { p_ref: t.dataset.ref, p_token: t.dataset.token })); toast("Offer declined"); route(); } catch { /* shown */ }
    return;
  }
  if (a === "extend") { try { await busy(t, () => rpc("admin_extend_offer", { p_id: k, p_days: +t.dataset.days })); toast(`Offer extended by ${t.dataset.days} days. We've emailed them.`); ui.open = k; route(); } catch { /* shown */ } return; }
  if (a === "edit-staff") { $("#sf-email").value = t.dataset.email; $("#sf-name").value = t.dataset.name; $("#sf-role").value = t.dataset.role; $("#sf-active").checked = t.dataset.active === "true"; $("#sf-track").value = t.dataset.track || ""; $("#sf-name").focus(); return; }
});

document.addEventListener("toggle", async (e) => {
  const d = e.target;
  if (d.matches?.("details.arow[data-id]") && d.open) ui.open = d.dataset.id;
  if (d.matches?.('details[data-act-toggle="att"]') && d.open) { const box = $(".att-body", d); if (box && !box.dataset.loaded) { box.dataset.loaded = 1; loadAttendance(box); } }
  if (d.matches?.("details.atl") && d.open) {
    const box = $(".tl-body", d);
    try {
      const x = await rpc("adm_application", { p_id: d.dataset.k });
      box.innerHTML = `<ul class="hist">${x.events.slice().reverse().map((l) => `<li><span class="mono note">${fmtAt(l.at)}</span><span>${esc(l.text)}${l.actor !== "Applicant" ? ` <span class="note">· ${esc(l.actor)}</span>` : ""}</span></li>`).join("")}</ul>
        ${x.emails.length ? `<p class="eyebrow" style="margin-top:.8rem">Emails</p><ul class="hist">${x.emails.map((m) => `<li><span class="mono note">${fmtAt(m.at)}</span><span>${esc(m.subject)} ${m.sent ? "" : `<span class="note">· waiting to send</span>`}</span></li>`).join("")}</ul>` : ""}`;
    } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }
}, true);

function applyFilter() {
  $$(".arows .arow[data-id]").forEach((r) => {
    const txt = r.querySelector("summary").textContent.toLowerCase();
    const g = r.dataset.g;
    r.hidden = ui.q ? !txt.includes(ui.q) : g !== ui.admG;
  });
  filterRows();
}
document.addEventListener("input", (e) => {
  if (e.target.dataset?.cv && LS) { const c = { ...cvData() }; $$("[data-cv]").forEach((x) => (c[x.dataset.cv] = x.value)); saveDraft("cv", c); const s0 = $("#cv-saved"); if (s0) s0.textContent = "Saving…";
    $("#cv-preview").innerHTML = cvPreview(c); const ch = atsChecks(c), sc = ch.filter((x) => x[1]).length; $("#ats-list").innerHTML = atsList(ch); const pl = $("#ats-pill"); pl.textContent = `ATS check ${sc}/5`; pl.className = `pill ${sc >= 4 ? "ok" : "now"}`; return; }
  if (e.target.dataset?.pitch && LS) { const pt = { ...draft("pitch", {}) }; $$("[data-pitch]").forEach((x) => (pt[x.dataset.pitch] = x.value)); saveDraft("pitch", pt);
    const w = [pt.a, pt.b, pt.c].join(" ").trim().split(/\s+/).filter(Boolean).length; $("#pitch-count").textContent = `${w} words · about ${Math.round(w / 2.3)} seconds spoken (aim for 120–150 words)`; return; }
  if (e.target.dataset?.cr && LS && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") { saveCareer(e.target); return; }
  if (e.target.id === "adm-q") { ui.q = e.target.value.trim().toLowerCase(); applyFilter(); }
});
document.addEventListener("change", (e) => {
  const el = e.target, k = el.dataset.k;
  if (el.dataset.actChange === "track") { const none = el.value === "NONE"; $("#wi-" + k).hidden = !none; $("#ri-" + k).hidden = none; }
  if (el.dataset.actChange === "interest") { $("#wo-" + k).hidden = el.value !== "Other"; }
  if (el.dataset.change === "pod-move") {
    const v = el.value; if (v === "") return; el.disabled = true;
    rpc("acad_pod_assign", { p_app: el.dataset.app, p_pod: v === "0" ? null : +v }).then(() => { toast(v === "0" ? "Removed from pod" : "Moved"); route(); }).catch((x) => { toast(x.message); el.disabled = false; });
    return;
  }
  if (el.dataset.change === "lmark") {
    el.disabled = true;
    rpc("acad_learn_mark", { p_app: el.dataset.app, p_key: el.dataset.key, p_done: el.checked }).then(() => toast(el.checked ? "Marked done" : "Marked not done"))
      .catch((x) => { el.checked = !el.checked; toast(x.message); }).finally(() => { el.disabled = false; });
    return;
  }
  if (ui.quiz && el.closest?.("#ls-quiz") && el.name?.startsWith("q")) { ui.quiz.ans[+el.name.slice(1)] = +el.value; quizTick(); return; }
  if (el.dataset.li && LS) { const d = { ...draft("li", {}), [el.dataset.li]: el.checked }; saveDraft("li", d); return; }
  if (el.dataset.prep && LS) { const d = { ...draft("prep", {}), [el.dataset.prep]: el.checked }; saveDraft("prep", d); return; }
  if (el.dataset.app != null && el.tagName === "SELECT" && LS) { const apps = draft("apps", []).map((a, i) => (i === +el.dataset.app ? { ...a, st: el.value } : a)); saveDraft("apps", apps, true); lsRender(); return; }
  if (el.id === "pf-photo-in") { photoPick(el.files[0]); el.value = ""; return; }
  if (el.dataset.cr && LS) { saveCareer(el); return; }
  if (el.dataset.ostat && LS) { const o = draft("opps", {}), st = { ...(o.st || {}) }; if (el.value) st[el.dataset.ostat] = el.value; else delete st[el.dataset.ostat]; saveDraft("opps", { ...o, st }, true); lsRender(); return; }
  if (el.id === "week-select") { ui.wtab = "tasks"; return go(el.value === "grad" ? "#/learn/graduate" : "#/learn/learning/" + el.value); }
  if (el.id === "g-state") fillTowns();
  if (el.id === "g-country") setCountry();
  if (el.id === "g-cc") { el.dataset.touched = "1"; ccShow(); }
  if ((el.id === "g-first" || el.id === "g-sur") && el.value.trim()) el.value = nameCase(el.value);
  if (el.id === "g-town") { const o = $("#g-town-o"); o.hidden = el.value !== "Other"; if (!o.hidden) o.focus(); }
  if (el.id === "st-unlock") {
    const on = el.checked; el.disabled = true;
    rpc("admin_test_unlock", { p_on: on }).then((r) => { el.checked = r; $("#st-unlock-msg").textContent = r ? "On: students can see every week right now." : ""; toast(r ? "All portal weeks are open for testing" : "Portal weeks are back to their dates"); })
      .catch((x) => { el.checked = !on; toast(x.message); }).finally(() => { el.disabled = false; });
  }
  if (el.name === "plan" && $("#pay-btn")) $("#pay-btn").textContent = `Accept and pay ${naira(+el.dataset.amount)}`;
});

document.addEventListener("submit", async (e) => {
  const f = e.target;
  e.preventDefault();
  if (f.id === "apply-form") return submitApply(f);
  if (f.id === "ready-form") { try { await submitAssess(f); } catch { /* shown */ } return; }
  if (f.id === "find-form") {
    const ref = $("#f-ref").value.trim(), sur = $("#f-sur").value.trim(), err = $("#f-err");
    if (!ref || !sur) { err.textContent = "Enter your application number and surname."; return; }
    let r;
    try { r = await busy(f.querySelector("button"), () => rpc("applicant_continue", { p_ref: ref, p_surname: sur })); }
    catch (x) { err.textContent = x.message; return; }
    if (!r || !r.ref) { err.textContent = "That application number and surname don't match. Check both and try again."; return; }
    saveMyApp(r.ref, r.token);
    return go(`#/a/${r.ref}/${r.token}`);
  }
  if (f.id === "signin-form") {
    const err = $("#s-err");
    try { await busy(f.querySelector("button"), () => auth.signIn($("#s-email").value.trim(), $("#s-pass").value)); go("#/portal"); }
    catch (x) { err.textContent = /invalid/i.test(x.message) ? "That email and password don't match." : /confirm/i.test(x.message) ? "Confirm your email first: open the link we sent you." : x.message; }
    return;
  }
  if (f.id === "signup-form") {
    const em = $("#u-email").value.trim(), p1 = $("#u-pass").value, p2 = $("#u-pass2").value, err = $("#u-err");
    if (!pwOk(p1, p2, err)) return;
    try {
      await busy(f.querySelector("button"), async () => {
        if (!(await rpc("staff_can_signup", { p_email: em }))) throw new Error("This email hasn't been added as staff yet. Ask the Super Admin to add you first.");
        await auth.signUp(em, p1);
      });
      if (auth.session) return go("#/portal");
      app.innerHTML = staffCard(`<h1>Check your email</h1><p>We've sent a confirmation link to <b>${esc(em)}</b>. Open it to finish setting up, then sign in.</p><div><a class="btn" href="#/staff">Go to sign in</a></div>`);
    } catch (x) { err.textContent = x.message; }
    return;
  }
  if (f.id === "reset-form") {
    const em = $("#r-email").value.trim();
    if (!em) { $("#r-err").textContent = "Enter your work email."; return; }
    try { await busy(f.querySelector("button"), () => auth.recover(em)); } catch { /* same message either way */ }
    app.innerHTML = staffCard(`<h1>Check your email</h1><p>If <b>${esc(em)}</b> has a staff account, a reset link is on its way.</p><div><a class="btn" href="#/staff">Back to sign in</a></div>`);
    return;
  }
  if (f.id === "newpw-form") {
    const p1 = $("#n-pass").value, p2 = $("#n-pass2").value, err = $("#n-err");
    if (!pwOk(p1, p2, err)) return;
    try { await busy(f.querySelector("button"), () => auth.setPassword(p1)); toast("Password saved"); go("#/portal"); } catch (x) { err.textContent = x.message; }
    return;
  }
  if (f.classList.contains("call-form")) {
    const k = f.dataset.k, tr = $("#dt-" + k).value;
    if (!tr) return toast("Choose the track you agreed on the call");
    let wanted = null, rec = null, why = null;
    if (tr === "NONE") { wanted = $("#wt-" + k).value; if (wanted === "Other") wanted = $("#wo-" + k).value.trim(); if (!wanted) return toast("Add what they're interested in"); }
    else { rec = $(`input[name="rec-${k}"]:checked`)?.value; why = $("#rw-" + k).value.trim(); if (!rec) return toast("Choose your recommendation"); if (!why) return toast("Add one line on why"); }
    try {
      await busy(f.querySelector("button"), () => rpc("officer_complete_call", { p_id: k, p_note: $("#dn-" + k).value.trim(), p_track: tr === "NONE" ? null : tr, p_wanted: wanted, p_rec: rec, p_why: why }));
      toast(tr === "NONE" ? "Closed kindly · interest recorded" : "Call completed · sent to the Admissions Admin"); ui.open = null; route();
    } catch { /* shown */ }
    return;
  }
  if (f.id === "times-form") {
    const days = $$('input[name="day"]:checked', f).map((x) => x.value), times = $$('input[name="time"]:checked', f).map((x) => x.value);
    if (!days.length || !times.length) { $("#t-err").textContent = "Pick at least one day and one time."; return; }
    const iso = days.flatMap((d) => times.map((t) => `${d}T${t}:00+01:00`));
    const n = await busy(f.querySelector("button"), () => rpc("officer_add_slots", { p_times: iso }));
    toast(`${n} time${n === 1 ? "" : "s"} added`); return route();
  }
  if (f.id === "settings-form") {
    const v = (id) => $("#" + id).value;
    const p = { cohort: { name: v("st-name"), start_date: v("st-start"), year2: v("st-year"), batch: v("st-batch"), applications_open: $("#st-open").checked, pass_mark: +v("st-pass"), ready_n: +v("st-n"), assess_minutes: +v("st-mins"), offer_days: +v("st-days"), inst_due_week: +v("st-due") },
      programme: { fee: +v("st-fee"), inst_pct: +v("st-pct") }, tracks: $$("[data-track]").map((i) => ({ code: i.dataset.track, seats: +i.value, paused: $("#pause-" + i.dataset.track).checked })),
      site: { site_url: v("st-site"), website_url: v("st-web"), zuri_url: v("st-zuri"), call_link: v("st-call"), info_session_url: v("st-info"), sample_lesson_url: v("st-sample"), team: JSON.stringify(Object.fromEntries(TEAM.map(([r], i) => [r, { name: v(`st-tn${i}`), photo: v(`st-tp${i}`) }]).filter(([, m]) => m.name || m.photo))), signer_name: v("st-sname"), signer_title: v("st-stitle") } };
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("admin_save_settings", { p })); INFO = null; toast("Settings saved"); route(); } catch (x) { $("#st-err").textContent = x.message; }
    return;
  }
  if (f.classList.contains("recpay-form")) {
    const k = f.dataset.k, amt = +$("#ra-" + k).value, note = $("#rn-" + k).value.trim();
    if (!amt || !note) return toast("Add the amount and a note");
    if (!confirm(`Record ${naira(amt)} as received? This can't be undone.`)) return;
    try { const r = await busy(f.querySelector("button"), () => rpc("admin_record_payment", { p_id: k, p_amount: amt, p_note: note })); toast(r.matric ? `Recorded · matric number ${r.matric}` : "Payment recorded"); ui.open = k; route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "account-form") {
    const p1 = $("#ac-p").value, p2 = $("#ac-p2").value, err = $("#ac-err");
    if (!pwOk(p1, p2, err)) return;
    try {
      await busy(f.querySelector("button"), async () => {
        const r = await fetch("/.netlify/functions/student-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: f.dataset.ref, token: f.dataset.token, password: p1 }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.message || "Something went wrong. Please try again.");
        await auth.signOut(); await auth.signIn(d.login, p1);
      });
      toast("Password saved. Welcome!"); go("#/learn");
    } catch (x) { err.textContent = x.message; }
    return;
  }
  if (f.id === "lsignin-form") {
    const m = $("#ls-m").value.trim(), pw = $("#ls-p").value, err = $("#ls-err");
    if (!/^[A-Za-z]+\/\d{2}[A-Za-z]\/\d{3}$/.test(m)) { err.textContent = "Enter your matric number like GEP/27A/001."; return; }
    try { await busy(f.querySelector("button"), () => auth.signIn(loginOf(m), pw)); go("#/learn"); }
    catch (x) { err.textContent = /invalid/i.test(x.message) ? "That matric number and password don't match. New here? Use the set-up link in your email." : x.message; }
    return;
  }
  if (f.id === "lforgot-form") {
    const m = $("#lf-m").value.trim();
    if (!m) { $("#lf-err").textContent = "Enter your matric number."; return; }
    try { await busy(f.querySelector("button"), () => rpc("student_reset_request", { p_matric: m })); } catch { /* same message either way */ }
    app.innerHTML = learnCard(`<h1>Check your email</h1><p>If <b>${esc(m.toUpperCase())}</b> is a valid matric number, we've emailed a link to the address you applied with. It can take a couple of minutes.</p><div><a class="btn" href="#/learn/signin">Back to sign in</a></div>`);
    return;
  }
  if (f.id === "grad-out") {
    const st = $("#go-st").value; if (!st) { $("#go-err").textContent = "Choose what you're doing now."; return; }
    try { const G = await busy(f.querySelector("button"), () => rpc("grad_outcome", { p_status: st, p_company: $("#go-co").value, p_role: $("#go-role").value, p_start: $("#go-start").value || null, p_via: $("#go-via").value })); if (G) { LS.G = G; toast(["hired", "internship", "freelance"].includes(st) ? "Congratulations! 🎉 Saved." : "Saved. We're here to help."); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.id === "grad-survey") {
    const r = f.querySelector('input[name="gs-rec"]:checked'); if (!r) { $("#gs-err").textContent = "Choose a number from 0 to 10."; return; }
    try { const G = await busy(f.querySelector("button"), () => rpc("grad_survey", { p_recommend: +r.value, p_best: $("#gs-best").value, p_improve: $("#gs-imp").value, p_testimonial: $("#gs-quote").value, p_consent: $("#gs-ok").checked })); if (G) { LS.G = G; toast("Thank you for your feedback"); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("grad-ck")) {
    const d = +f.dataset.day, st = $(`#ck${d}-st`).value; if (!st) return toast("Choose what you're doing now");
    try { const G = await busy(f.querySelector("button"), () => rpc("grad_checkin", { p_day: d, p_status: st, p_note: $(`#ck${d}-note`).value })); if (G) { LS.G = G; toast("Check-in sent. Thank you!"); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.id === "verify-form") { const q = $("#vq").value.trim(); if (!q) { const e2 = $("#vq-err"); if (e2) e2.textContent = "Enter a certificate number."; return; } go("#/verify/" + encodeURIComponent(q.toUpperCase())); return; }
  if (f.id === "support-form") {
    const c0 = $("#sp-cat").value, sub = $("#sp-sub").value.trim(), msg = $("#sp-msg").value.trim();
    if (!c0 || !sub || !msg) { $("#sp-err").textContent = "Choose what it's about, then add a subject and your message."; return; }
    try { const R = await busy(f.querySelector("button"), () => rpc("support_create", { p_category: c0, p_subject: sub, p_message: msg })); if (R) { LS.support = R; toast("Request sent. We'll reply within 1 working day."); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.id === "opp-form") {
    const v = (id) => $("#" + id).value.trim(), P = { id: f.dataset.id ? +f.dataset.id : null, kind: v("op-kind"), track: v("op-track"), title: v("op-title"), org: v("op-org"), location: v("op-loc"), deadline: v("op-dl"),
      description: v("op-desc"), requirements: v("op-req"), skills: v("op-skills"), link: v("op-link"), active: $("#op-active").checked };
    if (!P.title || !P.org) { $("#op-err").textContent = "Add the title and the company."; return; }
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("acad_opp_save", { p: P })); ui.oppEdit = null; toast("Saved"); route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "profile-form") {
    try { const P = await busy(f.querySelector("button"), () => rpc("profile_save", { p_phone: $("#pf-phone").value, p_city: $("#pf-city").value, p_linkedin: $("#pf-li").value, p_bio: $("#pf-bio").value, p_reminders: $("#pf-rem").checked })); if (P) { LS.profile = P; toast("Details saved"); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("dp-form")) {
    const body = f.querySelector("textarea").value.trim(); if (!body) return toast("Write something first");
    const parent = f.dataset.parent ? +f.dataset.parent : null, staff = !!f.closest(".staff-disc"), ch = f.closest(".disc")?.dataset.ch || "cohort";
    try { const D = await busy(f.querySelector("button"), () => rpc(staff ? "acad_disc_post2" : "disc_post2", { p_channel: ch, p_body: body, p_parent: parent })); if (D) { ui.dpReply = null; if (staff) route(); else { if (ch === "career") LS.discCareer = D; else LS.disc = D; lsRender(); } toast(parent ? "Reply posted" : "Posted"); } } catch { /* shown */ }
    return;
  }
  if (f.id === "sup-msg-form") {
    const v = $("#sup-msg-txt").value.trim(); if (!v) return toast("Write a message first");
    try { const X = await busy(f.querySelector("button"), () => rpc("learn_message", { p_body: v })); if (X) { LS.X = X; toast("Message sent"); lsRender(); } } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("ls-tool-link")) {
    const id = f.dataset.inp, u = $("#" + id).value.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(u)) { $("#" + id + "-err").textContent = "Paste the full link, starting with https://"; return; }
    await lsCall("learn_submit", { p_key: f.dataset.k, p_link: u }, f.querySelector("button[type=submit]"), "Submitted");
    return;
  }
  if (f.id === "out-form") {
    const n = $("#o-name").value.trim(), co = $("#o-co").value.trim(); if (!n || !co) return toast("Add the person and the company");
    saveDraft("outreach", [...draft("outreach", []), { name: n, co, ch: $("#o-ch").value, st: $("#o-st").value, on: fmtDay(new Date()) }], true); toast("Logged"); lsRender(); return;
  }
  if (f.id === "app-form") {
    const r0 = $("#a-role").value.trim(), co = $("#a-co").value.trim(); if (!r0 || !co) return toast("Add the role and the company");
    saveDraft("apps", [...draft("apps", []), { role: r0, co, st: $("#a-st").value, on: fmtDay(new Date()) }], true); toast("Application added"); lsRender(); return;
  }
  if (f.id === "ls-quiz" && ui.quiz) { await quizSubmit(false); return; }
  if (f.id === "ls-quiz") {
    const it = findItem(f.dataset.k)?.it, n = (it?.qs || []).length, ans = [];
    for (let i = 0; i < n; i++) { const c = f.querySelector(`input[name="q${i}"]:checked`); if (!c) { $("#quiz-err").textContent = `Answer question ${i + 1} first.`; return; } ans.push(+c.value); }
    $("#quiz-err").textContent = "";
    await lsCall("learn_quiz", { p_key: f.dataset.k, p_answers: ans }, f.querySelector("button[type=submit]"), "Answers submitted");
    return;
  }
  if (f.id === "ls-link") {
    const u = $("#ls-url").value.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(u)) { $("#ls-err").textContent = "Paste the full link, starting with https://"; return; }
    await lsCall("learn_submit", { p_key: f.dataset.k, p_link: u }, f.querySelector("button[type=submit]"), "Submitted");
    return;
  }
  if (f.id === "checkin") {
    const c = f.querySelector('input[name="conf"]:checked');
    if (!c) return toast("Choose how confident you feel");
    await lsCall("learn_checkin", { p_week: +f.dataset.wk, p_conf: +c.value, p_note: $("#ck-note").value.trim() }, f.querySelector("button"), "Check-in sent. Thank you.");
    return;
  }
  if (f.id === "lb-form") {
    const fields = [...LB_FIELDS.flatMap((x) => x.fields), ...(f.dataset.last === "1" ? [LB_FINAL] : [])], d = {};
    for (const x of fields) { const v = $("#lb-" + x.k).value.trim(); if (x.req && !v) { $("#lb-err").textContent = `Fill in “${x.l}”.`; $("#lb-" + x.k).focus(); return; } d[x.k] = v; }
    const r = f.querySelector('input[name="lb-rate"]:checked'); if (!r) { $("#lb-err").textContent = "Rate your week."; return; } d.rate = r.value;
    await lsCall("learn_done", { p_key: f.dataset.k, p_done: true, p_data: d }, f.querySelector("button[type=submit]"), "Logbook entry submitted");
    return;
  }
  if (f.id === "lesson-form" || f.id === "task-form") {
    const L = f.id === "lesson-form", v = (id) => $("#" + id).value;
    const p = L ? { week: ui.week, kind: v("le-kind"), track_code: v("le-track") || null, title: v("le-title"), url: v("le-url"), body: v("le-body"), published: $("#le-pub").checked }
      : { week: ui.week, track_code: v("tk-track") || null, title: v("tk-title"), brief: v("tk-brief"), url: v("tk-url"), due_at: v("tk-date") ? `${v("tk-date")}T${v("tk-time") || "23:59"}:00+01:00` : null, published: $("#tk-pub").checked };
    if (f.dataset.id) { p.id = +f.dataset.id; if (ui.edit) p.week = ui.edit.week; }
    try { await busy(f.querySelector("button[type=submit]"), () => rpc(L ? "acad_save_lesson" : "acad_save_task", { p })); toast(f.dataset.id ? "Saved" : "Added"); ui.edit = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("grade-form")) {
    const k = f.dataset.k, st = $(`input[name="gr-${k}"]:checked`)?.value, sc = $("#gs-" + k).value;
    if (!st) return toast("Choose Passed or Needs another try");
    try { await busy(f.querySelector("button"), () => rpc("acad_grade", { p_id: +k, p_status: st, p_score: sc === "" ? null : +sc, p_feedback: $("#gf-" + k).value })); toast("Result sent"); ui.open = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("lgrade-form")) {
    const i = +f.dataset.i, x = ui.lq.work[i], st = $(`input[name="lg-${i}"]:checked`)?.value, g = $("#lgg-" + i).value;
    if (st === "graded" && g === "") return toast("Enter a grade from 0 to 100");
    try { await busy(f.querySelector("button"), () => rpc("acad_learn_grade", { p_app: x.app, p_key: x.key, p_status: st, p_grade: g === "" ? null : +g, p_feedback: $("#lgf-" + i).value })); toast(st === "graded" ? "Grade sent" : "Changes requested"); ui.open = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("place-form")) {
    const i = +f.dataset.i, x = ui.places[i], v = (id) => $(`#${id}-${i}`).value;
    try { await busy(f.querySelector("button"), () => rpc("acad_placement_save", { p_app: x.app, p_org: v("po"), p_role: v("pr"), p_sup_name: v("ps"), p_sup_email: v("pe"), p_sup_phone: v("pp") })); toast("Placement saved"); ui.open = "pl" + i; route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "dc2-times") {
    const ds = $$('input[name="dday"]:checked').map((x) => x.value), ts = $$('input[name="dtime"]:checked').map((x) => x.value);
    if (!ds.length || !ts.length) return toast("Pick at least one day and one time");
    try { const n = await busy(f.querySelector("button"), () => rpc("coach_add_slots", { p_times: ds.flatMap((d) => ts.map((t2) => `${d}T${t2}:00+01:00`)) })); toast(`${n} time${n === 1 ? "" : "s"} added`); route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("dc2-form")) {
    const i = +f.dataset.i, x = ui.dc2[i];
    try { await busy(f.querySelector("button"), () => rpc("coach_result", { p_app: x.app, p_score: +$("#dsc-" + i).value || null, p_note: $("#dno-" + i).value, p_next: $("#dnx-" + i).value })); toast("Result sent to the student"); route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("sp-form")) {
    const i = +f.dataset.i, r = ui.sup[i];
    try { await busy(f.querySelector("button"), () => rpc("acad_support_reply", { p_id: r.id, p_reply: $("#spr-" + i).value, p_status: $("#sps-" + i).value })); toast("Saved"); ui.open = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "pods-auto") {
    try { const n = await busy(f.querySelector("button"), () => rpc("acad_pods_auto", { p_size: +$("#pa-size").value || 5, p_meet: $("#pa-meet").value })); toast(n ? `${n} pod${n === 1 ? "" : "s"} created` : "Everyone is already in a pod"); route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("pod-form")) {
    const g = (n) => f.querySelector(`[name="${n}"]`).value;
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("acad_pod_save", { p_id: f.dataset.id ? +f.dataset.id : null, p_name: g("name"), p_track: g("track"), p_meet: g("meet"), p_link: g("link") })); toast(f.dataset.id ? "Pod saved" : "Pod added"); route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "session-form") {
    const v = (id) => $("#" + id).value;
    if (!v("se-date") || !v("se-time")) return toast("Add a date and start time");
    const p = { title: v("se-title"), kind: v("se-kind"), track_code: v("se-track") || null, starts_at: `${v("se-date")}T${v("se-time")}:00+01:00`, minutes: +v("se-min") || 60, host: v("se-host"), link: v("se-link") };
    if (f.dataset.id) p.id = +f.dataset.id;
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("acad_save_session", { p })); toast(p.id ? "Saved" : "Session added"); ui.edit = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.classList.contains("att-form")) {
    const marks = $$("select[data-sid]", f).map((x) => ({ id: x.dataset.sid, status: x.value }));
    try { const n = await busy(f.querySelector("button"), () => rpc("acad_mark_attendance", { p_session: +f.dataset.k, p_marks: marks })); toast(`Attendance saved for ${n}`); } catch { /* shown */ }
    return;
  }
  if (f.id === "news-form") {
    const t = $("#nw-title").value.trim(), b = $("#nw-body").value.trim();
    if (!t || !b) { $("#nw-err").textContent = "Add a title and a message."; return; }
    try { const n = await busy(f.querySelector("button"), () => rpc("acad_announce", { p_title: t, p_body: b, p_track: $("#nw-track").value || null, p_email: $("#nw-email").checked })); toast(n ? `Posted and emailed to ${n}` : "Posted"); route(); } catch (x) { $("#nw-err").textContent = x.message; }
    return;
  }
  if (f.id === "staff-form") {
    try { await busy(f.querySelector("button"), () => rpc("super_save_staff", { p_email: $("#sf-email").value, p_name: $("#sf-name").value, p_role: $("#sf-role").value, p_active: $("#sf-active").checked, p_track: $("#sf-track").value || null })); toast("Saved"); route(); }
    catch (x) { $("#sf-err").textContent = x.message; }
  }
});


/* ---------- certificate ---------- */
const CERT_SEAL = `<svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true"><defs><path id="cring" d="M105 105 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0"/></defs>
  <circle cx="105" cy="105" r="100" fill="#FFFFFF" stroke="#F4B740" stroke-width="3"/><circle cx="105" cy="105" r="93" fill="none" stroke="#10263D" stroke-width="1.5" stroke-dasharray="2 4"/>
  <circle cx="105" cy="105" r="62" fill="none" stroke="#10263D" stroke-width="1.5"/>
  <text font-family="DM Sans, sans-serif" font-size="14" font-weight="700" letter-spacing="3.2" fill="#10263D"><textPath href="#cring">JOBNEST ACADEMY · BECOME WORK-READY ·</textPath></text>
  <g transform="translate(83 72) scale(1.22)"><rect width="36" height="36" rx="10" fill="#0F7B6C"/><path d="M8 20c1.5 6 18.5 6 20 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="18" cy="14" r="4.2" fill="#F4B740"/></g>`;
const CERT_WAVES = Array.from({ length: 35 }, (_, i) => { const y = 40 + i * 22; return `<path d="M0 ${y} Q 140 ${y - 30} 280 ${y} T 560 ${y} T 840 ${y} T 1120 ${y}" fill="none" stroke="#0F7B6C" stroke-opacity="0.05" stroke-width="1"/>`; }).join("");
function certHTML(c) {
  const done = c.completed_on ? fmtDateD(c.completed_on).replace(/^\w+ /, "") : "";
  return `<div class="cert"><div class="cert-in">
    <svg class="cert-bg" viewBox="0 0 1120 800" preserveAspectRatio="none" aria-hidden="true">${CERT_WAVES}</svg>
    <div class="cert-main">
      <div class="cert-logo"><svg width="64" height="64" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="#0F7B6C"/><path d="M8 20c1.5 6 18.5 6 20 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="18" cy="14" r="4.2" fill="#F4B740"/></svg><span>Jobnest<br><span>Academy</span></span></div>
      <span class="cert-date">${esc(done)}</span>
      <span class="cert-name">${esc(c.name)}</span>
      <span class="cert-sm">${c.kind === "internship" ? "has successfully completed an internship as" : "has successfully completed"}</span>
      <span class="cert-prog">${esc(c.kind === "internship" ? c.role : c.programme)}</span>
      <span class="cert-sm">${c.kind === "internship" ? `at ${esc(c.org)} · 4 weeks · supervised by ${esc(c.sup_name)}` : `${c.track ? `${esc(c.track)} track · ` : ""}a ${c.weeks || 17}-week online programme by Jobnest Academy`}</span>
    </div>
    <div class="cert-sig"><img src="/assets/signature-pd.png" alt="Signature of ${esc(c.signer_name)}"><span class="cert-line"></span><b>${esc(c.signer_name)}</b><span>${esc(c.signer_title)}, Jobnest Academy</span></div>
    <div class="cert-ribbon"><span class="cert-title">CERTIFICATE<br>OF<br>${c.kind === "internship" ? "INTERNSHIP" : "COMPLETION"}</span><i></i><div class="cert-seal">${CERT_SEAL}<text x="105" y="140" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#10263D">${esc(c.year || "")}</text></svg></div></div>
    <div class="cert-verify">Verify at ${esc(location.host)}/verify/<b>${esc(c.cert_id)}</b><br>Jobnest Academy confirms this person completed the ${c.kind === "internship" ? "internship" : "programme"}.</div>
  </div></div>`;
}
function fitCert() {
  $$(".cert-box").forEach((box) => { const c = box.querySelector(".cert"); if (!c) return;
    const k = Math.min(1, box.clientWidth / 1123); c.style.transform = `scale(${k})`; box.style.height = `${794 * k}px`; });
}
window.addEventListener("resize", fitCert);
const certUrl = (c) => `${location.origin}/verify/${c.cert_id}`;
function certBlock(c, pub) {
  const d = c.completed_on ? new Date(c.completed_on + "T12:00:00Z") : new Date();
  const li = "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=" + encodeURIComponent(c.kind === "internship" ? `Internship: ${c.role}` : c.programme) + "&organizationName=" + encodeURIComponent("Jobnest Academy") +
    "&issueYear=" + d.getUTCFullYear() + "&issueMonth=" + (d.getUTCMonth() + 1) + "&certUrl=" + encodeURIComponent(certUrl(c)) + "&certId=" + encodeURIComponent(c.cert_id);
  CERT_NOW = c;
  return `<div class="cert-actions"><button class="btn gold" data-act="cert-pdf">Download PDF</button>${pub ? "" : `<a class="btn li-btn" href="${esc(li)}" target="_blank" rel="noopener">Add to LinkedIn ↗</a>`}<button class="btn ghost" data-act="cert-copy">Copy verification link</button></div>
    <div id="cert-box" class="cert-box">${certHTML(c)}</div>
    <p class="note" style="margin-top:.8rem">Employers can check it's real at <span class="mono" style="overflow-wrap:anywhere">${esc(certUrl(c).replace(/^https?:\/\//, ""))}</span></p>`;
}
let CERT_NOW = null;
function pageVerify() {
  app.innerHTML = pubHeader() + `<section class="wrap pub-wrap"><form class="card verify form" id="verify-form" novalidate><span class="eyebrow">For employers and recruiters</span><h1>Verify a certificate</h1>
    <p>Enter the certificate number printed on a Jobnest Academy certificate (for example JNA-GEP27A-001), or the graduate's matric number.</p>
    <div class="verify-row"><label class="sr-only" for="vq">Certificate number</label><input id="vq" class="mono" placeholder="e.g. JNA-GEP27A-001" autocapitalize="characters"><button class="btn" type="submit">Verify</button></div>
    <p class="err" id="vq-err" role="alert"></p></form></section>` + pubFoot();
}
async function pageCertificate(code) {
  loading();
  let c = null;
  try { [c] = await Promise.all([rpc("certificate_view", { p_cert: code }), info().catch(() => null)]); } catch { c = null; }
  if (!c || !c.cert_id) {
    app.innerHTML = pubHeader() + `<section class="wrap pub-wrap"><div class="card verify"><h1>Certificate not found</h1><p>There's no Jobnest Academy certificate with the code <b class="mono">${esc(code)}</b>. Check the code and try again.</p></div></section>`;
    return;
  }
  app.innerHTML = pubHeader() + `<section class="wrap pub-wrap cert-page">
    <div class="verified"><span class="v-tick" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-9"/></svg></span><div><b>Verified certificate</b><span>Jobnest Academy issued this certificate. It is genuine.</span></div></div>
    <dl class="v-facts"><div><dt>Name</dt><dd>${esc(c.name)}</dd></div>${c.kind === "internship" ? `<div><dt>Internship</dt><dd>${esc(c.role)} at ${esc(c.org)}</dd></div><div><dt>Supervisor</dt><dd>${esc(c.sup_name)}</dd></div>` : `<div><dt>Programme</dt><dd>${esc(c.programme)}</dd></div>`}${c.track ? `<div><dt>Track</dt><dd>${esc(c.track)}</dd></div>` : ""}<div><dt>Completed</dt><dd>${esc(fmtDateD(c.completed_on))}</dd></div><div><dt>Certificate</dt><dd class="mono">${esc(c.cert_id)}</dd></div></dl>
    ${certBlock(c, true)}
    <form class="card form verify-again" id="verify-form" novalidate><h3>Check another certificate</h3><div class="verify-row"><label class="sr-only" for="vq">Certificate number</label><input id="vq" class="mono" placeholder="e.g. JNA-GEP27A-001" autocapitalize="characters"><button class="btn" type="submit">Verify</button></div></form></section>`;
  document.title = `Certificate · ${c.name} · Jobnest Academy`;
  fitCert();
}

/* Draws the certificate on a canvas (same layout as the page) and saves it as a one-page A4 PDF. */
async function certCanvas(c, k = 2) {
  const fonts = ['500 46px "Playfair Display"', 'italic 500 20px "Playfair Display"', '800 40px "Bricolage Grotesque"', '400 16px "DM Sans"', '700 16px "DM Sans"', '700 14px "JetBrains Mono"'];
  try { await Promise.all(fonts.map((f) => document.fonts.load(f))); } catch { /* fall back to system fonts */ }
  const sig = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "/assets/signature-pd.png"; });
  const W = 1123, H = 794, cv = document.createElement("canvas"); cv.width = W * k; cv.height = H * k;
  const x = cv.getContext("2d"); x.scale(k, k); x.textBaseline = "alphabetic";
  const F = (f) => (x.font = f);
  x.fillStyle = "#EEF1F0"; x.fillRect(0, 0, W, H);
  const ox = 14, oy = 14, iw = W - 28, ih = H - 28;
  x.fillStyle = "#FFFFFF"; x.fillRect(ox, oy, iw, ih); x.strokeStyle = "#C9D6D2"; x.lineWidth = 1; x.strokeRect(ox + .5, oy + .5, iw - 1, ih - 1);
  x.save(); x.beginPath(); x.rect(ox, oy, iw, ih); x.clip();
  x.strokeStyle = "rgba(15,123,108,0.05)"; const sx = iw / 1120, sy = ih / 800;
  for (let y = 40; y < 800; y += 22) { x.beginPath(); x.moveTo(ox, oy + y * sy); for (let s0 = 0; s0 < 1120; s0 += 280) { const up = (s0 / 280) % 2 === 0 ? -30 : 30; x.quadraticCurveTo(ox + (s0 + 140) * sx, oy + (y + up) * sy, ox + (s0 + 280) * sx, oy + y * sy); } x.stroke(); }
  const L = ox + 90;
  // logo
  const logo = (lx, ly, s) => { x.save(); x.translate(lx, ly); x.scale(s / 36, s / 36); x.fillStyle = "#0F7B6C"; x.beginPath(); x.roundRect(0, 0, 36, 36, 10); x.fill();
    x.strokeStyle = "#FFFFFF"; x.lineWidth = 2.6; x.lineCap = "round"; x.beginPath(); x.moveTo(8, 20); x.bezierCurveTo(9.5, 26, 26.5, 26, 28, 20); x.stroke();
    x.fillStyle = "#F4B740"; x.beginPath(); x.arc(18, 14, 4.2, 0, Math.PI * 2); x.fill(); x.restore(); };
  logo(L, oy + 80, 64);
  F('800 40px "Bricolage Grotesque", sans-serif'); x.fillStyle = "#10263D"; x.fillText("Jobnest", L + 80, oy + 108); x.fillStyle = "#0F7B6C"; x.fillText("Academy", L + 80, oy + 150);
  const done = c.completed_on ? fmtDateD(c.completed_on).replace(/^\w+ /, "") : "";
  F('700 14px "JetBrains Mono", monospace'); x.fillStyle = "#5B6B7B"; x.fillText(done, L, oy + 226);
  F('500 46px "Playfair Display", serif'); x.fillStyle = "#10263D"; let nf = 46; while (x.measureText(c.name).width > 600 && nf > 28) { nf -= 2; F(`500 ${nf}px "Playfair Display", serif`); } x.fillText(c.name, L, oy + 290);
  F('400 16px "DM Sans", sans-serif'); x.fillStyle = "#3E5266"; x.fillText(c.kind === "internship" ? "has successfully completed an internship as" : "has successfully completed", L, oy + 332);
  F('500 28px "Playfair Display", serif'); x.fillStyle = "#10263D"; x.fillText(c.kind === "internship" ? c.role : c.programme, L, oy + 374);
  F('400 16px "DM Sans", sans-serif'); x.fillStyle = "#3E5266"; x.fillText(c.kind === "internship" ? `at ${c.org} · 4 weeks · supervised by ${c.sup_name}` : `${c.track ? `${c.track} track · ` : ""}a ${c.weeks || 17}-week online programme by Jobnest Academy`, L, oy + 408);
  // signature
  const sb = oy + ih - 80, lineY = sb - 46;
  x.strokeStyle = "#9AAAB9"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(L, lineY); x.lineTo(L + 260, lineY); x.stroke();
  if (sig) { const h = 92, w = sig.width * h / sig.height; x.drawImage(sig, L + 130 - w / 2, lineY + 8 - h, w, h); }
  F('700 15px "DM Sans", sans-serif'); x.fillStyle = "#10263D"; x.fillText(c.signer_name || "", L, lineY + 26);
  F('400 13px "DM Sans", sans-serif'); x.fillStyle = "#5B6B7B"; x.fillText(`${c.signer_title || "Programme Director"}, Jobnest Academy`, L, lineY + 45);
  // ribbon
  const rx = ox + iw - 70 - 270, rw = 270, rh = 640;
  x.fillStyle = "#10263D"; x.beginPath(); x.moveTo(rx, oy); x.lineTo(rx + rw, oy); x.lineTo(rx + rw, oy + rh); x.lineTo(rx + rw / 2, oy + rh * .88); x.lineTo(rx, oy + rh); x.closePath(); x.fill();
  F('500 26px "Playfair Display", serif'); x.fillStyle = "#FFFFFF"; x.textAlign = "center";
  const spaced = (t, cx, cy) => { const ls = 26 * .14; const w = [...t].reduce((a, ch) => a + x.measureText(ch).width + ls, -ls); let px = cx - w / 2; x.textAlign = "left"; for (const ch of t) { x.fillText(ch, px, cy); px += x.measureText(ch).width + ls; } x.textAlign = "center"; };
  spaced("CERTIFICATE", rx + rw / 2, oy + 100); spaced("OF", rx + rw / 2, oy + 135); spaced(c.kind === "internship" ? "INTERNSHIP" : "COMPLETION", rx + rw / 2, oy + 170);
  x.fillStyle = "#F4B740"; x.beginPath(); x.roundRect(rx + rw / 2 - 28, oy + 197, 56, 4, 2); x.fill();
  // seal
  const cx = rx + rw / 2, cy = oy + 375;
  x.fillStyle = "#FFFFFF"; x.beginPath(); x.arc(cx, cy, 100, 0, Math.PI * 2); x.fill(); x.strokeStyle = "#F4B740"; x.lineWidth = 3; x.stroke();
  x.strokeStyle = "#10263D"; x.lineWidth = 1.5; x.setLineDash([2, 4]); x.beginPath(); x.arc(cx, cy, 93, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  x.beginPath(); x.arc(cx, cy, 62, 0, Math.PI * 2); x.stroke();
  F('700 14px "DM Sans", sans-serif'); x.fillStyle = "#10263D"; x.textAlign = "center";
  const ring = "JOBNEST ACADEMY · BECOME WORK-READY · "; let ang = Math.PI;
  for (const ch of ring) { const wch = x.measureText(ch).width + 3.2; const a1 = ang + (wch / 2) / 78; x.save(); x.translate(cx + 78 * Math.cos(a1), cy + 78 * Math.sin(a1)); x.rotate(a1 + Math.PI / 2); x.fillText(ch, 0, 5); x.restore(); ang += wch / 78; }
  logo(cx - 22, cy - 33, 44);
  F('700 12px "JetBrains Mono", monospace'); x.fillText(c.year || String(new Date().getFullYear()), cx, cy + 35);
  // verify
  x.textAlign = "right"; F('400 13px "DM Sans", sans-serif'); x.fillStyle = "#5B6B7B";
  const vr = ox + iw - 70; F('700 13px "JetBrains Mono", monospace'); const cw = x.measureText(c.cert_id).width; x.fillStyle = "#10263D"; x.fillText(c.cert_id, vr, oy + ih - 62);
  F('400 13px "DM Sans", sans-serif'); x.fillStyle = "#5B6B7B"; x.fillText(`Verify at ${location.host}/verify/`, vr - cw, oy + ih - 62); x.fillText(`Jobnest Academy confirms this person completed the ${c.kind === "internship" ? "internship" : "programme"}.`, vr, oy + ih - 41);
  x.restore();
  return cv;
}
function jpegToPdf(jpeg, w, h) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const add = (b) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); body(); add("\nendobj\n"); };
  add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const PW = 841.89, PH = 595.28, content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(1, () => add("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); add(jpeg); add("\nendstream"); });
  obj(5, () => add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len; add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}
async function downloadCertPdf(btn) {
  const c = CERT_NOW; if (!c) return;
  await busy(btn, async () => {
    const cv = await certCanvas(c, 2.4);
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.93));
    const pdf = jpegToPdf(new Uint8Array(await blob.arrayBuffer()), cv.width, cv.height);
    const a = document.createElement("a"); a.href = URL.createObjectURL(pdf);
    a.download = `Jobnest-Academy-Certificate-${c.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  });
  toast("Certificate downloaded");
}

/* ---------- router ---------- */
async function route() {
  $("#cert-print")?.remove();
  if (TOUR_I != null && !/^(#)?\/learn/.test(location.hash || location.pathname)) { TOUR_I = null; renderTour(); }
  const back = auth.takeFromUrl();
  if (back) {
    history.replaceState(null, "", back.type === "recovery" ? "/staff/new-password" : back.error ? "/staff" : "/portal");
    if (back.error) return pageStaffSignIn(esc(back.error));
  }
  if (location.hash.startsWith("#/")) history.replaceState(null, "", toPath(location.hash));
  const parts = location.pathname.replace(/^\/+/, "").split("/").map(decodeURIComponent);
  const [p0, p1, p2, p3] = parts;
  window.scrollTo(0, 0);
  try {
    if (p0 === "staff") {
      if (p1 === "signup") return pageStaffSignup();
      if (p1 === "reset") return pageStaffReset();
      if (p1 === "new-password") return pageNewPassword();
      if (auth.session && isStudent()) { await auth.signOut(); CAMPUS = null; LS = null; return pageStaffSignIn("You were signed in to the student portal on this browser, so we signed you out. Sign in with your staff email."); }
      return auth.session ? go("#/portal") : pageStaffSignIn();
    }
    if (p0 === "portal") return pagePortal(p1 || "");
    if (p0 === "learn") {
      if (p1 === "signin") return auth.session && isStudent() ? go("#/learn") : pageLearnSignIn();
      if (p1 === "forgot") return pageLearnForgot();
      return pageLearn(p1 || "home", p2, p3);
    }
    if (p0 === "host" && p1) return pageHost(p1);
    if (p0 === "a" && p1 && p2) return pageApplicant(p1, p2, p3 || "");
    await info();
    if (p0 === "gep") return pageHome();
    if (p0 === "tracks") return pageTracks();
    if (p0 === "programmes") return pagePrograms();
    if ((p0 === "verify" || p0 === "certificate") && p1) return pageCertificate(p1);
    if (p0 === "verify") return pageVerify();
    if (p0 === "start") return go("#/apply");
    if (p0 === "apply") {
      if (p1 === "zuri" && p2) { try { sessionStorage.setItem("jn_zuri", p2.slice(0, 4000)); } catch (e) {} history.replaceState(null, "", "/apply"); }
      return pageApply();
    }
    if (p0 === "check") return pageCheck();
    if (p0 === "paycheck") return pagePayCheck();
    return pageHome();
  } catch (e) {
    app.innerHTML = `<section class="wrap pub-wrap"><div class="card verify"><h1>We can't load this page</h1><p>${esc(e.message)}</p><p class="note">Check your internet connection and try again.</p><div><a class="btn" href="">Try again</a></div></div></section>`;
  }
}
window.addEventListener("hashchange", () => { if (location.hash.startsWith("#/") || location.hash.includes("access_token=")) route(); });
window.addEventListener("popstate", route);
// In-app links are written as "#/…"; open them as clean addresses without reloading.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
  e.preventDefault(); go(a.getAttribute("href"));
}, true);
route();
