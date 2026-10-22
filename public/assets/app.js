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
const ROUTE_STOPS = [["Week 1", "Orientation"], ["Weeks 2–3", "Fundamental Learning"], ["Weeks 4–11", "Core Skill Learning"], ["Week 12", "Examinations"],
  ["Weeks 13–14", "Practical Project"], ["Weeks 15–18", "Internship"], ["Week 19", "CV & Portfolio"], ["Week 20", "Discovery Call, Job Search & Pitching"]];
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
  BOP: ["Keep a business organised and running.", ["Calendars, inboxes and business documents", "Spreadsheets, budgets and vendors", "Project coordination and SOPs", "Executive support and office records"], ["Operations Assistant", "Project Coordinator", "Executive / Virtual Assistant", "Admin Officer"]],
  PTA: ["Help companies find and look after great people.", ["The recruitment lifecycle", "Job descriptions, sourcing and screening", "Interviews, onboarding and HR admin", "HR policies, data privacy and reporting"], ["Recruitment Coordinator", "HR Assistant", "Talent Sourcer"]],
  CSG: ["Keep customers happy and help the business grow.", ["Support tools, live chat and email", "Customer success and onboarding", "CRM and sales prospecting", "Retention, upsell and CX reporting"], ["Customer Success Associate", "Sales Development Rep", "CRM Assistant", "Customer Support"]],
};
const part1Of = (p) => Math.ceil((p.inst_total || 0) / 2 / 500) * 500;
const feeBox = (p, c) => { const t = p.inst_total || 0, a = part1Of(p), b = t - a, extra = t - p.fee, wk = c.inst_due_week || 6;
  return `<span class="nl-fees"><span class="nl-fee"><span>Pay in full</span><b>${naira(p.fee)}</b></span>${t > 0 ? `<span class="nl-fee two"><span class="nl-fee-r"><span>Or two parts</span><b>${naira(t)}</b></span><small>${naira(a)} to accept your place, then ${naira(b)} before Week ${wk}.${extra > 0 ? ` That's ${naira(extra)} more than paying in full.` : ""}</small></span>` : ""}<a class="nl-help" href="#/" data-act="jump" data-k="faq-cost">Need help with fees?</a></span>`; };
const teamOf = () => { try { return JSON.parse(INFO.team || "{}") || {}; } catch { return {}; } };
const FAQ = [["Can I join during NYSC?", "Yes."], ["Do I need experience?", "No. Just basic digital skills and clear communication."],
  ["How am I graded?", "Ten weekly assessments (40 marks), two examinations in Week 12 (60 marks) and a practical project (100 marks). Your final score is the total divided by 2: Distinction 80–100, Merit 60–79, Pass 50–59."],
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
        <p class="nl-lead">In ${weeks} weeks, build the skills employers hire for, prove them in examinations and a practical project, intern with a company, and get coached through your job search. All online.</p>
        ${open ? `<div class="actions"><a class="btn gold lg" href="#/apply">Apply now →</a>${INFO.zuri_url ? `<a class="btn ghost lg nl-ghost" href="${esc(INFO.zuri_url)}" target="_blank" rel="noopener">Not sure which path fits? Ask Zuri</a>` : ""}</div>${INFO.zuri_url ? `<p class="nl-zsub">Zuri is our career assistant. Chat now, no booking needed.</p>` : ""}`
          : `<p class="note">Applications for the next cohort will open soon. Check back here.</p>`}
      </div>
      <div class="nl-art" aria-hidden="true">
        <div class="nl-card nl-c1"><span class="nl-eyebrow">Your route · Week 13 of ${weeks}</span><div class="nl-bars"><i class="d"></i><i class="d"></i><i class="n"></i><i></i></div><div class="nl-bl"><span>Skills</span><span>Exams</span><span class="b">Project</span><span>Intern</span></div></div>
        <div class="nl-card nl-c2"><span class="nl-time">10:00</span><span class="nl-c2t"><b>Live class</b><small>With your facilitator</small></span><span class="nl-join">Join</span></div>
        <div class="nl-card nl-c3"><span class="nl-c3h"><b>Practical project</b><span class="pill ok">82/100</span></span><small>Graded against the rubric, then it goes in your portfolio.</small></div>
      </div></div></section>
    <section class="nl-finish"><div class="wrap"><h2 class="nl-h2">You'll finish with.</h2>
      <div class="nl-finrow"><ul class="nl-fin">
        <li><b>A graded certificate</b><span>Distinction, Merit or Pass, signed by the Programme Director and easy for employers to verify.</span></li>
        <li><b>A practical project</b><span>In your portfolio, graded with feedback you can show employers.</span></li>
        <li><b>Internship experience</b><span>Four weeks with a partner company.</span></li>
        <li><b>A job-ready CV and LinkedIn</b><span>Reviewed with your Career Coach.</span></li></ul>
        <div class="nl-certwrap"><div class="cert-box nl-cert" aria-label="Example certificate">${certHTML({ name: "Aiden Ivwurie", programme: p.name || "Graduate Employability Programme", weeks, track: "", class: "Merit", completed_on: null, cert_id: "JNA-GEP27A-001", signer_name: INFO.signer_name || "Shekemi Odeyemi", signer_title: INFO.signer_title || "Programme Director", year: String(new Date().getFullYear() + 1) })}</div></div>
      </div></div></section>
    <section class="nl-route"><div class="wrap"><div class="nl-route-h"><h2 class="nl-h2">The ${weeks} weeks.</h2><a class="nl-more" href="#/tracks">See what you can learn →</a></div>
      <ol class="nl-weeks">${ROUTE_STOPS.map(([w, t], i) => `<li class="${i === ROUTE_STOPS.length - 1 ? "end" : ""}"><span>${w}</span><b>${t}</b></li>`).join("")}</ol></div></section>
    <section class="wrap nl-sec" id="how"><h2 class="nl-h2">How to get in.</h2>
      <ol class="nl-steps">${[["Apply", "5 minutes"], ["Readiness check", `${mins} minutes`], ["Call with us", "15 minutes"], ["Accept and pay", p.fee ? "Only after you get an offer" : "You're in"]].map(([a, b], i) => `<li><span class="nl-n">${i + 1}</span><span><b>${a}</b><small>${b}</small>${i === 3 && p.fee ? feeBox(p, c) : ""}</span></li>`).join("")}</ol>
      <div class="nl-need"><b class="nl-need-h">You'll need</b><ul>${["A laptop", "Reliable internet", "About 15 hours a week"].map((x) => `<li>${TICK}${x}</li>`).join("")}</ul></div>
      ${INFO.info_session_url || INFO.sample_lesson_url ? `<div class="nl-taste"><div><b>Not ready to apply yet?</b><span>${INFO.info_session_url ? "Join a free info session" : ""}${INFO.info_session_url && INFO.sample_lesson_url ? ", or " : ""}${INFO.sample_lesson_url ? (INFO.info_session_url ? "try a sample lesson" : "Try a sample lesson") : ""}.</span></div><div class="actions">${INFO.info_session_url ? `<a class="btn" href="${esc(INFO.info_session_url)}" target="_blank" rel="noopener">Book an info session</a>` : ""}${INFO.sample_lesson_url ? `<a class="btn ghost" href="${esc(INFO.sample_lesson_url)}" target="_blank" rel="noopener">Try a sample lesson</a>` : ""}</div></div>` : ""}</section>
    <section class="wrap nl-sec"><h2 class="nl-h2">Who supports you.</h2>
      <ul class="nl-team">${TEAM.map(([r, d]) => { const m = teamOf()[r] || {}; const ini = (m.name || r).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        return `<li>${m.name || m.photo ? `<span class="nl-face">${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy">` : esc(ini)}</span>` : ""}${m.name ? `<b>${esc(m.name)}</b><span class="nl-role">${r}</span>` : `<b>${r}</b>`}<span>${d}</span></li>`; }).join("")}</ul></section>
    <section class="wrap nl-sec nl-faq" id="faq"><h2 class="nl-h2">FAQ.</h2>
      <div>${p.fee ? `<details id="faq-cost" open><summary>How much does it cost?</summary><p>${naira(p.fee)} in full, or ${naira(p.inst_total)} in two parts: ${naira(part1Of(p))} to accept your place, then ${naira(p.inst_total - part1Of(p))} before Week ${c.inst_due_week || 6}. You only pay after you're offered a place. Need help with fees? Email <a href="mailto:info@jobnestcareers.com">info@jobnestcareers.com</a> and tell us your situation.</p></details>` : ""}${FAQ.map(([q, a], i) => `<details ${i || p.fee ? "" : "open"}><summary>${q}</summary><p>${a}</p></details>`).join("")}</div></section>
    ${open ? `<section class="nl-band"><div class="wrap"><div><h2 class="nl-h2">Ready to become work-ready?</h2><p>Applying takes 5 minutes.</p></div><a class="btn gold lg" href="#/apply">Apply now →</a></div></section>` : ""}
    <footer class="nl-foot"><div class="wrap"><span>© ${new Date().getFullYear()} Jobnest Services</span>
      <nav aria-label="Footer"><a href="#/check">Continue an application</a><a href="#/learn/signin">Student sign-in</a><a href="#/verify">Verify a certificate</a><a href="#/staff">Staff sign-in</a><a href="${esc(INFO.website_url || "https://jobnestcareers.com")}">Jobnest.com ↗</a></nav></div></footer>`;
  fitCert();
}

const radios = (name, opts) => `<div class="rate">${opts.map((o) => `<label><input type="radio" name="${name}" value="${o}"><span>${o}</span></label>`).join("")}</div>`;
const select = (id, opts) => `<select id="${id}">${["", ...opts].map((o) => `<option value="${esc(o)}">${o || "Choose one"}</option>`).join("")}</select>`;

const STEPS = ["Apply", "Readiness check", "Call", "Offer", "Pay", "Admitted"];
const stepBar = (n) => `<ol class="stepbar" aria-label="Your progress: step ${n + 1} of ${STEPS.length}">${STEPS.map((t, i) => `<li class="${i < n ? "done" : i === n ? "now" : ""}"${i === n ? ' aria-current="step"' : ""}><span></span><em>${t}</em></li>`).join("")}</ol><p class="stepbar-m" aria-hidden="true">Step ${n + 1} of ${STEPS.length} · ${STEPS[n]}</p>`;

const pilotCode = () => { try { return sessionStorage.getItem("jn_pilot") || ""; } catch (e) { return ""; } };
function pageApply() {
  if (!appsOpen() && !pilotCode()) return go("#/gep");
  let zuri = ""; try { zuri = sessionStorage.getItem("jn_zuri") || ""; } catch (e) {}
  const zGoal = (zuri.match(/^Goal[^:]*:\s*(.+)$/m) || [])[1] || "";
  app.innerHTML = pubHeader("admissions") + `<section class="wrap pub-wrap"><form class="card form app-form" id="apply-form" novalidate>
    ${stepBar(0)}<p class="ap-saved" id="ap-saved" aria-live="polite"></p><div id="ap-back"></div>${pilotCode() ? `<div class="notice pilot-n"><span><b>Pilot test.</b> You're helping us test Jobnest Academy before launch. Everything works like the real programme, but you won't be asked to pay, and your test account is deleted when testing ends.</span></div>` : ""}<h1>Apply to the ${esc(prog().name)}</h1>
    <div class="ap-track"><span class="ap-i" aria-hidden="true">i</span><span><b>You don't choose a track on this form.</b><span>On your Discovery Call, we'll look at your goals and agree the right track with you. Want to look at the options first?</span>
      <button type="button" class="ap-link" data-act="ap-tracks">See what you'll learn →</button><small>Opens on this page. Your answers stay here.</small></span></div>
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
    <p class="note">Your answers are saved on this device as you type, and cleared once you submit.</p>
  </form></section>`;
  apRestore();
}

// Application form autosave: answers live in this browser until the form is submitted.
const AP_KEY = "jn_apply_draft";
const apFields = () => $$("#apply-form input, #apply-form select, #apply-form textarea").filter((x) => (x.id || x.name) && x.type !== "submit");
function apSave() {
  const v = {};
  apFields().forEach((x) => { if (x.type === "radio") { if (x.checked) v[x.name] = x.value; } else if (x.type === "checkbox") v[x.id] = x.checked; else v[x.id] = x.value; });
  try { localStorage.setItem(AP_KEY, JSON.stringify({ v, at: Date.now() })); } catch (e) { return; }
  const s = $("#ap-saved"); if (s) s.textContent = "Saved on this device · just now";
}
function apRestore() {
  let d = null; try { d = JSON.parse(localStorage.getItem(AP_KEY) || "null"); } catch (e) {}
  if (!d?.v || Date.now() - (d.at || 0) > 30 * 864e5) return;
  const v = d.v, set = (id) => { const x = $("#" + id); if (x && v[id] != null && x.type !== "checkbox") x.value = v[id]; };
  if (v["g-country"]) { set("g-country"); setCountry(); }
  if (v["g-cc"]) { set("g-cc"); $("#g-cc").dataset.touched = "1"; ccShow(); }
  if (v["g-state"]) { set("g-state"); fillTowns(); }
  apFields().forEach((x) => {
    if (["g-country", "g-cc", "g-state"].includes(x.id)) return;
    if (x.type === "radio") x.checked = v[x.name] === x.value;
    else if (x.type === "checkbox") x.checked = !!v[x.id];
    else if (v[x.id] != null && (x.id !== "g-zuri" || !x.value) && (x.id !== "g-mot" || !x.value)) x.value = v[x.id];
  });
  const town = $("#g-town"), o = $("#g-town-o"); if (town && o) o.hidden = town.value !== "Other";
  const filled = Object.entries(v).some(([k, x]) => x && !["g-country", "g-cc"].includes(k));
  if (filled) $("#ap-back").innerHTML = `<div class="notice ap-back"><span><b>Welcome back.</b> We kept your answers from earlier, so you can carry on where you stopped.</span><button type="button" class="ap-link" data-act="ap-clear">Start again</button></div>`;
  $("#ap-saved").textContent = filled ? "All answers saved" : "";
}
function apTracks() {
  const T = (INFO.tracks || []).filter((t) => t.open !== false);
  const d = document.createElement("div"); d.className = "ap-drawer"; d.id = "ap-drawer";
  d.innerHTML = `<div class="ap-dr-bg" data-act="ap-tracks-close"></div><aside class="ap-dr" role="dialog" aria-modal="true" aria-labelledby="ap-dr-h"><div class="ap-dr-top"><h2 id="ap-dr-h">What you'll learn</h2><button type="button" class="btn ghost" data-act="ap-tracks-close">Close</button></div>
    <p class="note">Everyone does the same first weeks, then one track. You'll pick your track with us on the call.</p>
    ${T.map((t) => { const [desc, learn] = TRACK_INFO[t.code] || ["", []]; return `<div class="ap-tk"><b>${esc(t.name)}</b>${desc ? `<span>${desc}</span>` : ""}${learn.length ? `<small>${learn.join(" · ")}</small>` : ""}</div>`; }).join("") || `<p class="note">Tracks will be listed here soon.</p>`}
    <button type="button" class="btn gold" data-act="ap-tracks-close">Back to my application</button><small class="note" style="text-align:center">Your answers are still on the form.</small></aside>`;
  document.body.appendChild(d); document.body.style.overflow = "hidden"; d.querySelector(".ap-dr-top .btn").focus();
}
function apTracksClose() { $("#ap-drawer")?.remove(); document.body.style.overflow = ""; $("[data-act=ap-tracks]")?.focus(); }

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
  const d = { pilot: pilotCode() || undefined, first_name: nameCase(v("g-first")), surname: nameCase(v("g-sur")), email: v("g-email"), phone: phoneValue(), city: cityValue(), edu: v("g-edu"), nysc: v("g-nysc"),
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
    try { sessionStorage.removeItem("jn_zuri"); localStorage.removeItem(AP_KEY); } catch (e) {}
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
  if (a.pilot) return `<div class="offer"><span class="eyebrow">Pilot · offer of admission</span><h2>You've been offered a place in the pilot, ${esc(a.first_name)}!</h2><p>${esc(a.track || "")} track · ${esc(a.cohort)}</p>
    <p>You don't need to pay. The Jobnest team will admit you shortly, and you'll get your matric number and student portal link by email.</p></div>`;
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
      <p>Over the ${a.weeks} weeks you will build the core skills for your track, sit two examinations, deliver a practical project, complete an internship, and be coached through your job search.</p>
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
const SUPER_NAV = [{ g: "Overview" }, { k: "command", l: "Command centre" }, { k: "attention", l: "Needs attention" },
  { g: "Admissions" }, { k: "apps", l: "Applications" }, { k: "calls", l: "Calls" }, { k: "times", l: "Call times" }, { k: "decide", l: "Decisions" }, { k: "pay", l: "Payments" },
  { g: "Academy" }, { k: "students", l: "Students" }, { k: "grading", l: "Grading" }, { k: "results", l: "Results" }, { k: "exams", l: "Examinations" }, { k: "intern", l: "Internships" }, { k: "dc2", l: "Week 20 Discovery Call" }, { k: "pods", l: "Pods" },
  { k: "sessions", l: "Live sessions" }, { k: "news", l: "Announcements" }, { k: "support", l: "Help requests" }, { k: "discussion", l: "Discussion" }, { k: "content", l: "Content" },
  { g: "Careers" }, { k: "jobs", l: "Job search" }, { k: "opps", l: "Opportunities" }, { k: "outcomes", l: "Outcomes & alumni" },
  { g: "Role pages" }, { k: "health", l: "Programme Director" }, { k: "today", l: "Cohort Manager" }, { k: "desk", l: "Facilitator" }, { k: "career", l: "Career Coach" }, { k: "ops", l: "Academy Admin" }, { k: "pipeline", l: "Admissions Admin" }, { k: "home", l: "Admissions Officer" },
  { g: "Organisation" }, { k: "staff", l: "Staff & access" }, { k: "emails", l: "Emails" }, { k: "settings", l: "Settings" }, { k: "audit", l: "Activity log" }];
const N = (k, l) => ({ k, l }), G = (g) => ({ g });
const ROLE_NAV = {
  director: [G("Overview"), N("health", "Programme health"), G("Learning"), N("students", "Students"), N("grading", "Grading"), N("results", "Results"), N("exams", "Examinations"), N("sessions", "Live sessions"), N("news", "Announcements"), N("pods", "Pods"), N("content", "Content"),
    G("Work experience"), N("intern", "Internships"), N("dc2", "Week 20 Discovery Call"), N("jobs", "Job search"), N("opps", "Opportunities"), N("outcomes", "Outcomes & alumni"), G("Support"), N("support", "Help requests"), N("discussion", "Discussion")],
  cohort_manager: [G("Today"), N("today", "Today"), G("Cohort"), N("students", "Students"), N("grading", "Grading"), N("results", "Results"), N("exams", "Examinations"), N("sessions", "Live sessions"), N("news", "Announcements"), N("pods", "Pods"), N("content", "Content"),
    G("Support"), N("support", "Help requests"), N("discussion", "Discussion"), G("Work experience"), N("intern", "Internships"), N("dc2", "Week 20 Discovery Call"), N("jobs", "Job search"), N("opps", "Opportunities"), N("outcomes", "Outcomes & alumni")],
  facilitator: [G("My work"), N("desk", "Grading desk"), N("grading", "All submissions"), N("results", "Results"), G("My track"), N("students", "Students"), N("sessions", "Live sessions"), N("news", "Announcements"), N("content", "Content"), N("pods", "Pods"),
    G("Supervision"), N("intern", "Internships"), G("Support"), N("support", "Help requests"), N("discussion", "Discussion")],
  coach: [G("Today"), N("career", "Career desk"), G("Calls"), N("dc2", "Week 20 Discovery Call"), G("Job search"), N("jobs", "Job search"), N("opps", "Opportunities"), N("outcomes", "Outcomes & alumni"),
    G("Students"), N("students", "Students"), N("intern", "Internships"), N("pods", "Pods"), N("sessions", "Live sessions"), N("news", "Announcements"), N("support", "Help requests"), N("discussion", "Discussion")],
  academy_admin: [G("Today"), N("ops", "Operations"), G("Work experience"), N("intern", "Internships"), N("opps", "Opportunities"), N("jobs", "Job search"), N("outcomes", "Outcomes & alumni"),
    G("Cohort"), N("students", "Students"), N("results", "Results"), N("exams", "Examinations"), N("sessions", "Live sessions"), N("news", "Announcements"), N("pods", "Pods"), N("content", "Content"), G("Support"), N("support", "Help requests"), N("discussion", "Discussion")],
  adm_admin: [G("Today"), N("pipeline", "Pipeline"), G("Admissions"), N("decide", "Decisions"), N("apps", "Applications"), N("pay", "Payments"), G("Setup"), N("emails", "Emails"), N("settings", "Settings"), G("Academy"), N("students", "Students")],
  adm_officer: [G("Today"), N("home", "Today's calls"), G("Admissions"), N("calls", "Calls"), N("times", "Call times"), N("apps", "Applications")]
};
function staffNav(role) {
  if (role === "super") return SUPER_NAV;
  return ROLE_NAV[role] || [N("soon", "Home")];
}
// Number badges in the staff menu: how many things are waiting in each section.
const BADGE_HELP = { attention: "things waiting on a decision", support: "open help requests", grading: "to grade or reply", intern: "students without a placement", dc2: "calls without a result", decide: "to decide", calls: "calls to complete", pods: "students not in a pod" };
function paintBadges() {
  const c = { ...(ui.counts || {}), ...(ME?.role === "super" && ui.attnN != null ? { attention: ui.attnN } : {}) }; let total = 0;
  $$(".snav-i[href^='#/portal/']").forEach((a) => { const k = a.getAttribute("href").split("/").pop(), n = +c[k] || 0; a.querySelector(".cnt-b")?.remove();
    if (n > 0) { total += n; a.insertAdjacentHTML("beforeend", `<b class="cnt-b mono" title="${n} ${BADGE_HELP[k] || "waiting"}">${n}</b>`); } });
  const bell = $(".st-bell"); if (bell) { bell.querySelector("b")?.remove(); const n = ME?.role === "super" ? c.attention || 0 : total; if (n) bell.insertAdjacentHTML("beforeend", `<b class="mono">${n > 99 ? "99+" : n}</b>`); bell.setAttribute("aria-label", `Waiting for you${n ? `, ${n}` : ""}`); }
  $$(".snav-m summary").forEach((sm) => { sm.querySelector(".cnt-b")?.remove(); if (total) sm.insertAdjacentHTML("beforeend", `<b class="cnt-b mono">${total}</b>`); });
}
const staffIni = (n) => esc((n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase());
function shell(tab, title, sub, body, opt = {}) {
  const items = staffNav(ME.role);
  const cur = items.find((x) => x.k === tab);
  const navI = (x) => x.g ? `<p class="snav-g st-g">${x.g}</p>` : `<a class="snav-i st-i" href="#/portal/${x.k}" aria-current="${x.k === tab || (tab === "student" && x.k === "students") ? "page" : "false"}"><span>${x.l}</span></a>`;
  const nav = items.map(navI).join("");
  const brand = ["adm_officer", "adm_admin"].includes(ME.role) ? "Jobnest Admissions" : "Jobnest Academy";
  const total = Object.values(ui.counts || {}).reduce((t, n) => t + (+n || 0), 0), first = items.find((x) => x.k)?.k;
  const mode = ui.testMode && ui.testMode !== "normal" ? `<a class="st-mode" href="#/portal/settings" title="Change in Settings, Testing">Testing mode: ${ui.testMode === "open" ? "all weeks open" : "progress only"}</a>` : "";
  app.innerHTML = `<div class="st"><aside class="st-nav" aria-label="Menu"><a class="st-brand" href="#/portal">${LOGO}<span><b>${brand}</b><small>${ROLE_NAMES[ME.role]}</small></span></a>
      <nav class="st-list">${nav}</nav><button class="st-i st-out" data-act="signout"><span>Sign out</span></button></aside>
    <main class="shell-main st-main">
      <header class="st-top"><details class="snav-m st-m"><summary><span>Menu</span><b>${cur ? cur.l : ""}</b></summary><nav class="snav-m-list">${nav}<button class="snav-i" data-act="signout"><span>Sign out</span></button></nav></details>
        ${ME.role === "super" ? `<div class="st-search" role="search"><label class="sr-only" for="st-q">Search everything</label><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="st-q" type="search" autocomplete="off" placeholder="Search a name, matric number, JNA number or staff email" aria-controls="st-qres"><div class="st-qres" id="st-qres" hidden></div></div>` : `<div class="st-search-sp"></div>`}
        ${mode}
        <div class="st-tr"><a class="st-bell" href="#/portal/${ME.role === "super" ? "attention" : first}" aria-label="Waiting for you${total ? `, ${total}` : ""}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>${total ? `<b class="mono" id="st-bell-n">${total > 99 ? "99+" : total}</b>` : ""}</a>
          <span class="st-me"><span class="st-av">${staffIni(ME.name)}</span><span class="st-me-t"><b>${esc(ME.name)}</b><small>${ROLE_NAMES[ME.role]}</small></span></span><button class="btn sm ghost st-so" data-act="signout">Sign out</button></div></header>
      <div class="st-body"><div class="st-head"><div class="st-head-t"><p class="eyebrow">${opt.eyebrow || `${brand} · ${ROLE_NAMES[ME.role]}`}</p><h1>${title}</h1>${sub ? `<p class="st-sub">${sub}</p>` : ""}</div>${opt.actions ? `<div class="st-acts">${opt.actions}</div>` : ""}</div>
        <section class="pagebody st-page">${body}</section></div></main></div>`;
  paintBadges();
}

async function pagePortal(tab, sub) {
  if (!auth.session) return go("#/staff");
  if (isStudent()) return go("#/learn");
  loading();
  try { if (!ME || ME.email !== auth.session.email) ME = await rpc("me"); } catch (e) { if (e.status === 401) { await auth.signOut(); return pageStaffSignIn("Your session ended. Please sign in again."); } throw e; }
  if (!ME) {
    app.innerHTML = staffCard(`<h1>No staff access yet</h1><p>You're signed in as <b>${esc(auth.session?.email || "")}</b>, but this email hasn't been added as staff. Ask the Super Admin to add you, then sign in again.</p><div class="actions"><button class="btn ghost" data-act="signout">Sign out</button></div>`);
    return;
  }
  const items = staffNav(ME.role).filter((x) => x.k);
  if (!(tab === "student" && sub && ["super", "director", "cohort_manager", "academy_admin", "facilitator", "coach"].includes(ME.role)) && !items.some((x) => x.k === tab)) tab = items[0].k;
  if (!ui.pinged) { ui.pinged = true; rpc("staff_ping").catch(() => {}); }
  if (ui.testMode === undefined && ["super", "adm_admin", "academy_admin"].includes(ME.role)) ui.testMode = await rpc("admin_test_mode", {}).catch(() => null);
  const pages = { home: tabHome, calls: tabCalls, times: tabTimes, decide: tabDecide, pay: tabPay, apps: tabApps, students: tabStudents, content: tabContent, grading: tabGrading, results: () => (sub ? tabResultDetail(sub) : tabResults()), exams: tabExams, intern: tabIntern, dc2: tabDc2, jobs: tabJobs, pods: tabPods, health: tabHealth, today: tabToday, desk: tabDesk, career: tabCareer, ops: tabOps, pipeline: tabPipeline, command: tabCommand, attention: tabAttention, student: () => tabStudent360(sub), support: tabSupport, discussion: tabDiscussion, opps: tabOpps, outcomes: tabOutcomes, sessions: tabSessions, news: tabNews, emails: tabEmails, settings: tabSettings, staff: tabStaff, audit: tabAudit, soon: tabSoon };
  const counts = Promise.all([rpc("staff_counts").catch(() => ({})), rpc("staff_counts_extra").catch(() => ({}))]).then(([x, y]) => ({ ...(x || {}), ...(y || {}) }));
  try { await pages[tab](); }
  catch (e) { shell(tab, "Something went wrong", "", `<div class="notice">${esc(e.message)}</div>`); }
  ui.counts = await counts; paintBadges();
}

/* ---------- Super Admin: command centre ---------- */
const STAGE_OF_WEEK = (w) => w <= 1 ? "Orientation" : w <= 3 ? "Fundamentals" : w <= 11 ? "Core skills" : w === 12 ? "Examinations" : w <= 14 ? "Practical project" : w <= 18 ? "Internship" : w === 19 ? "CV & portfolio" : "Job search";
const agoS = (t) => { if (!t) return "—"; const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? "" : "s"} ago`; };
const waitS = (t) => { if (!t) return ""; const h = Math.max(0, (Date.now() - new Date(t)) / 36e5); return h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`; };
const nairaK = (n) => n >= 1e6 ? "₦" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m" : n >= 1e4 ? "₦" + Math.round(n / 1e3) + "k" : naira(n);
const SEV = { 1: ["Urgent", "bad"], 2: ["Today", "warn"], 3: ["Soon", "info"] };
const spark = (a, cls) => a && a.length ? `<div class="sc-spark ${cls || ""}" aria-hidden="true">${a.map((v) => { const m = Math.max(...a, 1); return `<i style="height:${Math.max(6, Math.round((v / m) * 100))}%"></i>`; }).join("")}</div>` : "";
const meter = (pct, cls) => `<div class="sc-meter ${cls || ""}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i></div>`;
const queueHref = (q) => q.tab === "student" && q.id ? `#/portal/student/${q.id}` : q.tab === "risk" ? "#/portal/attention" : q.tab === "overview" ? "#/portal/command" : `#/portal/${q.tab}`;
function queueRows(Q, filter) {
  const L = Q.filter((q) => !filter || filter === "all" || q.cat === filter);
  return L.length ? L.map((q) => { const [sv, sc] = SEV[q.rank] || SEV[3];
    return `<li class="sc-q"><span class="sc-dot ${sc}" aria-hidden="true"></span><div class="sc-q-t"><div class="sc-q-h"><b>${esc(q.title)}</b><span class="pill ${sc === "warn" ? "now" : sc}">${sv}</span></div>
      <span class="note">${esc(q.detail || "")}</span><span class="sc-q-m">${esc({ academy: "Academy", money: "Payments", admissions: "Admissions", system: "System" }[q.cat] || "")} · Owner: <b>${esc(q.owner || "—")}</b>${q.oldest ? ` · waiting ${waitS(q.oldest)}` : ""}</span></div>
      <div class="sc-q-a">${q.act ? `<button class="btn sm" data-act="${q.act}">${esc(q.action)}</button>` : `<a class="btn sm" href="${queueHref(q)}">${esc(q.action)}</a>`}</div></li>`; }).join("")
    : `<li class="empty">Nothing waiting here. 🎉</li>`;
}
async function tabCommand() {
  const d = ui.ov = await rpc("super_overview");
  ui.attnN = d.queue.length; ui.testMode = d.mode;
  const K = d.kpis, M = d.money, C = d.cohort, wk = C.week, first = (ME.name || "").split(" ")[0];
  const urgent = d.queue.filter((q) => q.rank === 1).length, h = +fmt(new Date(), { hour: "numeric", hour12: false });
  const qt = ui.qtab || "all", qc = (k) => k === "all" ? d.queue.length : d.queue.filter((q) => q.cat === k).length;
  const att = K.attend_past ? Math.round((K.attend_yes / K.attend_past) * 100) : null, onT = K.students ? Math.round((K.on_track / K.students) * 100) : null;
  const top = Math.max(1, d.funnel[0]?.n || 1);
  const kpis = [
    ["On track", onT != null ? onT + "%" : "—", `${K.on_track} of ${K.students} students are up to date with Week ${Math.max(wk, 1)}`, meter(onT, onT >= 80 ? "" : "warn"), "#/portal/students"],
    ["Grading queue", K.grading, K.grading ? `Oldest waiting ${waitS(K.grading_oldest)}` : "Nothing waiting", spark(K.spark_sub, "") + `<small class="note">Submissions per day, last 12 days</small>`, "#/portal/grading"],
    ["Help requests", `${K.help_open} open`, K.help_late ? `${K.help_late} past the 1 working day reply time` : "All answered on time", spark(K.spark_help, "gold"), "#/portal/support"],
    ["Live class attendance", att != null ? att + "%" : "—", K.attend_past ? `${K.attend_yes} of ${K.attend_past} seats filled at past classes` : "No classes held yet", meter(att, att >= 75 ? "" : "warn"), "#/portal/sessions"],
    ["Average score", K.avg_score != null ? K.avg_score + "%" : "—", "Assessments and week projects, all tracks", meter(K.avg_score, K.avg_score >= 70 ? "" : "warn"), "#/portal/grading"],
    [`Applications · ${esc(d.admissions.name.split(" · ")[0])}`, K.apps_admissions, `${K.apps_today} today · applications ${d.admissions.open ? "open" : "closed"}`, spark(K.spark_apps, "navy"), "#/portal/apps"]];
  const cell = (v, g) => { const live = g >= wk && v != null, cls = v == null ? "na" : live ? "" : v >= 95 ? "c4" : v >= 85 ? "c3" : v >= 70 ? "c2" : "c1";
    return `<span class="hm-c ${cls} ${live ? "live" : ""}" title="Week ${g}: ${v == null ? "not reached yet" : `${v}% passed${live ? " so far (in progress)" : ""}`}">${v == null ? "" : v}</span>`; };
  const S = d.systems, sys = [
    ["Email sending", `${S.mail_today} sent today${S.mail_failed ? ` · ${S.mail_failed} failed` : ""}`, S.mail_failed ? ["warn", `${S.mail_failed} failed`] : ["ok", "Working"]],
    ["Email queue", S.mail_pending ? `${S.mail_pending} waiting · oldest ${agoS(S.mail_oldest_pending)}` : "Nothing waiting to send", S.mail_pending && Date.now() - new Date(S.mail_oldest_pending) > 15 * 6e4 ? ["bad", "Stuck"] : ["ok", "Working"]],
    ["Payments (Paystack)", S.pay_last ? `Last payment confirmed ${agoS(S.pay_last)}${S.pay_failed_week ? ` · ${S.pay_failed_week} failed this week` : ""}` : "No payments yet", ["ok", "Working"]],
    ["Reminders", S.reminders_last ? `Last reminder sent ${agoS(S.reminders_last)}` : "No reminders sent yet (they start when the cohort starts)", ["ok", S.reminders_last ? "Working" : "Waiting"]],
    ["Student portal", d.mode === "normal" ? "Weeks open by progress and dates" : d.mode === "open" ? "Testing: every week is open" : "Testing: dates ignored, weeks open by progress", d.mode === "normal" ? ["ok", "Live"] : ["warn", "Testing"]]];
  shell("command", `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${esc(first)}`,
    `${esc(C.name)} is ${wk < 1 ? `starting on <b>${fmtDateD(C.start_date)}</b>` : wk > C.weeks ? "finished" : `in <b>Week ${wk} of ${C.weeks}</b> (${STAGE_OF_WEEK(wk)})`}. ${d.queue.length ? `${d.queue.length} thing${d.queue.length === 1 ? " needs" : "s need"} a decision${urgent ? `, ${urgent} of them urgent` : ""}.` : "Nothing is waiting on a decision."}`,
    `${d.launch.length ? `<div class="sc-launch"><span class="pill gold">Launch check</span><span>${d.launch.map(esc).join(" · ")}. Fix ${d.launch.length === 1 ? "this" : "these"} before students sign in.</span><a class="btn sm gold" href="#/portal/settings">Review settings</a></div>` : ""}
    <section class="card sc-funnel"><div class="sc-h"><div><span class="eyebrow">Student journey · all cohorts</span><h2>From application to first job</h2></div><span class="note">Each step shows how many moved on from the step before.</span></div>
      <ol class="sc-steps">${d.funnel.map((f, i) => `<li><span class="sc-st-l">${esc(f.label)}</span><b class="mono">${f.n}</b>${meter(Math.round((f.n / top) * 100), i >= 6 ? "gold" : "")}<span class="note">${i === 0 ? "everyone who applied" : d.funnel[i - 1].n ? `${Math.round((f.n / d.funnel[i - 1].n) * 100)}% of the step before` : "—"}</span></li>`).join("")}</ol></section>
    <section class="sc-kpis">${kpis.map(([l, v, n, viz, href]) => `<a class="card sc-kpi" href="${href}"><span class="eyebrow">${l}</span><b class="mono">${v}</b><span class="note">${n}</span>${viz}</a>`).join("")}</section>
    <section class="sc-2">
      <div class="card" id="attention"><div class="sc-h"><div><span class="eyebrow">Needs attention</span><h2>Decisions waiting on someone</h2></div>
        <div class="sc-tabs" role="group" aria-label="Filter">${[["all", "All"], ["admissions", "Admissions"], ["academy", "Academy"], ["money", "Money"], ["system", "System"]].map(([k, l]) => `<button class="sc-tab" data-act="qtab" data-k="${k}" aria-pressed="${qt === k}">${l} <span class="mono">${qc(k)}</span></button>`).join("")}</div></div>
        <ul class="sc-ql">${queueRows(d.queue, qt)}</ul></div>
      <div class="stack">
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Money · ${esc(C.name)}</span><h2>${nairaK(M.collected)} collected of ${nairaK(M.expected)}</h2></div><a class="btn sm ghost" href="#/portal/pay">Payments</a></div>
          ${(() => { const e = Math.max(M.expected, 1), od = M.overdue.reduce((t, o) => t + o.balance, 0); return `<div class="sc-bar" aria-hidden="true"><i class="a" style="width:${(M.full_sum / e) * 100}%"></i><i class="b" style="width:${(M.two_sum / e) * 100}%"></i><i class="c" style="width:${(od / e) * 100}%"></i></div>
          <div class="sc-leg"><span><i class="a"></i>Paid in full <b class="mono">${nairaK(M.full_sum)}</b> · ${M.full_n}</span><span><i class="b"></i>Instalments <b class="mono">${nairaK(M.two_sum)}</b> · ${M.two_n}</span><span><i class="c"></i>Overdue <b class="mono">${nairaK(od)}</b> · ${M.overdue.length}</span></div>`; })()}
          ${M.overdue.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Overdue 2nd instalment</th><th>Balance</th><th>Late</th></tr></thead><tbody>${M.overdue.slice(0, 5).map((o) => `<tr><td><a class="link" href="#/portal/student/${o.id}"><b>${esc(o.name)}</b></a><span class="note mono" style="display:block">${esc(o.matric)}</span></td><td class="mono">${naira(o.balance)}</td><td><span class="pill bad">${o.days} day${o.days === 1 ? "" : "s"}</span></td></tr>`).join("")}</tbody></table></div>
            <div class="actions" style="margin-top:.6rem"><button class="btn sm" data-act="fee-remind-all">Remind all ${M.overdue.length}</button></div><p class="note">Learning is paused for these students until they pay. Home and Help stay open.</p>` : `<p class="note">No one is behind on payments.</p>`}</div>
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Seats · ${esc(d.admissions.name)}</span><h2>${d.seats.reduce((t, x) => t + x.n, 0)} of ${d.seats.reduce((t, x) => t + x.seats, 0)} filled</h2></div>${d.admissions.open ? `<span class="pill ok">Applications open</span>` : `<span class="pill">Applications closed</span>`}</div>
          <div class="sc-seats">${d.seats.map((x) => `<div><span>${esc(x.track)}${x.paused ? ` <span class="pill">Paused</span>` : ""}</span>${meter(Math.round((x.n / Math.max(x.seats, 1)) * 100))}<b class="mono">${x.n}/${x.seats}</b></div>`).join("")}</div></div>
      </div></section>
    <section class="card"><div class="sc-h"><div><span class="eyebrow">Cohort health · ${esc(C.name)}</span><h2>Share of each track that has passed each week</h2></div>
        <div class="hm-leg"><span>Below 70%</span><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="c4"></i><span>95%+</span><span class="hm-live-k"><i class="live"></i>still in progress</span></div></div>
      <div class="hm-wrap"><div class="hm" style="--n:${C.weeks}"><span class="hm-hd">Track</span>${[...Array(C.weeks)].map((_, i) => `<span class="hm-hd ${i + 1 === wk ? "now" : ""}">W${i + 1}</span>`).join("")}<span class="hm-hd r">At risk</span>
        ${d.heat.map((t) => `<b class="hm-t">${esc(t.track)}<small class="note">${t.n} students</small></b>${t.cells.map((v, i) => cell(v, i + 1)).join("")}<a class="hm-r mono" href="#/portal/attention">${t.risk}</a>`).join("")}</div></div></section>
    <section class="sc-2b">
      <div class="card"><div class="sc-h"><div><span class="eyebrow">At risk</span><h2>Students to reach this week</h2></div><a class="btn sm ghost" href="#/portal/attention">All ${d.risk_n}</a></div>
        ${d.risk.length ? `<ul class="sc-people">${d.risk.map((r) => `<li><a href="#/portal/student/${r.id}"><span class="st-av">${staffIni(r.name)}</span><span class="sc-p-t"><b>${esc(r.name)}</b><span class="note">${esc(r.track || "")} · Week ${r.week} · ${esc(r.reasons.join(" · "))}</span></span><span class="pill bad">${r.reasons.length}</span></a></li>`).join("")}</ul>` : `<p class="empty">No one is at risk right now.</p>`}</div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Team</span><h2>Who is carrying the load</h2></div><a class="btn sm ghost" href="#/portal/staff">Staff &amp; access</a></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff</th><th>Queue</th><th>Oldest</th><th>Last active</th></tr></thead><tbody>${d.staff.map((s) => { const old = s.oldest ? (Date.now() - new Date(s.oldest)) / 864e5 : 0;
          return `<tr><td><b>${esc(s.name)}</b><span class="note" style="display:block">${ROLE_NAMES[s.role] || s.role}${s.track ? ` · ${esc(s.track)}` : ""}</span></td><td class="mono">${s.q == null ? "—" : `<b>${s.q}</b> <span class="note">${esc(s.what)}</span>`}</td>
            <td>${s.oldest ? `<span class="pill ${old > 2 ? "bad" : old > 1 ? "now" : "ok"}">${waitS(s.oldest)}</span>` : `<span class="note">—</span>`}</td><td class="note">${s.last_seen ? agoS(s.last_seen) : "never"}</td></tr>`; }).join("")}</tbody></table></div></div></section>
    <section class="sc-2b">
      <div class="card"><span class="eyebrow">Live activity</span><h2 class="sc-h2">What just happened</h2>
        ${d.activity.length ? `<ul class="sc-act">${d.activity.map((a) => `<li><span class="mono note">${fmt(a.at, { hour: "2-digit", minute: "2-digit", hour12: false })}</span><span><b>${esc(a.who)}</b> ${esc(a.what)}<small class="note"> · ${agoS(a.at)}</small></span></li>`).join("")}</ul>` : `<p class="empty">Nothing yet.</p>`}
        <a class="link sm" href="#/portal/audit">Full activity log</a></div>
      <div class="card"><span class="eyebrow">Systems</span><h2 class="sc-h2">${sys.every((x) => x[2][0] === "ok") ? "Everything running" : "Check these"}</h2>
        <ul class="sc-sys">${sys.map(([n, dt, [c, l]]) => `<li><span class="sc-dot ${c}" aria-hidden="true"></span><span class="sc-p-t"><b>${n}</b><span class="note">${esc(dt)}</span></span><span class="pill ${c === "warn" ? "now" : c}">${l}</span></li>`).join("")}</ul></div></section>`,
    { eyebrow: `Command centre · ${fmt(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
      actions: `<button class="btn ghost" data-act="sc-refresh">Refresh</button><a class="btn" href="#/portal/news">New announcement</a>` });
}

/* ---------- Super Admin: needs attention (everything waiting + every at-risk student) ---------- */
async function tabAttention() {
  const [d, R] = await Promise.all([ui.ov && Date.now() - (ui.ovAt || 0) < 6e4 ? ui.ov : rpc("super_overview"), rpc("super_risk")]);
  ui.ov = d; ui.ovAt = Date.now(); ui.attnN = d.queue.length;
  const rk = (x) => (/^Confidence/.test(x) ? "Low confidence" : x), has = (r, x) => r.reasons.some((y) => rk(y) === x);
  const f = ui.riskF || "", reasons = [...new Set(R.flatMap((r) => r.reasons.map(rk)))];
  const L = R.filter((r) => !f || has(r, f));
  shell("attention", "Needs attention", "Every decision that's waiting, and every student who needs a call this week.",
    `<section class="sc-2"><div class="card"><div class="sc-h"><div><span class="eyebrow">Decisions</span><h2>${d.queue.length} waiting</h2></div></div><ul class="sc-ql">${queueRows(d.queue, "all")}</ul></div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">At risk</span><h2>${R.length} student${R.length === 1 ? "" : "s"} to reach</h2></div></div>
        <div class="sc-tabs" role="group" aria-label="Filter by reason" style="margin-bottom:.6rem"><button class="sc-tab" data-act="risk-f" data-k="" aria-pressed="${!f}">All <span class="mono">${R.length}</span></button>${reasons.map((x) => `<button class="sc-tab" data-act="risk-f" data-k="${esc(x)}" aria-pressed="${f === x}">${esc(x)} <span class="mono">${R.filter((r) => has(r, x)).length}</span></button>`).join("")}</div>
        ${L.length ? `<ul class="sc-people">${L.map((r) => `<li><a href="#/portal/student/${r.id}"><span class="st-av">${staffIni(r.name)}</span><span class="sc-p-t"><b>${esc(r.name)}</b><span class="note">${esc(r.track || "")} · Week ${r.week} · last active ${r.last_at ? agoS(r.last_at) : "never"}</span>
          <span class="sc-tags">${r.reasons.map((x) => `<span class="pill bad">${esc(x)}</span>`).join("")}</span>${r.note ? `<span class="note sc-lastnote">Last note: ${esc(r.note)}</span>` : ""}</span></a></li>`).join("")}</ul>` : `<p class="empty">No one here.</p>`}</div></section>`,
    { actions: `<a class="btn ghost" href="#/portal/command">Command centre</a>` });
}

/* ---------- full student record ---------- */
const WK_ST = { pass: ["Passed", "ok"], fail: ["Failed", "bad"], grading: ["Waiting for grading", "info"], revise: ["Changes requested", "now"], open: ["In progress", "now"], locked: ["Not open", ""] };
async function tabStudent360(id) {
  const tab = ui.s360t || "overview";
  const [s, D] = await Promise.all([rpc("acad_student360", { p_app: id }), tab === "docs" ? rpc("acad_student_docs", { p_app: id }).catch(() => null) : null]); ui.s360 = s;
  const nm = `${s.first_name} ${s.surname}`, F = s.fees, risk = s.reasons.length > 0;
  const weeks = s.weeks.map((w) => ({ ...w, st: w.week > s.cur && w.state !== "pass" && !w.quiz && !w.proj ? "locked" : w.week === s.cur && w.state === "open" ? "open" : w.state }));
  const passed = weeks.filter((w) => w.st === "pass").length, avgs = weeks.filter((w) => w.avg != null).map((w) => w.avg), avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
  const failW = weeks.find((w) => w.st === "fail"), conf = s.checkins.slice(-8), last = conf.at(-1);
  const wa = (s.phone || "").replace(/\D/g, ""), att = s.attend.past ? Math.round((s.attend.yes / s.attend.past) * 100) : null;
  const tabs = [["overview", "Overview"], ["learning", "Learning"], ["payments", "Payments"], ["career", "Internship & career"], ["docs", "Documents & check-ins"], ["history", "History"]];
  const banner = [];
  if (s.failed_retake && failW) banner.push(`<div class="s3-dec"><div><b>Decision needed: Week ${failW.week} failed after the retake</b><span>Average ${failW.avg ?? "—"}% (assessment ${failW.quiz ?? "—"}%, project ${failW.proj ?? "—"}%)${last ? `. Last confidence check-in: ${last.conf} of 5` : ""}.</span></div>
    <div class="actions">${s.can.retake ? `<button class="btn sm" data-act="s3-retake" data-k="${failW.week}">Give one more retake</button>` : ""}<a class="btn sm ghost" href="#s3-note">Add a note</a></div></div>`);
  if (F.locked) banner.push(`<div class="s3-dec bad"><div><b>Learning paused: second instalment overdue</b><span>${naira(F.total - F.paid)} was due on ${fmtDateD(F.due_date)}. Home and Help stay open.</span></div>
    ${s.can.money ? `<div class="actions"><button class="btn sm" data-act="s3-remind">Send a reminder</button><a class="btn sm ghost" href="#s3-extend" data-act="s3-tab" data-k="payments">Give more time</a></div>` : ""}</div>`);
  const body = {
    overview: `<section class="card"><div class="sc-h"><div><span class="eyebrow">Progress</span><h2>Week ${s.cur} of ${weeks.length} · ${passed} passed${avg != null ? ` · average ${avg}%` : ""}</h2></div>
        <div class="s3-leg"><span><i class="ok"></i>Passed</span><span><i class="bad"></i>Failed</span><span><i class="now"></i>In progress</span><span><i class="lk"></i>Not open</span></div></div>
      <div class="hm-wrap"><div class="s3-weeks">${weeks.map((w) => `<span class="s3-w ${WK_ST[w.st][1] || "lk"}" title="Week ${w.week}${w.title ? `: ${esc(w.title)}` : ""} · ${WK_ST[w.st][0]}${w.avg != null ? ` · ${w.avg}%` : ""}"><small>W${w.week}</small><b class="mono">${w.avg != null ? w.avg : w.st === "pass" ? "✓" : w.st === "lk" || w.st === "locked" ? "·" : "…"}</b></span>`).join("")}</div></div>
      <p class="note" style="margin-top:.6rem">Now in <b>${STAGE_OF_WEEK(s.cur)}</b>${s.cal_week >= 1 ? ` · the cohort calendar is in Week ${s.cal_week}` : ""} · last active ${s.last_at ? agoS(s.last_at) : "never"}${s.account ? "" : " · <b>hasn't set up a portal account</b>"}</p></section>
    <section class="sc-3">
      <div class="card"><span class="eyebrow">Engagement</span><h2 class="sc-h2">${risk ? "Needs a check-in" : "Doing fine"}</h2>
        <div class="s3-mini"><div><span class="eyebrow">Live classes</span><b class="mono">${s.attend.past ? `${s.attend.yes}/${s.attend.past}` : "—"}</b><span class="note">${att != null ? att + "% attended" : "none held yet"}</span></div>
          <div><span class="eyebrow">Projects late</span><b class="mono">${s.ontime.late}/${s.ontime.n}</b><span class="note">submitted after Friday</span></div></div>
        <p class="s3-lbl">Weekly confidence check-in</p>${conf.length ? `<div class="s3-conf" role="img" aria-label="Confidence by week: ${conf.map((c) => c.conf).join(", ")}">${conf.map((c) => `<span><i class="${c.conf <= 2 ? "bad" : c.conf === 3 ? "now" : "ok"}" style="height:${c.conf * 20}%"></i><small>W${c.week}</small></span>`).join("")}</div>` : `<p class="note">No check-ins yet.</p>`}
        ${risk ? `<div class="sc-tags" style="margin-top:.6rem">${s.reasons.map((x) => `<span class="pill bad">${esc(x)}</span>`).join("")}</div>` : ""}</div>
      <div class="card"><span class="eyebrow">Admission</span><h2 class="sc-h2">${s.admission.score != null ? `Readiness ${s.admission.score}%` : "Admitted"}</h2>
        <dl class="s3-kv"><dt>Application</dt><dd class="mono">${esc(s.ref)}</dd><dt>Applied</dt><dd>${fmtDay(s.admission.applied)}</dd>${s.admission.digital != null ? `<dt>Scores</dt><dd>Digital ${s.admission.digital}% · communication ${s.admission.comms}%</dd>` : ""}
          ${s.admission.dc1_at ? `<dt>Discovery call</dt><dd>${fmtDay(s.admission.dc1_at)}${s.admission.officer ? ` · ${esc(s.admission.officer)}` : ""}</dd>` : ""}${s.admission.dc1_note ? `<dt>Call note</dt><dd class="s3-q">“${esc(s.admission.dc1_note)}”</dd>` : ""}
          <dt>Background</dt><dd>${esc([s.admission.edu, s.admission.situation].filter(Boolean).join(" · "))}</dd>${s.admission.admitted_at ? `<dt>Admitted</dt><dd>${fmtDay(s.admission.admitted_at)}</dd>` : ""}</dl></div>
      <div class="card"><span class="eyebrow">Fees</span><h2 class="sc-h2">${F.plan === "two" ? "Paying in 2 instalments" : "Paid in full"}</h2>
        <dl class="s3-kv"><dt>Total</dt><dd class="mono">${naira(F.total)}</dd><dt>Paid</dt><dd class="mono">${naira(F.paid)}</dd>${F.total > F.paid ? `<dt>Balance</dt><dd><span class="pill ${F.locked ? "bad" : "now"}">${naira(F.total - F.paid)}</span></dd><dt>Due</dt><dd>${fmtDateD(F.due_date)}${F.extended ? " · extended" : ""}</dd>` : `<dt>Balance</dt><dd><span class="pill ok">Nothing owed</span></dd>`}</dl></div></section>
    <section class="sc-2b">
      <div class="card"><span class="eyebrow">Support team</span><h2 class="sc-h2">Who looks after ${esc(s.first_name)}</h2>
        <ul class="sc-people">${s.pod ? `<li><span class="sc-li"><span class="st-av">PD</span><span class="sc-p-t"><b>${esc(s.pod.name)}</b><span class="note">Pod · ${s.pod.n} students</span></span></span></li>` : `<li><span class="sc-li"><span class="sc-p-t"><b>Not in a pod yet</b><a class="link sm" href="#/portal/pods">Assign a pod</a></span></span></li>`}
          ${s.team.map((p) => `<li><span class="sc-li"><span class="st-av">${staffIni(p.name)}</span><span class="sc-p-t"><b>${esc(p.name)}</b><span class="note">${ROLE_NAMES[p.role] || p.role}</span></span></span></li>`).join("")}</ul></div>
      <div class="card" id="s3-note"><div class="sc-h"><div><span class="eyebrow">Notes</span><h2>Private staff notes</h2></div><span class="note">Students never see these</span></div>
        <form class="form" id="s3-note-form" novalidate><label class="sr-only" for="s3-note-t">Add a note</label><textarea id="s3-note-t" rows="2" maxlength="3000" placeholder="e.g. Called her. She works night shifts this month and will catch up at weekends."></textarea><div><button class="btn sm" type="submit">Add note</button></div></form>
        ${["cohort_manager", "facilitator", "coach", "academy_admin", "super"].includes(ME.role) ? `<details class="s3-esc"><summary class="link sm">Send a decision to the Programme Director</summary><form class="form" id="s3-esc-form" novalidate>
          <div class="grid2"><div class="field"><label for="s3e-k">What kind</label><select id="s3e-k"><option value="retake">One more retake</option><option value="deferral">Move to the next cohort</option><option value="extension">Deadline extension</option><option value="appeal">Grade appeal</option><option value="withdrawal">Withdrawal</option><option value="other">Something else</option></select></div>
            <div class="field"><label for="s3e-t">In one line</label><input id="s3e-t" maxlength="200" placeholder="e.g. One more Week ${s.cur} retake for ${esc(s.first_name)}"></div></div>
          <div class="field"><label for="s3e-d">Why</label><textarea id="s3e-d" rows="2" placeholder="What happened and what you recommend"></textarea></div><div><button class="btn sm" type="submit">Send</button></div></form></details>` : ""}
        ${s.notes.length ? `<ul class="sc-act">${s.notes.map((n) => `<li><span class="mono note">${fmtDay(n.at)}</span><span>${lines(n.body)}<small class="note" style="display:block">${esc(n.by)} · ${agoS(n.at)} <button class="link sm" data-act="s3-note-del" data-k="${n.id}">Delete</button></small></span></li>`).join("")}</ul>` : `<p class="empty">No notes yet.</p>`}</div></section>`,
    learning: `<section class="card"><div class="sc-h"><div><span class="eyebrow">Learning</span><h2>Every week, every score</h2></div><span class="note">Assessments have one attempt, no resits. <a class="link" href="#/portal/results/${s.id}">Full result →</a></span></div>
      <div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Week</th><th>Assessment</th><th>Week project</th><th>Average</th><th>Attempts</th><th>Status</th><th></th></tr></thead><tbody>
      ${weeks.map((w) => `<tr><td data-label="Week"><b>Week ${w.week}</b><span class="note" style="display:block">${esc(w.title || STAGE_OF_WEEK(w.week))}</span></td><td data-label="Assessment" class="mono">${w.quiz != null ? w.quiz + "%" : "—"}</td><td data-label="Project" class="mono">${w.proj != null ? w.proj + "%" : "—"}</td>
        <td data-label="Average" class="mono"><b>${w.avg != null ? w.avg + "%" : "—"}</b></td><td data-label="Attempts" class="mono">${w.attempt || (w.quiz != null ? 1 : "—")}${w.repeats ? ` · repeated ${w.repeats - 1}×` : ""}</td>
        <td data-label="Status"><span class="pill ${WK_ST[w.st][1]}">${WK_ST[w.st][0]}</span></td><td>${w.st === "fail" && s.can.retake ? `<button class="btn sm ghost" data-act="s3-retake" data-k="${w.week}">One more retake</button>` : ""}</td></tr>`).join("")}</tbody></table></div></section>`,
    payments: `<section class="sc-2"><div class="card"><div class="sc-h"><div><span class="eyebrow">Payments</span><h2>${naira(F.paid)} paid${F.total > F.paid ? ` · ${naira(F.total - F.paid)} to pay` : " · nothing owed"}</h2></div></div>
        ${s.payments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>What</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>${s.payments.map((y) => `<tr><td>${fmtDay(y.at)}</td><td>${{ full: "Full fee", part1: "1st instalment", part2: "2nd instalment" }[y.part] || esc(y.part || "")}${y.by ? `<span class="note" style="display:block">recorded by ${esc(y.by)}</span>` : ""}</td><td class="mono">${naira(y.amount)}</td><td class="mono">${esc(y.reference || "")}</td><td><span class="pill ${y.status === "success" ? "ok" : y.status === "failed" ? "bad" : ""}">${y.status === "success" ? "Confirmed" : esc(y.status)}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No payments yet.</p>`}</div>
      ${F.plan === "two" && F.total > F.paid && s.can.money ? `<form class="card form" id="s3-extend" novalidate><span class="eyebrow">Second instalment</span><h2 class="sc-h2">Give more time to pay</h2><p class="note">Due ${fmtDateD(F.due_date)}${F.extended ? " (already extended)" : ""}. A new date opens their learning straight away and sends them an alert.</p>
        <div class="field"><label for="s3-date">New due date</label><input id="s3-date" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${F.extended ? F.due_date : ""}"></div><p class="err" id="s3-ext-err" role="alert"></p>
        <div class="actions"><button class="btn sm" type="submit">Save new date</button>${F.extended ? `<button class="btn sm ghost" type="button" data-act="s3-unextend">Remove extension</button>` : ""}<button class="btn sm ghost" type="button" data-act="s3-remind">Send a reminder</button></div></form>` : ""}</section>`,
    career: `<section class="sc-2"><div class="card"><span class="eyebrow">Internship · Weeks 15–18</span>${s.placement ? `<h2 class="sc-h2">${esc(s.placement.role)} at ${esc(s.placement.org)}</h2><dl class="s3-kv"><dt>Supervisor</dt><dd>${esc(s.placement.sup_name || "—")}${s.placement.sup_email ? ` · <a href="mailto:${esc(s.placement.sup_email)}">${esc(s.placement.sup_email)}</a>` : ""}</dd><dt>Evaluation</dt><dd>${s.eval ? `Received${s.eval.overall ? ` · ${esc(String(s.eval.overall))}` : ""}` : "Not yet"}</dd></dl>`
        : `<h2 class="sc-h2">Not placed yet</h2><p class="note">Placements are matched before Week 15.</p><a class="btn sm" href="#/portal/intern">Assign a placement</a>`}</div>
      <div class="card"><span class="eyebrow">Career</span><h2 class="sc-h2">${s.outcome ? `Now: ${esc({ hired: "Employed", internship: "Internship", freelance: "Freelancing", study: "Studying", searching: "Still searching" }[s.outcome.status] || s.outcome.status)}` : "Career goals"}</h2>
        <dl class="s3-kv"><dt>Aiming for</dt><dd>${esc(s.career?.role || "—")}</dd><dt>Industries</dt><dd>${esc(s.career?.interests || "—")}</dd><dt>Discovery Call</dt><dd>${s.call2 ? `Scored ${s.call2.score}/10` : "Not yet"}</dd><dt>Applications</dt><dd>${s.apps_n || 0} tracked</dd>
          ${s.outcome?.company ? `<dt>Company</dt><dd>${esc(s.outcome.company)}${s.outcome.role ? ` · ${esc(s.outcome.role)}` : ""}</dd>` : ""}<dt>Certificate</dt><dd>${s.cert_id ? `<a class="link" href="#/certificate/${esc(s.cert_id)}" target="_blank" rel="noopener">${esc(s.cert_id)}</a>` : "Not issued"}</dd></dl></div></section>`,
    docs: D ? `<section class="sc-2"><div class="card"><span class="eyebrow">Documents</span><h2 class="sc-h2">${esc(s.first_name)}'s documents</h2>
        <ul class="sc-act">${[
          D.letter ? ["Admission letter", `<a class="btn sm ghost" href="${esc(D.letter)}" target="_blank" rel="noopener">Open</a>`] : null,
          ["Certificate of completion", D.cert_id ? `<a class="btn sm ghost" href="#/certificate/${esc(D.cert_id)}" target="_blank" rel="noopener">${esc(D.cert_id)}</a>` : `<span class="pill">Not issued</span>`],
          ["Internship certificate", D.intern_cert ? `<a class="btn sm ghost" href="#/certificate/${esc(D.intern_cert)}" target="_blank" rel="noopener">${esc(D.intern_cert)}</a>` : `<span class="pill">After the host's evaluation</span>`],
          ["CV", D.cv ? `<button class="btn sm ghost" data-act="s3-cv">View CV</button>` : `<span class="pill">Not started</span>`],
          ["Elevator pitch", D.pitch ? `<span class="note">${(() => { const t = [D.pitch.a, D.pitch.b, D.pitch.c].filter(Boolean).join(" "); return esc(t.length > 160 ? t.slice(0, 157).trimEnd() + "…" : t); })()}</span>` : `<span class="pill">Not started</span>`]].filter(Boolean)
          .map(([l, v]) => `<li><span style="flex:1"><b>${l}</b></span>${v}</li>`).join("")}</ul>
        ${D.cv && ui.s3cv ? `<div style="margin-top:.8rem">${cvPreview(D.cv)}</div>` : ""}
        <h3 style="margin:1.2rem 0 .4rem">Payment receipts</h3>${D.payments.length ? `<ul class="sc-act">${D.payments.map((y) => `<li><span class="mono note">${fmtDay(y.at)}</span><span>${naira(y.amount)} · ${{ full: "Full fee", part1: "1st instalment", part2: "2nd instalment" }[y.part] || esc(y.part || "")}<small class="note" style="display:block">Reference ${esc(y.reference || "")}</small></span></li>`).join("")}</ul>` : `<p class="empty">No payments yet.</p>`}</div>
      <div class="stack"><div class="card"><span class="eyebrow">Submitted work</span><h2 class="sc-h2">${D.work.length} link${D.work.length === 1 ? "" : "s"}</h2>
        ${D.work.length ? `<ul class="sc-act">${D.work.map((w) => `<li><span class="mono note">W${w.week}</span><span><a class="link" href="${esc(w.link)}" target="_blank" rel="noopener">${esc(w.title)}</a><small class="note" style="display:block">${w.status === "graded" ? `Graded ${w.score}%` : w.status === "revise" ? "Changes requested" : "Submitted"} · ${fmtDay(w.at)}</small></span></li>`).join("")}</ul>` : `<p class="empty">Nothing submitted yet.</p>`}</div>
        <div class="card"><span class="eyebrow">After the programme</span><h2 class="sc-h2">30, 60 and 90-day check-ins</h2>
          <ul class="sc-act">${[30, 60, 90].map((d) => { const c = D.checkins.find((x) => x.day === d); return `<li><b class="mono" style="width:44px;flex:none">${d}d</b><span>${c ? `${esc(OUT_L[c.status] || c.status)}${c.note ? ` · “${esc(c.note)}”` : ""}<small class="note" style="display:block">${fmtDay(c.at)}</small>` : `<span class="note">Not answered yet</span>`}</span></li>`; }).join("")}</ul>
          ${D.survey ? `<p style="margin-top:.6rem"><b>Exit survey:</b> would recommend ${D.survey.recommend}/10${D.survey.testimonial ? ` · “${esc(D.survey.testimonial)}”` : ""}</p>` : ""}</div>
        <div class="card"><span class="eyebrow">Calls from staff</span><h2 class="sc-h2">${D.calls.length} logged</h2>${D.calls.length ? `<ul class="sc-act">${D.calls.slice(0, 8).map((k) => `<li><span class="mono note">${fmtDay(k.at)}</span><span>${k.outcome === "reached" ? "Reached" : "No answer"}${k.note ? ` · ${esc(k.note)}` : ""}<small class="note" style="display:block">${esc(k.by)}</small></span></li>`).join("")}</ul>` : ""}</div></div></section>` : `<div class="card"><p class="empty">Documents couldn't load.</p></div>`,
    history: `<section class="card"><span class="eyebrow">History</span><h2 class="sc-h2">Everything on ${esc(s.first_name)}'s record</h2>${s.history.length ? `<ul class="sc-act">${s.history.slice(0, 120).map((h) => `<li><span class="mono note">${fmt(h.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span><span>${esc(h.text)}${h.by ? `<small class="note"> · ${esc(h.by)}</small>` : ""}</span><span class="pill info">${esc(h.kind)}</span></li>`).join("")}</ul>` : `<p class="empty">Nothing yet.</p>`}</section>` };
  shell("student", esc(nm), "", `<section class="card s3-head"><div class="s3-id">${s.photo ? `<img class="s3-av" src="${esc(s.photo)}" alt="">` : `<span class="s3-av">${staffIni(nm)}</span>`}
      <div class="s3-who"><div class="s3-pills">${risk ? `<span class="pill bad">At risk</span>` : ""}<span class="pill ${F.locked ? "bad" : "ok"}">${F.locked ? "Learning paused" : s.status === "Admitted" ? "Active" : esc(s.status)}</span>${s.cert_id ? `<span class="pill gold">Graduated</span>` : ""}</div>
        <p class="s3-meta"><b class="mono">${esc(s.matric || s.ref)}</b><span>${esc(s.track || "")}</span><span>${esc(s.cohort)}</span>${s.pod ? `<span>Pod: ${esc(s.pod.name)}</span>` : ""}${s.city ? `<span>${esc(s.city)}</span>` : ""}</p>
        <p class="s3-meta note"><a href="mailto:${esc(s.email)}">${esc(s.email)}</a>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : ""}<span>Last active ${s.last_at ? agoS(s.last_at) : "never"}</span></p></div>
      <div class="actions s3-btns">${wa ? `<a class="btn ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}<a class="btn ghost" href="mailto:${esc(s.email)}">Email</a><a class="btn" href="#s3-note">Add note</a></div></div>
    <div class="s3-tabs" role="tablist" aria-label="Student sections">${tabs.map(([k, l]) => `<button role="tab" class="s3-tab" data-act="s3-tab" data-k="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div></section>
    ${banner.join("")}${body[tab]}`,
    { eyebrow: `<a class="link" href="#/portal/${ME.role === "super" ? "command" : "students"}">${ME.role === "super" ? "Command centre" : "Students"}</a> / <a class="link" href="#/portal/students">Students</a> / ${esc(nm)}` });
}

/* ================= role home pages ================= */
const hello = (n) => { const h = +fmt(new Date(), { hour: "numeric", hour12: false }); return `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${esc((n || "").split(" ")[0])}`; };
const todayEyebrow = (l) => `${l} · ${fmt(new Date(), { weekday: "long", day: "numeric", month: "long" })}`;
const kpiBox = (l, v, n, extra = "", href = "") => `<${href ? `a href="${href}"` : "div"} class="card sc-kpi"><span class="eyebrow">${l}</span><b class="mono">${v}</b>${n ? `<span class="note">${n}</span>` : ""}${extra}</${href ? "a" : "div"}>`;
const miniStat = (l, v, cls = "") => `<div class="rh-mini"><span class="eyebrow">${l}</span><b class="mono ${cls}">${v}</b></div>`;
const waLink = (p) => p ? `https://wa.me/${String(p).replace(/\D/g, "").replace(/^0/, "234")}` : "";
const ini = (n) => staffIni(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
function target(label, value, pctV, goal, note) {
  const ok = pctV != null && pctV >= goal;
  return `<div class="card sc-kpi"><span class="eyebrow">${label}</span><div class="rh-tv"><b class="mono">${value}</b>${pctV == null ? `<span class="pill">Not yet</span>` : `<span class="pill ${ok ? "ok" : "now"}">${ok ? "On target" : "Below target"}</span>`}</div>
    <div class="rh-target" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pctV || 0))}%" class="${ok ? "" : "warn"}"></i><b style="left:${goal}%"></b></div><span class="note">${note}</span></div>`;
}

/* ---------- Programme Director: programme health ---------- */
const ESC_KIND = { retake: "Retake", deferral: "Deferral", extension: "Deadline", appeal: "Grade appeal", withdrawal: "Withdrawal", other: "Other" };
async function tabHealth() {
  const d = await rpc("director_home"), C = d.cohort, A = d.ahead, onCourse = A.on + A.ahead, open = d.escalations.filter((e) => e.status === "open");
  const m = ui.dm || "pass", ML = { pass: "Pass rate", score: "Average score", att: "Attendance" };
  const bars = (arr) => `<div class="rh-spark" aria-hidden="true">${(arr || []).map((v) => `<i style="height:${v == null ? 4 : Math.max(8, v)}%" class="${v == null ? "na" : v < 70 ? "bad" : v < 85 ? "warn" : ""}"></i>`).join("")}</div>`;
  const F = d.feel || {}, fmax = Math.max(1, F.c1 || 0, F.c2 || 0, F.c3 || 0, F.c4 || 0, F.c5 || 0);
  const behind = A.behind1 + A.behind2, fmaxN = Math.max(1, A.behind2, A.behind1, A.on, A.ahead);
  shell("health", hello(d.me), `${esc(C.name)} · ${C.week < 1 ? `starts ${fmtDateD(C.start_date)}` : `Week ${C.week} of ${C.weeks || 20} (${STAGE_OF_WEEK(C.week)})`}. ${d.pass_rate != null ? `<b>${d.pass_rate}%</b> of final results are Pass or better${d.pass_rate >= 80 ? ", above" : ", below"} the 80% target.` : ""} ${open.length ? `${open.length} decision${open.length === 1 ? " is" : "s are"} waiting for you.` : "Nothing is waiting for you."}`,
    `<section class="sc-kpis">${target("Pass rate (final results)", d.pass_rate != null ? d.pass_rate + "%" : "—", d.pass_rate, 80, `Target 80% Pass or better${d.pass_last != null ? ` · average assessments ${d.pass_last}/40` : ""}`)}
      ${target("On course to graduate", d.students ? pct(onCourse, d.students) + "%" : "—", pct(onCourse, d.students), 85, `${onCourse} of ${d.students} students · target 85%`)}
      ${target("Live class attendance", d.attend != null ? d.attend + "%" : "—", d.attend, 85, "Target 85%")}
      ${target("Graded within 2 days", d.grading_fast != null ? d.grading_fast + "%" : "—", d.grading_fast, 90, "Target 90%")}
      ${target("In work 90 days after", d.in_work != null ? d.in_work + "%" : "—", d.in_work, 70, "Target 70% · measured after Week 20")}</section>
    <section class="sc-2">
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Escalated to you</span><h2>${open.length} decision${open.length === 1 ? "" : "s"} waiting</h2></div><span class="note">Cohort Managers, facilitators and coaches send these up from a student's page.</span></div>
        ${d.escalations.length ? `<ul class="sc-ql">${d.escalations.map((e) => `<li class="sc-q"><span class="st-av">${ini(e.name || e.by)}</span><div class="sc-q-t"><div class="sc-q-h"><b>${esc(e.title)}</b><span class="pill info">${ESC_KIND[e.kind] || e.kind}</span></div>
          ${e.detail ? `<span class="note">${esc(e.detail)}</span>` : ""}<span class="sc-q-m">Raised by <b>${esc(e.by)}</b> · ${agoS(e.at)}${e.app ? ` · <a class="link" href="#/portal/student/${e.app}">Student record</a>` : ""}</span></div>
          <div class="sc-q-a">${e.status === "open" ? `<div class="actions"><button class="btn sm" data-act="esc-yes" data-k="${e.id}">${e.kind === "retake" ? "Give the retake" : "Approve"}</button><button class="btn sm ghost" data-act="esc-no" data-k="${e.id}">Decline</button></div>` : `<span class="pill ${e.status === "approved" ? "ok" : ""}">${e.status === "approved" ? "Approved" : "Declined"}</span>`}</div></li>`).join("")}</ul>` : `<p class="empty">Nothing has been escalated. 🎉</p>`}</div>
      <div class="card"><span class="eyebrow">Graduation forecast</span><h2 class="sc-h2">${onCourse} of ${d.students} on course to graduate</h2><p class="note">Students by how far ahead or behind the cohort calendar they are.</p>
        <div class="rh-fc" role="img" aria-label="${A.behind2} two or more weeks behind, ${A.behind1} one week behind, ${A.on} on the week, ${A.ahead} ahead">${[["2+ weeks behind", A.behind2, "bad"], ["1 week behind", A.behind1, "warn"], ["On the week", A.on, ""], ["Ahead", A.ahead, "ok2"]].map(([l, n, c]) => `<div><b class="mono">${n}</b><i class="${c}" style="height:${Math.max(6, (n / fmaxN) * 120)}px"></i><span class="note">${l}</span></div>`).join("")}</div>
        ${behind ? `<div class="actions" style="margin-top:.8rem"><a class="btn sm ghost" href="#/portal/students">See students</a><a class="btn sm ghost" href="#/portal/sessions">Plan a catch-up session</a></div>` : ""}</div></section>
    <section class="card"><div class="sc-h"><div><span class="eyebrow">Tracks side by side</span><h2>Where to put your attention</h2></div>
        <div class="sc-tabs" role="group" aria-label="Measure">${Object.entries(ML).map(([k, l]) => `<button class="sc-tab" data-act="dm" data-k="${k}" aria-pressed="${m === k}">${l}</button>`).join("")}</div></div>
      <div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Track</th><th>Students</th><th>${ML[m]} by week</th><th>Average score</th><th>Projects on time</th><th>Waiting for grading</th><th>Grading turnaround</th><th>Facilitator</th></tr></thead><tbody>
        ${d.tracks.map((t) => { const s = t[m] || [], now = s.filter((v) => v != null).at(-1);
          return `<tr><td data-label="Track"><b>${esc(t.name)}</b></td><td data-label="Students" class="mono">${t.n}</td><td data-label="${ML[m]}">${bars(s)}<span class="note mono">${now != null ? `now ${now}%` : "—"}</span></td>
            <td data-label="Average" class="mono">${t.avg != null ? t.avg + "%" : "—"}</td><td data-label="On time" class="mono">${t.ontime != null ? t.ontime + "%" : "—"}</td><td data-label="Waiting" class="mono">${t.waiting}</td>
            <td data-label="Turnaround">${t.turn != null ? `<span class="pill ${t.turn > 2 ? "bad" : t.turn > 1.5 ? "now" : "ok"}">${t.turn} days</span>` : `<span class="note">—</span>`}</td><td data-label="Facilitator">${t.fac ? esc(t.fac) : `<span class="pill bad">None</span>`}</td></tr>`; }).join("")}</tbody></table></div></section>
    <section class="sc-2b">
      <div class="card"><span class="eyebrow">Hardest content lately</span><h2 class="sc-h2">Questions most students miss</h2>
        ${d.hard.length ? `<ul class="sc-act">${d.hard.map((h) => `<li><b class="mono rh-bad" style="width:52px;flex:none">${h.wrong}%</b><span><b>${esc(h.q)}</b><small class="note" style="display:block">${esc(h.track || "")} · Week ${h.week} assessment · ${h.n} answers</small></span></li>`).join("")}</ul><p class="note">Share these with facilitators, or cover them in a live class.</p>` : `<p class="empty">Not enough assessment answers yet.</p>`}</div>
      <div class="card"><span class="eyebrow">How students feel</span><h2 class="sc-h2">${F.n ? `Confidence ${F.avg} of 5` : "No check-ins yet"}</h2>${F.n ? `<p class="note">From the latest weekly check-in · ${F.n} answers.</p>
        <div class="rh-feel">${[[5, "5 · very sure", "c5"], [4, "4", "c4"], [3, "3", "c3"], [2, "2", "c2"], [1, "1 · lost", "c1"]].map(([k, l, c]) => `<div><span>${l}</span><div class="sc-meter"><i class="${c}" style="width:${(F["c" + k] / fmax) * 100}%"></i></div><b class="mono">${F["c" + k]}</b></div>`).join("")}</div>
        ${d.notes.length ? `<p style="margin-top:.8rem">“${esc(d.notes[0])}” <span class="note">· latest check-in note</span></p>` : ""}` : ""}</div></section>`,
    { eyebrow: todayEyebrow("Programme health"), actions: `<a class="btn ghost" href="#/portal/outcomes">Outcomes</a><a class="btn" href="#/portal/news">New announcement</a>` });
}

/* ---------- Cohort Manager: today ---------- */
async function tabToday() {
  const d = ui.cm = await rpc("cm_home"), C = d.cohort, today = new Date().toDateString();
  const calledToday = (c) => c.call && new Date(c.call.at).toDateString() === today;
  const left = d.calls.filter((c) => !calledToday(c)).length, dueIn = d.due.reduce((t, x) => t + x.in, 0), dueN = d.due.reduce((t, x) => t + x.n, 0);
  const sessT = d.sessions.filter((s) => new Date(s.at).toDateString() === today), quiet = d.pods.filter((p) => p.n && p.active / p.n < 0.5);
  shell("today", hello(d.me), `<b>${left} student${left === 1 ? "" : "s"} to call</b>, ${sessT.length} live class${sessT.length === 1 ? "" : "es"} today and ${d.help.length} help request${d.help.length === 1 ? "" : "s"} waiting.${dueN - dueIn > 0 ? ` ${dueN - dueIn} students haven't submitted this week's project.` : ""}`,
    `<section class="sc-2"><div class="card"><div class="sc-h"><div><span class="eyebrow">Call list</span><h2>Students to reach</h2></div><span class="pill ok">${d.calls.length - left} of ${d.calls.length} logged today</span></div>
        <p class="note">Most urgent first. Log each call so the team sees it on the student's record.</p>
        ${d.calls.length ? `<ul class="sc-ql">${d.calls.slice(0, ui.cmAll ? 999 : 8).map((c) => `<li class="sc-q"><span class="st-av">${ini(c.name)}</span><div class="sc-q-t"><div class="sc-q-h"><a class="link" href="#/portal/student/${c.id}"><b>${esc(c.name)}</b></a><span class="note">${esc(c.track || "")} · Week ${c.week}</span></div>
            <span class="sc-tags">${c.reasons.map((r) => `<span class="pill bad">${esc(r)}</span>`).join("")}</span>
            ${c.note ? `<span class="note">Last note: ${esc(c.note)}</span>` : ""}${c.call ? `<span class="sc-q-m">Last call: ${c.call.outcome === "reached" ? "reached" : "no answer"} · ${agoS(c.call.at)} · ${esc(c.call.by)}</span>` : ""}</div>
          <div class="sc-q-a">${calledToday(c) ? `<span class="pill ${c.call.outcome === "reached" ? "ok" : "now"}">${c.call.outcome === "reached" ? "Reached" : "No answer · try tomorrow"}</span>`
            : `<div class="actions">${c.phone ? `<a class="btn sm ghost" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}<button class="btn sm ghost" data-act="cm-call" data-k="${c.id}" data-v="no_answer">No answer</button><button class="btn sm" data-act="cm-call" data-k="${c.id}" data-v="reached">Reached</button></div>`}</div></li>`).join("")}</ul>${d.calls.length > 8 ? `<button class="btn sm ghost" data-act="cm-all" style="margin-top:.6rem">${ui.cmAll ? "Show the 8 most urgent" : `Show all ${d.calls.length}`}</button>` : ""}` : `<p class="empty">No one needs a call right now. 🎉</p>`}</div>
      <div class="stack">
        <div class="card"><span class="eyebrow">Live classes</span><h2 class="sc-h2">${d.sessions.length ? `${sessT.length} today${d.sessions.length > sessT.length ? `, ${d.sessions.length - sessT.length} tomorrow` : ""}` : "None today or tomorrow"}</h2>
          ${d.sessions.length ? `<ul class="sc-act">${d.sessions.map((s) => `<li><span class="mono" style="width:56px;flex:none"><b>${fmt(s.at, { hour: "2-digit", minute: "2-digit", hour12: false })}</b><small class="note" style="display:block">${new Date(s.at).toDateString() === today ? "today" : "tomorrow"}</small></span><span><b>${esc(s.title)}</b><small class="note" style="display:block">${esc(s.track || "Everyone")}${s.host ? ` · ${esc(s.host)}` : ""} · ${s.minutes} min · ${s.joined}/${s.invited} joined</small></span>${s.link ? `<a class="btn sm ghost" href="${esc(s.link)}" target="_blank" rel="noopener">Open</a>` : `<span class="pill bad">No link</span>`}</li>`).join("")}</ul>` : ""}
          <a class="link sm" href="#/portal/sessions">All sessions and attendance</a></div>
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Due ${fmtDay(d.due_at)}, 17:00</span><h2>Week ${Math.max(C.week, 1)} project</h2></div><b class="mono">${dueIn}/${dueN}</b></div>
          <div class="sc-seats">${d.due.map((x) => `<div><span>${esc(x.track)}</span>${meter(pct(x.in, x.n))}<b class="mono">${x.in}/${x.n}</b></div>`).join("")}</div>
          <div class="actions" style="margin-top:.8rem"><a class="btn sm" href="#/portal/news">Post a reminder</a></div></div>
      </div></section>
    <section class="sc-3">
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Help requests</span><h2>${d.help.length} waiting</h2></div><a class="btn sm ghost" href="#/portal/support">Open all</a></div>
        ${d.help.length ? `<ul class="sc-act">${d.help.slice(0, 6).map((h) => { const late = Date.now() - new Date(h.at) > 864e5; return `<li><span class="sc-dot ${late ? "bad" : "warn"}" aria-hidden="true"></span><span><b>${esc(h.subject)}</b><small class="note" style="display:block">${esc(h.name)} · ${esc(h.category)} · ${agoS(h.at)}</small></span></li>`; }).join("")}</ul>` : `<p class="empty">All answered.</p>`}</div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Pods</span><h2>${quiet.length ? `${quiet.length} pod${quiet.length === 1 ? " has" : "s have"} gone quiet` : "Pods look active"}</h2></div><a class="btn sm ghost" href="#/portal/pods">Manage</a></div>
        ${d.unpodded ? `<p class="note"><b>${d.unpodded}</b> student${d.unpodded === 1 ? " isn't" : "s aren't"} in a pod yet.</p>` : ""}
        ${d.pods.length ? `<ul class="sc-act">${d.pods.slice(0, 8).map((p) => { const r = pct(p.active, p.n) ?? 0; return `<li><span style="flex:1"><b>${esc(p.name)}</b><small class="note" style="display:block">${p.n} students · ${p.active} active this week</small></span>${meter(r, r < 50 ? "warn" : "")}<span class="pill ${r < 50 ? "bad" : "ok"}">${r < 50 ? "Quiet" : "Active"}</span></li>`; }).join("")}</ul>` : `<p class="empty">No pods yet.</p>`}</div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Alumni check-ins</span><h2>${d.checkins_due.length ? `${d.checkins_due.length} graduate${d.checkins_due.length === 1 ? "" : "s"} to nudge` : "None due"}</h2></div><a class="btn sm ghost" href="#/portal/outcomes">Outcomes</a></div>
        <p class="note">30, 60 and 90 days after the programme. These are open but not answered yet.</p>
        ${d.checkins_due.length ? `<ul class="sc-act">${d.checkins_due.slice(0, 8).map((x) => `<li><span style="flex:1"><a class="link" href="#/portal/student/${x.id}"><b>${esc(x.name)}</b></a><small class="note" style="display:block">${x.day}-day check-in · open since ${fmtDay(x.opened)}</small></span>${x.phone ? `<a class="btn sm ghost" href="${waLink(x.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</li>`).join("")}</ul>` : ""}</div></section>
    <form class="card form" id="cm-news" novalidate><span class="eyebrow">Announcement</span><h2 class="sc-h2">Tell the cohort something</h2>
      <div class="grid2"><div class="field"><label for="cmn-t">Title</label><input id="cmn-t" maxlength="120" placeholder="e.g. Week ${Math.max(C.week, 1)} project: extra office hours on Thursday"></div>
        <div class="field"><label for="cmn-to">Who sees it</label><select id="cmn-to"><option value="">Everyone in ${esc(C.name)}</option>${(d.due || []).map((x) => `<option value="${x.code}">${esc(x.track)} only</option>`).join("")}</select></div></div>
      <div class="field"><label for="cmn-b">Message</label><textarea id="cmn-b" rows="3" placeholder="Students see it on Home, as a portal alert, and by email if ticked."></textarea></div>
      <label class="consent"><input type="checkbox" id="cmn-e" checked> Also email it</label><p class="err" id="cmn-err" role="alert"></p><div><button class="btn" type="submit">Post now</button></div></form>`,
    { eyebrow: todayEyebrow("Today"), actions: `<a class="btn ghost" href="#/portal/discussion">Discussion</a><a class="btn" href="#cm-news">New announcement</a>` });
}

/* ---------- Results, examinations and grading (Programme & Grading Policy) ---------- */
const RES_ST = (r) => r.status === "Complete" ? (r.class ? `<span class="pill ${r.grade === "F" ? "bad" : "ok"}">${esc(r.class)}</span>` : `<span class="pill ok">Complete</span>`) : `<span class="pill now" title="${esc((r.missing || []).join(" · "))}">Pending</span>`;
const m1 = (n) => n == null ? "—" : String(Math.round(n * 10) / 10);
function resultsCsv(d) {
  const S = d.students, aT = (S[0]?.result.assessments || []).map((x, i) => `A${i + 1} (wk ${x.week}) /4`);
  const head = ["Matric", "Name", "Track", ...aT, "Assessments /40", "Fundamental /30", "Core /40", "Examinations /60", "Project /100", "Final /100", "Grade", "Classification", "Status", "Missing"];
  const q = (v) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = S.map((s) => { const r = s.result; return [s.matric, s.name, d.tracks[s.track] || s.track || "", ...r.assessments.map((x) => x.marks ?? (x.status === "Missed" ? 0 : "")),
    r.assess_score, r.fund.score ?? "", r.core.score ?? "", r.exam_score ?? "", r.project.score ?? "", r.final ?? "", r.grade ?? "", r.class ?? "", r.status, (r.missing || []).join("; ")]; });
  const csv = [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = `jobnest-results-${(d.cohort.name || "cohort").replace(/[^A-Za-z0-9]+/g, "-")}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function tabResults() {
  const d = await rpc("acad_results", { p_cohort: ui.resCohort || null }); ui.res = d;
  const S = d.students, f = ui.resF || {}, q = (f.q || "").toLowerCase();
  const L = S.filter((s) => (!f.track || s.track === f.track) && (!f.st || (f.st === "pending" ? s.result.status === "Pending" : f.st === "missed" ? [s.result.fund.status, s.result.core.status].includes("Missed") : f.st === "ungraded" ? s.result.project.status === "Submitted" : s.result.grade === f.st))
    && (!q || (s.name + " " + s.matric).toLowerCase().includes(q)));
  const done = S.filter((s) => s.result.status === "Complete"), cnt = (g) => done.filter((s) => s.result.grade === g).length;
  const pub = d.published;
  shell("results", "Results", `${esc(d.cohort.name)} · examination week starts ${fmtDateD(d.cohort.exam_monday)}. Final score = (assessments /40 + examinations /60 + project /100) ÷ 2.`,
    `<section class="sc-kpis sc-kpis4">${kpiBox("Complete", `${done.length}<small>/${S.length}</small>`, "every score in")}${kpiBox("Pending", S.length - done.length, "missing or ungraded scores")}${kpiBox("Distinction · Merit", `${cnt("A")} · ${cnt("B")}`, "")}${kpiBox("Pass · Fail", `${cnt("C")} · ${cnt("F")}`, "")}</section>
    <div class="card"><div class="sc-h"><div><span class="eyebrow">Publishing</span><h2>${pub ? `Published ${fmtDay(pub.at)} by ${esc(pub.by)}` : "Not published"}</h2><span class="note">${pub ? "Students see their final score and classification. Changes now need the Programme Director or Super Admin." : "Students see their component scores now. Their final score and classification appear when you publish. Pending results stay Pending."}</span></div>
      <div class="actions">${d.can_publish ? `<button class="btn ${pub ? "ghost" : "gold"}" data-act="res-publish" data-v="${pub ? 0 : 1}">${pub ? "Unpublish" : "Publish results"}</button>` : ""}<button class="btn ghost" data-act="res-csv">Export CSV</button>${["super", "director", "cohort_manager", "academy_admin"].includes(ME.role) ? `<a class="btn ghost" href="#/portal/exams">Examination settings</a>` : ""}</div></div></div>
    <div class="card"><div class="filters">
      ${d.cohorts.length > 1 ? `<select data-change="res-cohort" aria-label="Cohort">${d.cohorts.map((c) => `<option value="${c.id}" ${c.id === d.cohort.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` : ""}
      <select data-change="res-track" aria-label="Track"><option value="">All tracks</option>${Object.entries(d.tracks).map(([k, v]) => `<option value="${k}" ${f.track === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
      <select data-change="res-st" aria-label="Show"><option value="">Everyone</option>${[["pending", "Pending"], ["missed", "Missed an examination"], ["ungraded", "Project waiting for grading"], ["A", "Distinction"], ["B", "Merit"], ["C", "Pass"], ["F", "Fail"]].map(([k, v]) => `<option value="${k}" ${f.st === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <input type="search" data-change="res-q" placeholder="Search name or matric" value="${esc(f.q || "")}" aria-label="Search"></div>
      <div class="tbl-wrap"><table class="tbl res-tbl cards"><thead><tr><th>Student</th><th>Track</th><th class="mono">Assess. /40</th><th class="mono">Exams /60</th><th class="mono">Project /100</th><th class="mono">Final</th><th>Result</th></tr></thead><tbody>
      ${L.map((s) => { const r = s.result; return `<tr><td data-label="Student"><a class="link" href="#/portal/results/${s.id}"><b>${esc(s.name)}</b></a><span class="note mono" style="display:block">${esc(s.matric)}</span></td><td data-label="Track">${esc(d.tracks[s.track] || "No track")}</td>
        <td data-label="Assessments" class="mono">${m1(r.assess_score)}${r.assess_pending ? `<span class="note" style="display:block">${r.assess_pending} to take</span>` : r.assess_missed ? `<span class="note" style="display:block">${r.assess_missed} missed</span>` : ""}</td>
        <td data-label="Examinations" class="mono">${r.exam_score ?? "—"}<span class="note" style="display:block">${r.fund.status === "Graded" ? r.fund.score : r.fund.status} · ${r.core.status === "Graded" ? r.core.score : r.core.status}</span></td>
        <td data-label="Project" class="mono">${r.project.score ?? "—"}${r.project.score == null ? `<span class="note" style="display:block">${esc(r.project.status)}</span>` : ""}</td>
        <td data-label="Final" class="mono"><b>${r.final ?? "—"}</b></td><td data-label="Result">${RES_ST(r)}</td></tr>`; }).join("") || `<tr><td colspan="7">${empty("No students match.")}</td></tr>`}</tbody></table></div></div>
    <div class="card"><h3>Grading scale</h3>${scaleTable()}<p class="note">Scores are truncated, never rounded up: 79.5 is a Merit. A result stays Pending while any assessment, examination or the project has no score, unless the Programme Director approves an exception.</p></div>`);
}
async function tabResultDetail(id) {
  const d = await rpc("acad_result_detail", { p_app: id }); ui.resD = d;
  const r = d.result, edit = d.can_correct && (!d.locked || d.can_publish);
  const fix = (comp, cur, mx, unit) => edit ? `<button class="btn sm ghost" data-act="res-fix" data-k="${comp}" data-v="${cur ?? ""}" data-mx="${mx}" data-u="${unit}">Correct</button>` : "";
  const sitting = (k) => d.sittings.filter((x) => x.paper === k).map((x) => `<li>Attempt ${x.attempt}: started ${fmtAt(x.started_at)}${x.correct != null ? ` · <b>${x.correct}</b> correct` : " · in progress"}${x.late ? " · time ran out" : ""}</li>`).join("");
  const exCard = (k) => { const e = r[k]; return `<div class="card"><div class="ch"><h3>${paperName(k)}</h3>${resPill(e.status)}</div>
      <dl class="kv"><div><dt>Day</dt><dd>${fmtDateD(e.date)}</dd></div><div><dt>Score</dt><dd class="mono">${e.score != null ? `${e.score}/${e.questions}` : "—"}${e.corrected ? " (corrected)" : ""}</dd></div></dl>
      ${sitting(k) ? `<ul class="note">${sitting(k)}</ul>` : ""}${e.resit ? `<div class="notice">Resit authorised for <b>${fmtDateD(e.resit.date)}</b>: ${esc(e.resit.reason)} ${edit ? `<button class="btn sm ghost" data-act="res-resit-x" data-k="${k}">Cancel resit</button>` : ""}</div>` : ""}
      <div class="actions">${fix("exam-" + k, e.score, e.questions, "correct answers")}${edit ? `<button class="btn sm ghost" data-act="res-resit" data-k="${k}">Authorise a resit</button>` : ""}</div></div>`; };
  shell("results", esc(d.name), `${esc(d.matric)} · ${esc(d.track || "No track")} · ${d.locked ? "results published" : "results not published yet"}`,
    `<p><a class="link" href="#/portal/results">← All results</a> · <a class="link" href="#/portal/student/${d.id}">Student record</a></p>
    <section class="sc-kpis sc-kpis4">${kpiBox("Assessments", `${m1(r.assess_score)}<small>/40</small>`, `${r.assess_taken} taken · ${r.assess_missed} missed · ${r.assess_pending} to take`)}${kpiBox("Examinations", `${r.exam_score ?? "—"}<small>/60</small>`, "(Fund + Core) ÷ 70 × 60")}${kpiBox("Project", `${r.project.score ?? "—"}<small>/100</small>`, esc(r.project.status))}${kpiBox("Final", `${r.final ?? "—"}<small>/100</small>`, r.class ? `${esc(r.class)} (${esc(r.grade)})` : "Pending")}</section>
    ${r.status === "Pending" ? `<div class="notice"><b>Pending:</b> ${(r.missing || []).map(esc).join(" · ")}</div>` : ""}
    <div class="card"><div class="ch"><h3>Exception</h3>${r.exception ? `<span class="pill now">Approved</span>` : ""}</div>
      <p class="note">${r.exception ? `Approved by ${esc(r.exception.by)} on ${fmtDay(r.exception.at)}: ${esc(r.exception.reason)}. Missing scores count as zero.` : "With an approved exception, the final result is calculated with any missing score counted as zero. Only the Programme Director or Super Admin can approve one."}</p>
      ${d.can_publish ? `<div class="actions"><button class="btn sm ${r.exception ? "ghost" : ""}" data-act="res-exc" data-v="${r.exception ? 0 : 1}">${r.exception ? "Remove the exception" : "Approve an exception"}</button></div>` : ""}</div>
    <div class="card"><div class="ch"><h3>Weekly assessments</h3><b class="mono">${m1(r.assess_score)}/40</b></div>
      <div class="tbl-wrap"><table class="tbl res-tbl cards"><thead><tr><th>Assessment</th><th>Status</th><th class="mono">Correct</th><th class="mono">Marks</th><th></th></tr></thead><tbody>
      ${r.assessments.map((x) => `<tr><td data-label="Assessment">${esc(x.title)}<span class="note" style="display:block">Week ${x.week}${x.taken_at ? ` · ${fmtAt(x.taken_at)}` : ""}</span></td><td data-label="Status">${resPill(x.status)}${x.corrected ? ' <span class="pill">Corrected</span>' : ""}</td><td data-label="Correct" class="mono">${x.correct ?? "—"}/5</td><td data-label="Marks" class="mono">${x.marks ?? "—"}</td><td>${fix(x.key, x.correct, 5, "correct answers")}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="cols">${exCard("fund")}${exCard("core")}</div>
    <div class="card"><div class="ch"><h3>Practical project</h3>${resPill(r.project.status)}</div>
      <dl class="kv"><div><dt>Score</dt><dd class="mono">${r.project.score ?? "—"}/100${r.project.corrected ? " (corrected)" : ""}</dd></div><div><dt>Graded by</dt><dd>${esc(r.project.graded_by || "—")}</dd></div></dl>
      ${r.project.rubric ? `<table class="tbl rub"><tbody>${Object.entries(r.project.rubric).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v}</td></tr>`).join("")}</tbody></table>` : ""}
      ${r.project.feedback ? `<p class="note">“${esc(r.project.feedback)}”</p>` : ""}<div class="actions">${fix("project", r.project.score, 100, "marks")}</div></div>
    <div class="card"><h3>Score changes</h3>${d.changes.length ? `<ul class="roles">${d.changes.map((c) => `<li><b>${esc(c.component)}: ${c.old ?? "calculated"} → ${c.new ?? "calculated"}</b><span class="note">${esc(c.reason)} · ${esc(c.by)} · ${fmtAt(c.at)}</span></li>`).join("")}</ul>` : empty("No changes. Every score is calculated.")}</div>`);
}
const DAYN = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
async function tabExams() {
  const d = await rpc("acad_exam_settings", {}); ui.exS = d;
  const mon = d.exam_monday, dayD = (n) => { const x = new Date(mon + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n - 1); return x.toISOString().slice(0, 10); };
  shell("exams", "Examinations", `${esc(d.cohort)} · Week 12. Fundamental Examination: 30 questions on Monday or Tuesday. Core Skill Learning Examination: 40 questions by track on Wednesday, Thursday or Friday.`,
    `<form class="card form" id="ex-set" novalidate><div class="sc-h"><div><span class="eyebrow">Timetable</span><h2>${d.published ? "Published to students" : "Not published yet"}</h2><span class="note">Students see their own dates once you publish. Publish before Week 12.</span></div></div>
      <div class="grid2"><div class="field"><label for="ex-week">Examination week starts (Monday)</label><input id="ex-week" type="date" value="${esc(d.exam_week_start || "")}"><span class="note">Leave empty for Week 12: ${fmtDateD(d.week12_monday)}.</span></div>
        <div class="field"><label>Start window each day</label><div class="grid2"><input id="ex-open" type="time" value="${esc(d.open)}" aria-label="Opens"><input id="ex-close" type="time" value="${esc(d.close)}" aria-label="Last start"></div><span class="note">Students can start any time in this window. Their timer runs from when they start.</span></div></div>
      <div class="grid2"><div class="field"><label for="ex-fm">Fundamental time limit (minutes)</label><input id="ex-fm" type="number" min="10" max="240" value="${d.fund_minutes}"></div><div class="field"><label for="ex-cm">Core Skill Learning time limit (minutes)</label><input id="ex-cm" type="number" min="10" max="240" value="${d.core_minutes}"></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Track</th><th>Fundamental day</th><th>Core Skill Learning day</th><th>Question pools</th></tr></thead><tbody>
      ${d.schedule.map((t) => `<tr data-track="${t.track}"><td data-label="Track"><b>${esc(t.name)}</b></td>
        <td data-label="Fundamental"><select class="ex-fd" aria-label="${esc(t.name)} Fundamental day">${[1, 2].map((n) => `<option value="${n}" ${t.fund_day === n ? "selected" : ""}>${DAYN[n]} · ${fmtDay(dayD(n))}</option>`).join("")}</select></td>
        <td data-label="Core"><select class="ex-cd" aria-label="${esc(t.name)} Core day" ${t.track === "BOP" ? "disabled" : ""}>${[3, 4, 5].map((n) => `<option value="${n}" ${t.core_day === n ? "selected" : ""}>${DAYN[n]} · ${fmtDay(dayD(n))}</option>`).join("")}</select>${t.track === "BOP" ? `<span class="note" style="display:block">Always Wednesday (policy)</span>` : ""}</td>
        <td data-label="Pools"><span class="pill ${t.fund_bank >= 30 ? "ok" : "bad"}">Fund ${t.fund_bank}</span> <span class="pill ${t.core_bank >= 40 ? "ok" : "bad"}">Core ${t.core_bank}</span></td></tr>`).join("")}</tbody></table></div>
      <p class="note">Each candidate gets 30 (Fundamental) or 40 (Core) questions drawn at random from their track's pool, so papers differ. All questions carry equal weight: examination score = (correct ÷ 70) × 60.</p>
      <label class="consent"><input type="checkbox" id="ex-pub" ${d.published ? "checked" : ""}> <span><b>Publish the timetable to students</b></span></label>
      <p class="err" id="ex-err" role="alert"></p><div class="actions"><button class="btn" type="submit">Save examination settings</button><a class="btn ghost" href="#/portal/results">Results</a></div></form>`);
}

/* ---------- Facilitator: grading desk ---------- */
const RUBRIC4 = [["Meets the brief", 40, "Answers every part of the task", [0, 10, 20, 30, 40]], ["Quality of work", 30, "Correct, clean and well reasoned", [0, 10, 20, 25, 30]],
  ["Clear communication", 20, "A manager could act on it without asking", [0, 5, 10, 15, 20]], ["Professional delivery", 10, "Tidy, well named, shared with the right access", [0, 4, 6, 8, 10]]];
let PROJ_RUB4 = null; // built on first use: PROJECT_RUBRIC is defined further down
const rubFor = (x) => x && x.title === "Submit your final project" ? (PROJ_RUB4 ||= PROJECT_RUBRIC.map(([n, mx, h]) => [n, mx, h, RUB_LEVELS.map(([, f]) => Math.round(mx * f))])) : RUBRIC4;
const FB_SNIPS = ["Clear structure. Well done.", "Clean the data before you analyse it.", "Label every chart and axis.", "Add one line on what the manager should do next.", "Check spelling and names before you send."];
async function tabDesk() {
  const [h, q, M] = await Promise.all([rpc("fac_home"), rpc("acad_learn_queue"), rpc("acad_messages").catch(() => [])]); ui.lq = q; ui.msgs = M;
  const wait = q.work.filter((x) => x.status === "submitted").sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!wait.some((x) => x.key + x.app === ui.deskSel)) ui.deskSel = wait[0] ? wait[0].key + wait[0].app : null;
  const cur = wait.find((x) => x.key + x.app === ui.deskSel), R = (ui.rub || {})[ui.deskSel] || {}, picked = Object.keys(R).length;
  const RB = rubFor(cur), isFinal = RB !== RUBRIC4, nRB = RB.length;
  const raw = Object.values(R).reduce((a, b) => a + b, 0), capped = !isFinal && cur && cur.cap != null && cur.cap < 1 ? Math.round(raw * cur.cap) : raw;
  const msgs = (M || []).filter((m) => m.waiting).slice(0, 4);
  const days = (t) => Math.max(0, Math.floor((Date.now() - new Date(t)) / 864e5));
  shell("desk", `${wait.length} project${wait.length === 1 ? "" : "s"} to grade`, `${esc(h.track || "All tracks")} · ${h.students} students · Week ${Math.max(h.cohort.week, 1)}. Oldest first. Final projects count in the final result.`,
    `<section class="sc-kpis sc-kpis4">${kpiBox("Graded this week", h.graded_week, "by you")}${kpiBox("Average turnaround", h.turn != null ? h.turn + "d" : "—", "target 2 days", "")}${kpiBox("Waiting", wait.length, wait[0] ? `oldest ${days(wait[0].at)} day${days(wait[0].at) === 1 ? "" : "s"}` : "nothing waiting")}${kpiBox("Low confidence", h.low_conf, "in your track this week", "", "#/portal/students")}</section>
    <section class="rh-desk"><div class="card rh-queue"><div class="sc-h"><b>Queue</b><span class="note">oldest first</span></div>
        ${wait.length ? wait.map((x) => { const dd = days(x.at), on = x.key + x.app === ui.deskSel; return `<button class="rh-qi ${on ? "on" : ""}" data-act="desk-pick" data-k="${esc(x.key + x.app)}" aria-pressed="${on}"><span class="st-av">${ini(x.name)}</span><span class="sc-p-t"><b>${esc(x.name)}</b><span class="note">Week ${x.week} · ${esc(x.title)}</span></span><span class="pill ${dd > 2 ? "bad" : dd > 1 ? "now" : "ok"}">${dd ? dd + "d" : "today"}</span></button>`; }).join("") : `<p class="empty">All graded. Nice work. 🎉</p>`}
        <a class="link sm" href="#/portal/grading">All submissions and staff steps</a></div>
      <div class="card rh-grade">${cur ? `<div class="sc-h"><div><span class="eyebrow">Week ${cur.week} project · sent ${agoS(cur.at)}</span><h2>${esc(cur.name)} · ${esc(cur.title)}</h2><span class="note">${esc(cur.matric)} · ${esc(cur.track)}${cur.cap != null && cur.cap < 1 ? ` · <b>late, score capped at ${Math.round(cur.cap * 100)}%</b>` : " · on time"}</span></div>
          <div class="actions"><a class="btn sm ghost" href="${esc(cur.link)}" target="_blank" rel="noopener">Open their work ↗</a><a class="btn sm ghost" href="#/portal/student/${cur.app}">Student record</a></div></div>
        ${isFinal ? `<div class="notice">Final practical project: this score out of 100 goes straight into the final result. It isn't capped for lateness (timeliness is part of the rubric).</div>` : ""}
        <div class="rh-rub">${RB.map(([n, mx, hint, vals], k) => `<div class="rh-rr"><div><b>${n} <span class="mono note">/ ${mx}</span></b><span class="note">${hint}</span></div><div class="rh-sc" role="group" aria-label="${n}">${vals.map((v) => `<button class="rh-s ${R[k] === v ? "on" : ""}" data-act="rub" data-k="${k}" data-v="${v}" aria-pressed="${R[k] === v}">${v}</button>`).join("")}</div></div>`).join("")}</div>
        <div class="rh-total ${picked < nRB ? "" : capped >= 50 ? "ok" : "bad"}"><div><span class="eyebrow">${isFinal ? "Project score" : "Task score"}</span><b class="mono">${picked < nRB ? "—" : capped + "/100"}</b></div><span>${picked < nRB ? `Score all ${nRB} parts. ${nRB - picked} left.` : isFinal ? "Counts directly in the final result: (assessments + examinations + project) ÷ 2." : "Week tasks get feedback but don't count towards the final result."}</span></div>
        <div class="field"><label for="desk-fb">Feedback for ${esc(cur.name.split(" ")[0])}</label><textarea id="desk-fb" rows="3" placeholder="What worked, what to fix, and one thing to try next week. Students see this with the grade.">${esc((ui.fb || {})[ui.deskSel] || "")}</textarea>
          <div class="actions">${FB_SNIPS.map((t, i) => `<button class="btn sm ghost" type="button" data-act="fb-add" data-k="${i}">+ ${esc(t.split(".")[0])}</button>`).join("")}</div></div>
        <div class="actions" style="justify-content:flex-end"><button class="btn ghost" data-act="desk-revise">Ask for changes</button><button class="btn" data-act="desk-save">Save grade and next →</button></div>`
        : `<p class="empty">Nothing waiting. When students submit, their work appears here oldest first.</p>`}</div></section>
    <section class="sc-3">
      <div class="card"><span class="eyebrow">My track this week</span><h2 class="sc-h2">Week ${Math.max(h.cohort.week, 1)}${h.week_title ? ` · ${esc(h.week_title)}` : ""}</h2>
        <div class="rh-minis">${miniStat("Lessons done", h.lessons_pct != null ? h.lessons_pct + "%" : "—")}${miniStat("Assessment taken", `${h.quiz_taken}/${h.students}`)}${miniStat("Projects in", `${h.proj_in}/${h.students}`)}${miniStat("Low confidence", h.low_conf, h.low_conf ? "rh-bad" : "")}</div></div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Project supervision</span><h2>${msgs.length ? `${msgs.length} waiting for a reply` : "No new messages"}</h2></div><a class="btn sm ghost" href="#/portal/grading">Open</a></div>
        ${msgs.length ? `<ul class="sc-act">${msgs.map((m) => `<li><span class="st-av">${ini(m.name)}</span><span><b>${esc(m.name)}</b><small class="note" style="display:block">“${esc(((m.messages || []).at(-1)?.body || "").slice(0, 120))}” · ${agoS(m.last_at)}</small></span></li>`).join("")}</ul>` : `<p class="note">Students in the practical project (Weeks 13–14) can message you from their project page.</p>`}</div>
      <div class="card"><span class="eyebrow">Next live class</span>${h.next ? `<h2 class="sc-h2">${esc(h.next.title)}</h2><p class="note">${fmtAt(h.next.at)} · ${h.next.minutes} min</p>
        <div class="actions">${h.next.link ? `<a class="btn" href="${esc(h.next.link)}" target="_blank" rel="noopener">Start class</a>` : ""}<a class="btn ghost" href="#/portal/sessions">Take attendance</a></div><p class="note">Students join from their portal, which marks them present.</p>` : `<h2 class="sc-h2">None scheduled</h2><a class="btn ghost" href="#/portal/sessions">Schedule one</a>`}</div></section>`,
    { eyebrow: todayEyebrow("Grading desk") });
}

/* ---------- Career Coach: career desk ---------- */
async function tabCareer() {
  const [h, L] = await Promise.all([rpc("coach_home"), rpc("coach_calls")]); ui.dc2 = L;
  const isCoach = ME.role === "coach", today = new Date().toDateString();
  const mine = L.filter((x) => (x.mine || !isCoach)), booked = mine.filter((x) => x.app && new Date(x.at).getTime() > Date.now() - 864e5 * 1).sort((a, b) => new Date(a.at) - new Date(b.at));
  const todays = booked.filter((x) => new Date(x.at).toDateString() === today), list = todays.length ? todays : booked.slice(0, 6);
  if (!list.some((x) => x.id === ui.ccSel)) ui.ccSel = list[0]?.id;
  const cur = L.find((x) => x.id === ui.ccSel), i = cur ? L.indexOf(cur) : -1, ch = cur?.cv ? atsChecks(cur.cv) : null;
  const P = h.pipeline || {}, people = (st) => h.pipe_people.filter((p) => p.st === st).slice(0, 3);
  const days = [...Array(10)].map((_, k) => new Date(Date.now() + (k + 1) * 864e5)).filter((d) => d.getDay() && d.getDay() < 6).slice(0, 5), TT = ["09:00", "10:00", "11:30", "14:00", "15:30"];
  const slotAt = (d, t) => mine.find((x) => fmt(x.at, { year: "numeric", month: "2-digit", day: "2-digit" }) === fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }) && fmt(x.at, { hour: "2-digit", minute: "2-digit", hour12: false }) === t);
  const iso = (d, t) => `${fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-")}T${t}:00+01:00`;
  shell("career", todays.length ? `${todays.length} mock interview${todays.length === 1 ? "" : "s"} today` : "Career desk", `${h.to_book.length ? `${h.to_book.length} student${h.to_book.length === 1 ? " still needs" : "s still need"} to book their Discovery Call. ` : ""}${h.chat.length ? `${h.chat.length} question${h.chat.length === 1 ? " is" : "s are"} waiting in the career chat.` : "The career chat is all answered."}`,
    `<section class="rh-desk"><div class="card rh-queue"><div class="sc-h"><b>${todays.length ? "Today's calls" : "Next calls"}</b><a class="link sm" href="#/portal/dc2">All</a></div>
        ${list.length ? list.map((x) => `<button class="rh-qi ${x.id === ui.ccSel ? "on" : ""}" data-act="cc-pick" data-k="${x.id}" aria-pressed="${x.id === ui.ccSel}"><b class="mono" style="width:52px;flex:none">${fmt(x.at, { hour: "2-digit", minute: "2-digit", hour12: false })}</b><span class="sc-p-t"><b>${esc(x.name)}</b><span class="note">${esc(x.track || "")}${new Date(x.at).toDateString() === today ? "" : ` · ${fmtDay(x.at)}`}</span></span><span class="pill ${x.result ? "ok" : new Date(x.at) < new Date() ? "now" : ""}">${x.result ? "Done" : new Date(x.at) < new Date() ? "To score" : "Booked"}</span></button>`).join("") : `<p class="empty">No calls booked yet. Open some times below.</p>`}</div>
      <div class="card rh-grade">${cur ? `<div class="sc-h"><div><span class="eyebrow">Discovery Call · ${fmtAt(cur.at)}</span><h2>${esc(cur.name)} · ${esc(cur.track || "")}</h2></div><div class="actions"><a class="btn sm ghost" href="#/portal/student/${cur.app}">Student record</a></div></div>
          <div class="rh-minis">${miniStat("CV ATS check", ch ? `${ch.filter((x) => x[1]).length}/5` : "—")}${miniStat("Their note", cur.note ? "Yes" : "None")}${miniStat("Result", cur.result ? `${cur.result.score}/10` : "Not yet")}</div>
          ${cur.note ? `<p><b>Their note:</b> “${esc(cur.note)}”</p>` : ""}${ch ? `<ul class="mini">${atsList(ch)}</ul>` : `<p class="note">No CV saved yet.</p>`}
          <form class="form dc2-form" data-i="${i}" novalidate><div class="field"><span class="lbl">Interview Confidence Score (1–10)</span><div class="rh-sc">${[...Array(10)].map((_, k) => `<button type="button" class="rh-s ${(ui.ccScore?.[cur.id] ?? cur.result?.score) === k + 1 ? "on" : ""}" data-act="cc-score" data-k="${k + 1}">${k + 1}</button>`).join("")}</div><input type="hidden" id="dsc-${i}" value="${ui.ccScore?.[cur.id] ?? cur.result?.score ?? ""}"></div>
            <div class="field"><label for="dno-${i}">Summary for the student</label><textarea id="dno-${i}" rows="2" placeholder="e.g. Strong pitch. Slow down and use numbers.">${esc(cur.result?.note || "")}</textarea></div>
            <div class="field"><label for="dnx-${i}">Next steps (one per line)</label><textarea id="dnx-${i}" rows="3" placeholder="Apply to 5 roles a week&#10;Practise STAR answers">${esc((cur.result?.next || []).join("\n"))}</textarea></div>
            <div class="actions"><button class="btn" type="submit">${cur.result ? "Update result" : "Save result"}</button></div></form>` : `<p class="empty">Pick a call to prepare.</p>`}</div></section>
    <section class="card"><div class="sc-h"><div><span class="eyebrow">Job search board · ${esc(h.cohort.name)}</span><h2>Where students' applications are</h2></div><a class="btn sm ghost" href="#/portal/jobs">Open job search</a></div>
      <div class="rh-pipe">${[["Interested", P.interested, "na", []], ["Applied", P.applied, "b", people("Applied")], ["Interviewing", P.interviewing, "w", people("Interviewing")], ["Offer", P.offer, "a", people("Offer")], ["In work", h.working, "n", []]]
        .map(([l, n, c, ppl]) => `<div class="rh-col ${c}"><div class="sc-h"><b>${l}</b><b class="mono">${n || 0}</b></div>${ppl.map((p) => `<a class="rh-card" href="#/portal/student/${p.id}"><b>${esc(p.name)}</b><span class="note">${esc([p.role, p.org].filter(Boolean).join(" · "))}</span></a>`).join("")}</div>`).join("")}</div></section>
    <section class="sc-2b">
      <div class="card"><span class="eyebrow">My availability · next 5 working days</span><h2 class="sc-h2">${mine.filter((x) => !x.app && new Date(x.at) > new Date()).length} open · ${mine.filter((x) => x.app && new Date(x.at) > new Date()).length} booked</h2>
        <p class="note">Tap a time to open or close it. Students book open times from their portal. Each call is 40 minutes.</p>
        <div class="hm-wrap"><div class="rh-grid"><span></span>${days.map((d) => `<b>${fmt(d, { weekday: "short", day: "numeric" })}</b>`).join("")}
          ${TT.map((t) => `<span class="mono note">${t}</span>${days.map((d) => { const s = slotAt(d, t); return s ? (s.app ? `<button class="rh-slot booked" disabled title="${esc(s.name)}">Booked</button>` : `<button class="rh-slot open" data-act="cc-close" data-k="${s.id}" aria-label="Close ${t}">Open</button>`) : `<button class="rh-slot" data-act="cc-open" data-k="${iso(d, t)}" aria-label="Open ${t}">+</button>`; }).join("")}`).join("")}</div></div></div>
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Career chat</span><h2>${h.chat.length} question${h.chat.length === 1 ? "" : "s"} waiting</h2></div><button class="btn sm ghost" data-act="go-disc" data-k="career">Answer</button></div>
        ${h.chat.length ? `<ul class="sc-act">${h.chat.slice(0, 5).map((c) => `<li><span class="st-av">${ini(c.author)}</span><span><b>“${esc(c.body.slice(0, 140))}”</b><small class="note" style="display:block">${esc(c.author)} · ${agoS(c.at)}</small></span></li>`).join("")}</ul>` : `<p class="note">Nothing waiting.</p>`}
        <div class="rh-minis" style="margin-top:.8rem">${miniStat("In work", h.working)}${miniStat("Interviewing", P.interviewing || 0)}${miniStat("Opportunities live", h.opps_live)}</div>
        ${h.to_book.length ? `<p class="note" style="margin-top:.8rem"><b>Still to book their Discovery Call:</b> ${h.to_book.slice(0, 6).map((x) => esc(x.name)).join(", ")}${h.to_book.length > 6 ? ` and ${h.to_book.length - 6} more` : ""}.</p>` : ""}</div></section>`,
    { eyebrow: todayEyebrow("Career desk"), actions: `<a class="btn" href="#/portal/opps">Post an opportunity</a>` });
}

/* ---------- Academy Admin: operations ---------- */
const OPS_ITEMS = (wk) => wk <= 1 ? [["Every student has a portal account", "Send set-up links to anyone missing"], ["Orientation class has a link", "Live sessions page"], ["Pods assigned", "Everyone in a pod before Week 2"]]
  : wk <= 11 ? [["Exam timetable published", "Settings → Examinations, before Week 12"], ["Confirm host spots", "Every host says how many interns they can take"], ["Match students to hosts", "By track, city and what they asked for"], ["Send supervisor links", "Each supervisor gets the logbook and evaluation link"], ["Brief students on the internship", "Announcement plus a live session"], ["Next week's classes have links", "Live sessions page"]]
  : wk <= 12 ? [["Examinations running", "Check the Results page each day for missed papers and resits"], ["Projects briefed", "Project supervisors ready for Week 13"]]
  : wk <= 14 ? [["Projects graded", "Every final project graded against the rubric by the end of Week 14"], ["Placements confirmed", "Every student matched before Week 15"]]
  : wk <= 18 ? [["Supervisors are signing logbooks", "Chase any supervisor more than a week behind"], ["Mid-internship check-in", "One message to each host"], ["Evaluations requested", "In Week 18, remind supervisors to evaluate"]]
  : [["Certificates checked", "Names and tracks are right before issuing"], ["Graduation announcement", "Tell students what happens after Week 20"], ["Results published", "Programme Director approves and publishes on the Results page"], ["Alumni check-ins planned", "30, 60 and 90 days after"]];
async function tabOps() {
  const [h, L] = await Promise.all([rpc("aa_home"), rpc("acad_placements")]); ui.places = L; ui.aa = h;
  const tf = ui.opsT || "", tracks = [...new Set(L.map((x) => x.track).filter(Boolean))];
  const F = L.filter((x) => !tf || x.track === tf), wk = h.cohort.week, items = OPS_ITEMS(wk), done = items.filter(([t]) => h.checks[t]).length;
  const col = (title, cls, help, rows, act) => `<div class="rh-col ${cls}"><div class="sc-h"><b>${title}</b><b class="mono">${rows.length}</b></div><span class="note">${help}</span>${rows.slice(0, 6).map((x) => `<a class="rh-card" href="#/portal/intern"><b>${esc(x.name)}</b><span class="note">${esc(x.track || "")}${x.placement ? ` · ${esc(x.placement.org)}` : ""}</span><span class="link sm">${act}</span></a>`).join("")}${rows.length > 6 ? `<a class="link sm" href="#/portal/intern">+ ${rows.length - 6} more</a>` : ""}</div>`;
  const need = F.filter((x) => !x.placement), placed = F.filter((x) => x.placement && !x.signed && !x.to_sign && !x.eval), active = F.filter((x) => x.placement && (x.signed || x.to_sign) && !x.eval), evald = F.filter((x) => x.eval);
  const days = Math.ceil((new Date(h.intern_start + "T09:00:00+01:00") - Date.now()) / 864e5), used = h.hosts.reduce((t, x) => t + x.used, 0), spots = h.hosts.filter((x) => x.active).reduce((t, x) => t + x.spots, 0);
  shell("ops", need.length && wk < 14 ? `${need.length} student${need.length === 1 ? " needs" : "s need"} a placement` : "Operations", `${days > 0 ? `Internships start ${fmtDateD(h.intern_start)}, in ${days} day${days === 1 ? "" : "s"}.` : "Internships are under way."} ${h.hosts.length ? `${h.hosts.filter((x) => x.active).length} host organisations have ${Math.max(0, spots - used)} open spot${spots - used === 1 ? "" : "s"}.` : "Add your host organisations to track their spots."}`,
    `<section class="sc-kpis">${kpiBox("Need a placement", need.length, `of ${L.length} students`, "", "#/portal/intern")}${kpiBox("Placed", F.length - need.length, "supervisor link sent")}${kpiBox("Evaluated", evald.length, "internship certificates issued automatically")}${kpiBox("Not set up the portal", h.no_account, h.no_account ? "students" : "everyone is in")}${kpiBox("Classes without a link", h.sessions_nolink, "in the next 8 days", "", "#/portal/sessions")}</section>
    <section class="card"><div class="sc-h"><div><span class="eyebrow">Placement board</span><h2>Internships, Weeks 15–18</h2></div>
        <div class="sc-tabs" role="group" aria-label="Track"><button class="sc-tab" data-act="ops-t" data-k="" aria-pressed="${!tf}">All</button>${tracks.map((t) => `<button class="sc-tab" data-act="ops-t" data-k="${esc(t)}" aria-pressed="${tf === t}">${esc(t)}</button>`).join("")}</div></div>
      <div class="hm-wrap"><div class="rh-pipe rh-pipe4">${col("Need a placement", "bad", "No host yet", need, "Add placement")}${col("Placed", "w", "Supervisor hasn't signed anything yet", placed, "Share the link again")}${col("Logbooks going", "a", "Supervisor is signing weekly logbooks", active, "View")}${col("Evaluated", "n", "Final evaluation in", evald, "View")}</div></div></section>
    <section class="sc-2">
      <div class="card"><div class="sc-h"><div><span class="eyebrow">Host organisations</span><h2>${h.hosts.length ? `${Math.max(0, spots - used)} open spots across ${h.hosts.filter((x) => x.active).length} hosts` : "No hosts added yet"}</h2></div><button class="btn sm" data-act="host-edit" data-k="new">Add a host</button></div>
        ${ui.hostEdit ? (() => { const x = ui.hostEdit === "new" ? {} : h.hosts.find((y) => y.id === ui.hostEdit) || {}; return `<form class="form rh-hostf" id="host-form" data-id="${x.id || ""}" novalidate>
          <div class="grid2"><div class="field"><label for="ho-n">Organisation</label><input id="ho-n" value="${esc(x.name || "")}" placeholder="e.g. Brightpath Logistics Ltd"></div><div class="field"><label for="ho-c">City</label><input id="ho-c" value="${esc(x.city || "")}" placeholder="e.g. Lagos · hybrid"></div></div>
          <div class="grid2"><div class="field"><label for="ho-t">Tracks they take</label><input id="ho-t" value="${esc(x.tracks || "")}" placeholder="e.g. Data, Support"></div><div class="field"><label for="ho-s">Spots</label><input id="ho-s" type="number" min="0" max="200" value="${x.spots ?? 2}"></div></div>
          <div class="grid2"><div class="field"><label for="ho-cn">Contact name</label><input id="ho-cn" value="${esc(x.contact_name || "")}"></div><div class="field"><label for="ho-cp">Contact WhatsApp</label><input id="ho-cp" value="${esc(x.contact_phone || "")}"></div></div>
          <div class="field"><label for="ho-ce">Contact email</label><input id="ho-ce" type="email" value="${esc(x.contact_email || "")}"></div>
          <label class="consent"><input type="checkbox" id="ho-a" ${x.active === false ? "" : "checked"}> Taking interns this cohort</label>
          <div class="actions"><button class="btn sm" type="submit">Save host</button><button class="btn sm ghost" type="button" data-act="host-edit" data-k="">Cancel</button></div></form>`; })() : ""}
        ${h.hosts.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Host</th><th>Tracks</th><th>Spots used</th><th>Contact</th><th></th></tr></thead><tbody>${h.hosts.map((x) => `<tr class="${x.active ? "" : "off"}"><td data-label="Host"><b>${esc(x.name)}</b><span class="note" style="display:block">${esc(x.city || "")}</span></td><td data-label="Tracks" class="note">${esc(x.tracks || "—")}</td>
          <td data-label="Spots"><span class="pill ${x.used >= x.spots ? "info" : "ok"}">${x.used}/${x.spots}</span></td><td data-label="Contact">${esc(x.contact_name || "—")}${x.contact_phone ? ` · <a class="link" href="${waLink(x.contact_phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</td><td><button class="link sm" data-act="host-edit" data-k="${x.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>` : ""}
        ${h.unhosted_orgs.length ? `<p class="note">Placed at but not in this list: ${h.unhosted_orgs.map(esc).join(", ")}.</p>` : ""}</div>
      <div class="stack">
        <div class="card"><span class="eyebrow">Week ${Math.max(wk, 1)} checklist</span><h2 class="sc-h2">${done} of ${items.length} done</h2>
          <ul class="rh-chk">${items.map(([t, n]) => `<li><label><input type="checkbox" data-change="ops-check" data-k="${esc(t)}" ${h.checks[t] ? "checked" : ""}><span><b class="${h.checks[t] ? "done" : ""}">${esc(t)}</b><small class="note">${esc(n)}${h.checks[t] ? ` · ${esc(h.checks[t].by)}, ${agoS(h.checks[t].at)}` : ""}</small></span></label></li>`).join("")}</ul></div>
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Student accounts</span><h2>${h.no_account ? `${h.no_account} haven't set up the portal` : "Everyone has an account"}</h2></div>${h.no_account ? `<button class="btn sm" data-act="invite">Email set-up links</button>` : ""}</div></div>
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Certificates</span><h2>${h.certs_ready ? `${h.certs_ready} student${h.certs_ready === 1 ? "" : "s"} ready for a certificate` : "No certificates waiting"}</h2></div><a class="btn sm ghost" href="#/portal/students">Students</a></div><p class="note">Issue them from the Students list once the programme steps are done. Internship certificates are issued automatically after the host's evaluation.</p></div>
      </div></section>`,
    { eyebrow: todayEyebrow(`Operations · Week ${Math.max(wk, 1)}`), actions: `<a class="btn ghost" href="#/portal/intern">Internships</a><button class="btn" data-act="host-edit" data-k="new">Add a host</button>` });
}

/* ---------- Admissions Admin: pipeline ---------- */
const PIPE = [["pending", "Assessment pending", ["Assessment pending"]], ["book", "Call to book", ["Call to book"]], ["booked", "Call booked", ["Call booked"]], ["review", "Under review", ["Under review"]], ["offer", "Offer sent", ["Offer sent"]], ["admitted", "Admitted", ["Admitted"]]];
async function tabPipeline() {
  const [{ apps, ov }, h] = await Promise.all([loadAdm(), rpc("adm_home")]); ui.admApps = apps;
  const st = ui.pipe || "review", stage = PIPE.find((p) => p[0] === st), L = apps.filter((a) => stage[2].includes(a.status));
  const review = apps.filter((a) => a.status === "Under review"), soon = apps.filter((a) => a.status === "Offer sent" && a.offer_deadline && new Date(a.offer_deadline) - Date.now() < 2 * 864e5).sort((a, b) => new Date(a.offer_deadline) - new Date(b.offer_deadline));
  const seats = ov.tracks.reduce((t, x) => t + x.seats, 0), used = ov.tracks.reduce((t, x) => t + x.used, 0);
  const offers = (code) => apps.filter((a) => a.status === "Offer sent" && a.track_code === code).length, waitl = (code) => apps.filter((a) => a.status === "Waitlisted" && a.track_code === code).length;
  const row = (a) => `<li class="sc-q"><span class="st-av">${ini(a.first_name + " " + a.surname)}</span><div class="sc-q-t"><div class="sc-q-h"><b>${esc(a.first_name)} ${esc(a.surname)}</b>${a.pilot ? `<span class="pill gold">Pilot</span>` : ""}<span class="mono note">${esc(a.ref)}</span></div>
      <span class="note">${esc(a.track_name || a.wanted || "")} · ${esc(a.city || "")} · ${esc(a.situation || "")}</span>
      <span class="sc-tags">${a.score != null ? `<span class="pill info">Readiness ${a.score}%</span>` : ""}${a.dc1_score ? `<span class="pill info">Call ${a.dc1_score}/10</span>` : ""}${a.rec ? `<span class="pill ${a.rec.d === "offer" ? "ok" : a.rec.d === "waitlist" ? "now" : "bad"}">Officer: ${REC_L[a.rec.d]}</span>` : ""}${a.offer_deadline && a.status === "Offer sent" ? `<span class="pill now">Pay by ${fmtDay(a.offer_deadline)}</span>` : ""}</span>
      ${a.rec?.why || a.dc1_note ? `<span class="note"><i>“${esc(a.rec?.why || a.dc1_note)}”</i>${a.officer_name ? ` · ${esc(a.officer_name)}` : ""}</span>` : ""}</div>
    <div class="sc-q-a">${a.status === "Under review" ? `<div class="actions"><button class="btn sm" data-act="decide" data-x="offer" data-k="${a.id}">Offer</button><button class="btn sm ghost" data-act="decide" data-x="waitlist" data-k="${a.id}">Waitlist</button><button class="btn sm ghost" data-act="decide" data-x="reject" data-k="${a.id}">Decline</button></div>`
      : a.status === "Offer sent" ? `<button class="btn sm ghost" data-act="extend" data-k="${a.id}" data-days="3">Give 3 more days</button>` : `<a class="link sm" href="#/portal/apps">Open</a>`}</div></li>`;
  shell("pipeline", review.length ? `${review.length} applicant${review.length === 1 ? "" : "s"} waiting for a decision` : "Admissions pipeline", `${esc(ov.cohort?.name || "")} has <b>${used} of ${seats} seats</b> taken.${soon.length ? ` ${soon.length} offer${soon.length === 1 ? " expires" : "s expire"} in the next 48 hours.` : ""}`,
    `<section class="rh-stages" role="group" aria-label="Pipeline stage">${PIPE.map(([k, l, s]) => { const n = apps.filter((a) => s.includes(a.status)).length; return `<button class="rh-stage" data-act="pipe" data-k="${k}" aria-pressed="${st === k}"><span>${l}</span><b class="mono">${n}</b></button>`; }).join("")}</section>
    <section class="sc-2"><div class="card"><div class="sc-h"><div><span class="eyebrow">${stage[1]}</span><h2>${L.length} applicant${L.length === 1 ? "" : "s"}</h2></div>${st === "review" && review.filter((a) => a.rec).length > 1 ? `<button class="btn sm gold" data-act="approve-all">Approve all ${review.filter((a) => a.rec).length} recommendations</button>` : `<a class="btn sm ghost" href="#/portal/apps">All applications</a>`}</div>
        ${L.length ? `<ul class="sc-ql">${L.slice(0, 30).map(row).join("")}</ul>${L.length > 30 ? `<a class="link sm" href="#/portal/apps">+ ${L.length - 30} more in Applications</a>` : ""}` : `<p class="empty">No one at this stage.</p>`}</div>
      <div class="stack">
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Seats · ${esc(ov.cohort?.name || "")}</span><h2>${used} of ${seats} taken</h2></div><a class="btn sm ghost" href="#/portal/settings">Settings</a></div>
          <div class="rh-seats">${ov.tracks.map((t) => `<div><div class="rh-seat-h"><b>${esc(t.name)}</b><span class="mono note">${t.used}/${t.seats}${waitl(t.code) ? ` · ${waitl(t.code)} waitlisted` : ""}</span></div><div class="sc-bar" style="margin:4px 0 0;height:10px"><i class="a" style="width:${t.seats ? (t.used / t.seats) * 100 : 0}%"></i><i class="b" style="width:${t.seats ? (offers(t.code) / t.seats) * 100 : 0}%"></i></div></div>`).join("")}</div>
          <div class="sc-leg" style="margin-top:.6rem"><span><i class="a"></i>Paid</span><span><i class="b"></i>Offer sent, not paid</span></div></div>
        <div class="card"><div class="sc-h"><div><span class="eyebrow">Offers expiring</span><h2>${soon.length ? `${soon.length} in the next 48 hours` : "None this week"}</h2></div></div>
          ${soon.length ? `<ul class="sc-act">${soon.map((a) => { const hrs = Math.round((new Date(a.offer_deadline) - Date.now()) / 36e5); return `<li><span style="flex:1"><b>${esc(a.first_name)} ${esc(a.surname)}</b><small class="note" style="display:block">${esc(a.track_name || "")}</small></span><span class="pill ${hrs < 24 ? "bad" : "now"}">${hrs < 1 ? "under an hour" : hrs + " hours left"}</span><button class="btn sm ghost" data-act="extend" data-k="${a.id}" data-days="3">+3 days</button></li>`; }).join("")}</ul>` : ""}</div>
        <div class="card"><span class="eyebrow">Money today</span><h2 class="sc-h2">${naira(h.money_today)} received</h2><p class="note">${h.pay_today} payment${h.pay_today === 1 ? "" : "s"}${h.pay_failed ? ` · ${h.pay_failed} failed` : ""}${h.pay_last ? ` · last ${agoS(h.pay_last)}` : ""}</p><a class="link sm" href="#/portal/pay">Payments</a></div>
      </div></section>`,
    { eyebrow: todayEyebrow("Admissions pipeline"), actions: `<a class="btn ghost" href="#/portal/apps">Applications</a><a class="btn" href="#/portal/pay">Record a bank transfer</a>` });
}

/* ---------- Admissions Officer: today's calls ---------- */
async function tabHome() {
  if (ME.role === "adm_admin") return tabPipeline();
  const [{ apps, ov }, slots, h] = await Promise.all([loadAdm(), rpc("officer_slots"), rpc("adm_home")]);
  const mine = apps.filter((a) => a.status === "Call booked" && (ME.role === "super" || a.officer_email === ME.email)).sort((x, y) => new Date(x.dc1_at) - new Date(y.dc1_at));
  const today = new Date().toDateString(), todays = mine.filter((a) => new Date(a.dc1_at).toDateString() === today), overdue = mine.filter((a) => new Date(a.dc1_at) < new Date() && new Date(a.dc1_at).toDateString() !== today);
  const list = [...overdue, ...(todays.length ? todays : mine.filter((a) => new Date(a.dc1_at) > new Date()).slice(0, 5))];
  if (!list.some((a) => a.id === ui.ofSel)) ui.ofSel = list.find((a) => new Date(a.dc1_at) > Date.now() - 36e5)?.id || list[0]?.id;
  const a = apps.find((x) => x.id === ui.ofSel), k = a?.id, sc = (ui.ofScore || {})[k], rc = (ui.ofRec || {})[k];
  const waiting = apps.filter((x) => x.status === "Call to book").length, openT = slots.filter((s) => !s.booked_by && new Date(s.at) > new Date()).length;
  const days = [...Array(10)].map((_, i) => new Date(Date.now() + (i + 1) * 864e5)).filter((d) => d.getDay() && d.getDay() < 6).slice(0, 5);
  const dk = (d) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" }), slotAt = (d, t) => slots.find((s) => dk(s.at) === dk(d) && fmt(s.at, { hour: "2-digit", minute: "2-digit", hour12: false }) === t);
  const iso = (d, t) => `${dk(d).split("/").reverse().join("-")}T${t}:00+01:00`;
  const next = mine.find((x) => new Date(x.dc1_at) > new Date());
  shell("home", todays.length ? `${todays.length} Discovery Call${todays.length === 1 ? "" : "s"} today` : "Today's calls", `${next ? `Next call ${new Date(next.dc1_at).toDateString() === today ? "at" : "on"} <b>${new Date(next.dc1_at).toDateString() === today ? fmtTime(next.dc1_at) : fmtAt(next.dc1_at)}</b>.` : "No more calls booked."}${overdue.length ? ` ${overdue.length} earlier call${overdue.length === 1 ? " still needs" : "s still need"} notes.` : ""} ${openT < waiting ? `Only ${openT} call time${openT === 1 ? " is" : "s are"} open for ${waiting} applicants waiting to book.` : ""}`,
    `<section class="rh-desk"><div class="card rh-queue"><div class="sc-h"><b>${todays.length ? "Today" : "Coming up"}</b><span class="note">15 min each</span></div>
        ${list.length ? list.map((x) => { const past = new Date(x.dc1_at) < new Date(); return `<button class="rh-qi ${x.id === ui.ofSel ? "on" : ""}" data-act="of-pick" data-k="${x.id}" aria-pressed="${x.id === ui.ofSel}"><b class="mono" style="width:52px;flex:none">${fmt(x.dc1_at, { hour: "2-digit", minute: "2-digit", hour12: false })}</b><span class="sc-p-t"><b>${esc(x.first_name)} ${esc(x.surname)}</b><span class="note">${esc(x.track_name || "No track yet")}${new Date(x.dc1_at).toDateString() === today ? "" : ` · ${fmtDay(x.dc1_at)}`}</span></span><span class="pill ${past ? "now" : ""}">${past ? "Add notes" : "Booked"}</span></button>`; }).join("") : `<p class="empty">No calls booked. Open some call times below.</p>`}
        <a class="link sm" href="#/portal/calls">All calls</a></div>
      <div class="card rh-grade">${a ? `<div class="sc-h"><div><span class="eyebrow">${fmtAt(a.dc1_at)} · ${esc(a.ref)}</span><h2>${esc(a.first_name)} ${esc(a.surname)}</h2><span class="note">${esc(a.city || "")} · ${esc(a.phone || "")} · ${esc(a.email)}</span></div>
          <div class="actions">${a.phone ? `<a class="btn sm ghost" href="${waLink(a.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${INFO?.call_link || ov.call_link ? `<a class="btn sm" href="${esc(INFO?.call_link || ov.call_link)}" target="_blank" rel="noopener">Join call</a>` : ""}</div></div>
        <div class="sc-2b"><dl class="s3-kv"><dt>Readiness</dt><dd>${a.score != null ? `${a.score}%` : "—"}${a.score_digital != null ? ` · digital ${a.score_digital}%, communication ${a.score_comms}%` : ""}</dd><dt>Background</dt><dd>${esc(a.edu || "")} · NYSC ${esc(a.nysc || "")}</dd><dt>Right now</dt><dd>${esc(a.situation || "")}</dd><dt>15 hours a week</dt><dd>${esc(a.hours || "")}</dd><dt>Laptop · internet</dt><dd>${esc(a.laptop || "")} · ${esc(a.internet || "")}</dd></dl>
          <div class="stack"><div class="rh-quote"><span class="eyebrow">Why they applied</span><p>“${esc(a.motivation || "")}”</p></div>${a.zuri_summary ? `<div class="rh-quote gold"><span class="eyebrow">Zuri summary</span><p style="white-space:pre-line">${esc(a.zuri_summary)}</p></div>` : ""}
            ${[a.hours !== "Yes" ? "They weren't sure about 15 hours a week. Ask what their evenings look like." : "", a.internet && a.internet !== "Yes" ? "Internet isn't reliable. Ask where they'll join live classes from." : "", a.laptop && a.laptop !== "Yes" ? "No laptop of their own. Ask how they'll do the work." : ""].filter(Boolean).map((t) => `<div class="rh-quote gold"><span class="eyebrow">Ask about</span><p>${t}</p></div>`).join("")}</div></div>
        <form class="form call-form rh-callf" data-k="${k}" novalidate><b>After the call</b>
          <div class="field"><span class="lbl">How ready are they? (1–10)</span><div class="rh-sc">${[...Array(10)].map((_, i) => `<button type="button" class="rh-s ${sc === i + 1 ? "on" : ""}" data-act="of-score" data-k="${i + 1}">${i + 1}</button>`).join("")}</div></div>
          <div class="grid2"><div class="field"><label for="dt-${k}">Track you agreed</label><select id="dt-${k}" data-act-change="track" data-k="${k}"><option value="">Choose one</option>${ov.tracks.map((t) => `<option value="${t.code}" ${a.track_code === t.code ? "selected" : ""}>${esc(t.name)}</option>`).join("")}<option value="NONE">None of these fit</option></select></div>
            <div class="field" id="wi-${k}" hidden><label for="wt-${k}">What are they interested in?</label><select id="wt-${k}" data-act-change="interest" data-k="${k}"><option>Software development</option><option>Product design</option><option>Cybersecurity</option><option>Sales</option><option>Other</option></select><input id="wo-${k}" hidden placeholder="Type it"></div></div>
          <div id="ri-${k}"><div class="field"><span class="lbl">Your recommendation</span><div class="rh-sc">${Object.entries(REC_L).map(([v, l]) => `<label class="rh-rec ${rc === v ? "on" : ""}"><input type="radio" name="rec-${k}" value="${v}" ${rc === v ? "checked" : ""} data-act="of-rec"> ${l}</label>`).join("")}</div></div>
            <div class="field"><label for="rw-${k}">One line on why</label><input id="rw-${k}" placeholder="e.g. Clear goals, laptop and internet confirmed"></div></div>
          <div class="field"><label for="dn-${k}">Notes for the Admissions Admin (optional)</label><textarea id="dn-${k}" rows="2" placeholder="Anything they should know"></textarea></div>
          <div class="actions"><button class="btn" type="submit">Save and send for a decision</button></div></form>` : `<p class="empty">Pick a call to see the applicant's brief.</p>`}</div></section>
    <section class="sc-2b">
      <div class="card" id="times"><span class="eyebrow">My call times · next 5 working days</span><h2 class="sc-h2">${openT} open</h2><p class="note">Tap a time to open or close it. Applicants book from their application page.</p>
        <div class="hm-wrap"><div class="rh-grid"><span></span>${days.map((d) => `<b>${fmt(d, { weekday: "short", day: "numeric" })}</b>`).join("")}
          ${CALL_TIMES.map((t) => `<span class="mono note">${t}</span>${days.map((d) => { const s = slotAt(d, t); return s ? (s.booked_by ? `<button class="rh-slot booked" disabled title="${esc(s.booked_by)}">Booked</button>` : `<button class="rh-slot open" data-act="rm-slot" data-k="${s.id}" aria-label="Close ${t}">Open</button>`) : `<button class="rh-slot" data-act="of-open" data-k="${iso(d, t)}" aria-label="Open ${t}">+</button>`; }).join("")}`).join("")}</div></div>
        <a class="link sm" href="#/portal/times">More days</a></div>
      <div class="card"><span class="eyebrow">My week</span><h2 class="sc-h2">${h.calls_week} call${h.calls_week === 1 ? "" : "s"} done</h2>
        <div class="rh-minis">${miniStat("Recommended to offer", h.recs_week)}${miniStat("Average readiness score", h.avg_score ?? "—")}${miniStat("Waiting to book", waiting)}</div></div></section>`,
    { eyebrow: todayEyebrow("Today's calls"), actions: `<a class="btn ghost" href="#/portal/apps">Applications</a><a class="btn" href="#times">Add call times</a>` });
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
  return `<details class="arow" data-id="${a.id}" data-g="${g}" ${ui.open === a.id ? "open" : ""} ${hidden ? "hidden" : ""}><summary><span class="aav">${esc(ini)}</span><span class="an"><b>${esc(a.first_name)} ${esc(a.surname)}${a.pilot ? ` <span class="pill gold">Pilot</span>` : ""}</b><span class="note">${esc(a.ref)} · ${esc(a.track_name || "Track not agreed yet")}</span></span><span class="anext">${esc(nextStep(a))}</span>${pill(a.status)}</summary>
    <div class="abody">${details(a)}${recCard(a)}${decCard(a)}${acts ? `<div class="staff-act">${acts}</div>` : ""}
      <details class="atl" data-act-toggle="timeline" data-k="${a.id}"><summary class="link sm">Timeline & emails</summary><div class="tl-body"><p class="note">Loading…</p></div></details></div></details>`;
}

async function loadAdm() {
  const [apps, ov] = await Promise.all([rpc("adm_applications"), rpc("adm_overview")]);
  return { apps, ov };
}

/* ---------- admissions: tabs ---------- */
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
    return `<details class="arow" data-id="${a.id}" ${ui.open === a.id ? "open" : ""}><summary><span class="aav">${esc(((a.first_name[0] || "") + (a.surname[0] || "")).toUpperCase())}</span><span class="an"><b>${esc(a.first_name)} ${esc(a.surname)}${a.pilot ? ` <span class="pill gold">Pilot</span>` : ""}</b><span class="note">${esc(a.matric || a.ref)} · ${esc(a.track_name || "")}</span></span><span class="anext">${esc(line(a))}</span>${pill(a.status)}</summary>
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

const TEST_MODES = [["normal", "Normal (live)", "A week opens when the week before it is passed and its start date has come."],
  ["progress", "Progress only (testing)", "Dates are ignored. A week opens as soon as all lessons and tasks in the week before are done and graded. Use this to test the locks."],
  ["open", "All weeks open (content check)", "Every week is open, with no locks. Use this only to read through lessons and tasks."]];
const TEST_MSG = { progress: "Testing: dates are ignored. Weeks open by progress only.", open: "Testing: students can see every week right now." };
async function tabSettings() {
  const [s, mode, pilot] = await Promise.all([rpc("admin_settings"), rpc("admin_test_mode", {}).catch(() => rpc("admin_test_unlock", {}).then((on) => (on ? "open" : "normal")).catch(() => "normal")), ME.role === "super" ? rpc("admin_pilot", { p_action: "status" }).catch(() => null) : null]);
  const P = pilot && pilot.pilot, plink = P ? `${location.origin}/apply/pilot/${pilot.code}` : "";
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
      <div class="card"><h3>Jobnest platforms</h3><p class="note">Leave each one empty until it launches. Once filled in, students see the link on their Opportunities, Graduation and My Career pages.</p>
        ${f("st-careers", "Jobnest Careers (jobs and opportunities) link", s.site.careers_url, 'type="url" placeholder="https://careers.jobnestcareers.com"')}${f("st-recruit", "Jobnest Recruit (employers) link", s.site.recruit_url, 'type="url" placeholder="https://recruit.jobnestcareers.com"')}</div>
      <div class="card"><h3>Landing page</h3><p class="note">Optional. Each part shows on the Academy landing page only once it's filled in.</p>
        ${f("st-info", "Free info session link (e.g. a booking form)", s.site.info_session_url, 'type="url"')}${f("st-sample", "Sample lesson link", s.site.sample_lesson_url, 'type="url"')}
        <p class="lbl" style="margin-top:.6rem">Who supports you: names and photo links</p>
        ${TEAM.map(([r], i) => { let tm = {}; try { tm = JSON.parse(s.site.team || "{}") || {}; } catch { /* empty */ } const m = tm[r] || {};
          return `<div class="grid2">${f(`st-tn${i}`, `${r}: name`, m.name || "")}${f(`st-tp${i}`, `${r}: photo link`, m.photo || "", 'type="url"')}</div>`; }).join("")}</div>
      ${pilot ? `<div class="card pilot-card"><h3>Pilot cohort</h3>${P ? `<p class="note">Outside testers apply through this private link into their own cohort, so real applicants stay in ${esc(s.cohort.name)}. They never pay: admit them with <b>Record a bank transfer</b> on Payments.</p>
        <dl class="kv"><div><dt>Cohort</dt><dd>${esc(P.name)} · matric numbers like <span class="mono">${esc(P.matric)}</span></dd></div><div><dt>Testers</dt><dd>${pilot.applied} applied · ${pilot.admitted} admitted</dd></div><div><dt>Sign-ups</dt><dd>${P.open ? `<span class="pill ok">Open</span>` : `<span class="pill">Closed</span>`}</dd></div></dl>
        <div class="field"><label for="pl-link">Pilot application link</label><input id="pl-link" readonly value="${esc(plink)}"></div>
        <div class="actions"><button type="button" class="btn sm" data-act="copy-host" data-k="${esc(plink)}">Copy link</button><button type="button" class="btn sm ghost" data-act="pilot-${P.open ? "close" : "open"}">${P.open ? "Close sign-ups" : "Reopen sign-ups"}</button></div>
        <p class="note">When testing is over, run <b>cleanup_pilot.sql</b> in Supabase. It deletes the pilot cohort and every tester, and keeps everything else.</p>`
        : `<p class="note">Let outside testers try the whole student journey before launch, in their own cohort, without touching ${esc(s.cohort.name)}. You'll get a private application link to send them.</p>
        <div class="actions"><button type="button" class="btn sm" data-act="pilot-create">Start a pilot cohort</button></div>`}</div>` : ""}
      <div class="card"><h3>Testing</h3><p class="note">How weeks open in the student portal. Use a testing mode so the team can try the portal before the start date. Set it back to Normal before launch.</p>
        <div class="modes" role="radiogroup" aria-label="How weeks open">${TEST_MODES.map(([k, l, d]) => `<label class="consent mode-opt"><input type="radio" name="st-mode" value="${k}" ${mode === k ? "checked" : ""}> <span><b>${l}</b><br><span class="note">${d}</span></span></label>`).join("")}</div>
        <p class="note" id="st-unlock-msg" style="color:var(--danger,#B42318);font-weight:600">${TEST_MSG[mode] || ""}</p></div>
      <div class="card"><h3>Admission letter</h3><p class="note">Printed at the bottom of every admission letter.</p>${f("st-sname", "Signed by (full name)", s.site.signer_name)}${f("st-stitle", "Their title", s.site.signer_title)}</div>
    </div><p class="err" id="st-err" role="alert"></p><div class="actions" style="margin-top:1rem"><button class="btn" type="submit">Save settings</button></div></form>`);
}

const PERM_AREAS = [["Applications & calls", ["apps", "calls"]], ["Decisions & offers", ["decide"]], ["Payments", ["pay"]], ["Students", ["students"]], ["Grading", ["grading"]], ["Results & examinations", ["results", "exams"]],
  ["Internships", ["intern"]], ["Career, Discovery Call & jobs", ["dc2", "jobs"]], ["Pods, help & discussion", ["pods", "support"]], ["Content", ["content"]], ["Settings & emails", ["settings"]], ["Staff & access", ["staff"]]];
const TRACKED = ["facilitator", "coach"];
const ROLE_SHORT = { super: "SA", adm_admin: "AD", adm_officer: "AO", director: "PD", cohort_manager: "CM", facilitator: "FA", coach: "CC", academy_admin: "AC" };
async function tabStaff() {
  const [d, ov] = await Promise.all([rpc("super_staff2"), ui.ov && Date.now() - (ui.ovAt || 0) < 12e4 ? ui.ov : rpc("super_overview").catch(() => null)]);
  if (ov) { ui.ov = ov; ui.ovAt = Date.now(); }
  const L = d.staff, act = L.filter((x) => x.active), load = Object.fromEntries((ov?.staff || []).map((x) => [x.email, x]));
  const wk = (x) => x.last_seen_at && Date.now() - new Date(x.last_seen_at) < 7 * 864e5;
  const f = ui.staffF || "all", roles = [...new Set(L.map((x) => x.role))];
  const shown = L.filter((x) => f === "all" || x.role === f), pr = ui.permRole || "facilitator";
  const stat = (x) => !x.active ? ["Off", ""] : !x.account ? [x.invited_at ? `Invited ${fmtDay(x.invited_at)}` : "Not set up", "now"] : ["Active", "ok"];
  const scope = (x) => x.role === "super" ? "Everything" : ["adm_admin", "adm_officer"].includes(x.role) ? "Admissions" : x.track ? esc(x.track) : "All tracks";
  const opts = Object.entries(ROLE_NAMES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  const cellP = (r, ks) => { const nav = staffNav(r).map((x) => x.k), ok = ks.some((k) => nav.includes(k)); return !ok ? `<span class="pv no">—</span>` : TRACKED.includes(r) && !["pay", "settings", "staff", "decide"].includes(ks[0]) ? `<span class="pv tr">Own track</span>` : `<span class="pv yes">Yes</span>`; };
  const check = [...L.filter((x) => x.active && !x.account).map((x) => [x, `${x.invited_at ? `Invited ${fmtDay(x.invited_at)}` : "Never invited"} and hasn't set up their account.`, "Send invite"]),
    ...L.filter((x) => x.active && x.account && x.last_seen_at && Date.now() - new Date(x.last_seen_at) > 10 * 864e5).map((x) => [x, `Last signed in ${agoS(x.last_seen_at)}. Switch the account off if they've left.`, "Edit"])];
  shell("staff", "Staff &amp; access", `${act.length} active staff account${act.length === 1 ? "" : "s"}${check.length ? `, ${check.length} to check` : ""}. Each person only sees the pages, and the tracks, their role needs.`,
    `<section class="sc-kpis sc-kpis4">${[["Active staff", act.length, `across ${new Set(act.map((x) => x.role)).size} roles`], ["Not set up yet", act.filter((x) => !x.account).length, "added but no password yet"],
        ["Signed in this week", `${act.filter(wk).length} of ${act.length}`, `${act.filter((x) => !wk(x)).length} not seen for 7+ days`], ["Full access", L.filter((x) => x.active && ["super", "director"].includes(x.role)).length, "Super Admin and Programme Director"]]
      .map(([l, v, n]) => `<div class="card sc-kpi"><span class="eyebrow">${l}</span><b class="mono">${v}</b><span class="note">${n}</span></div>`).join("")}</section>
    <section class="card" style="padding:0;overflow:hidden"><div class="sc-h" style="padding:1.1rem 1.25rem .4rem"><h2>Team</h2>
        <div class="sc-tabs" role="group" aria-label="Filter by role"><button class="sc-tab" data-act="staff-f" data-k="all" aria-pressed="${f === "all"}">All <span class="mono">${L.length}</span></button>${roles.map((r) => `<button class="sc-tab" data-act="staff-f" data-k="${r}" aria-pressed="${f === r}">${ROLE_NAMES[r]} <span class="mono">${L.filter((x) => x.role === r).length}</span></button>`).join("")}</div></div>
      <div class="tbl-wrap" style="border:0"><table class="tbl cards"><thead><tr><th>Name</th><th>Role</th><th>Scope</th><th>Workload</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>
      ${shown.map((x) => { const [st, sc] = stat(x), w = load[x.email];
        return `<tr class="${x.active ? "" : "off"}"><td data-label="Name"><span class="sc-li"><span class="st-av">${staffIni(x.full_name)}</span><span class="sc-p-t"><b>${esc(x.full_name)}</b><span class="note">${esc(x.email)}</span></span></span></td>
          <td data-label="Role">${ROLE_NAMES[x.role] || x.role}</td><td data-label="Scope" class="note">${scope(x)}</td><td data-label="Workload" class="mono">${w && w.q != null ? `<b>${w.q}</b> <span class="note">${esc(w.what)}</span>` : "—"}</td>
          <td data-label="Last sign-in" class="note">${x.last_seen_at ? agoS(x.last_seen_at) : "never"}</td><td data-label="Status"><span class="pill ${sc}">${st}</span></td>
          <td class="sc-row-a">${x.active && !x.account ? `<button class="btn sm ghost" data-act="staff-invite" data-k="${esc(x.email)}">${x.invited_at ? "Resend invite" : "Send invite"}</button>` : ""}<button class="btn sm ghost" data-act="edit-staff" data-email="${esc(x.email)}" data-name="${esc(x.full_name)}" data-role="${x.role}" data-active="${x.active}" data-track="${x.track_code || ""}">Edit</button></td></tr>`; }).join("")}</tbody></table></div></section>
    <section class="sc-2">
      <div class="card"><span class="eyebrow">Permissions</span><h2 class="sc-h2">What each role can open</h2><p class="note">Pick a role to highlight it. The database checks the role on every request too, so a page someone can't open also can't be reached by typing its address.</p>
        <div class="sc-tabs" role="group" aria-label="Highlight a role" style="margin:.7rem 0">${Object.entries(ROLE_NAMES).map(([k, l]) => `<button class="sc-tab" data-act="perm-r" data-k="${k}" aria-pressed="${pr === k}">${l}</button>`).join("")}</div>
        <div class="tbl-wrap"><table class="tbl perm"><thead><tr><th>Area</th>${Object.entries(ROLE_NAMES).map(([k, l]) => `<th class="${pr === k ? "hi" : ""}" title="${l}">${ROLE_SHORT[k]}</th>`).join("")}</tr></thead>
          <tbody>${PERM_AREAS.map(([a, ks]) => `<tr><td><b>${a}</b></td>${Object.keys(ROLE_NAMES).map((r) => `<td class="${pr === r ? "hi" : ""}">${cellP(r, ks)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <p class="note" style="margin-top:.6rem">${Object.entries(ROLE_SHORT).map(([k, v]) => `${v} ${ROLE_NAMES[k]}`).join(" · ")}.<br>“Own track”: a facilitator or career coach with a track only sees students on that track.</p></div>
      <div class="stack">
        <form class="card form" id="staff-form" novalidate><span class="eyebrow">Invite</span><h2 class="sc-h2" id="sf-h">Add a staff member</h2>
          <div class="field"><label for="sf-email">Work email</label><input id="sf-email" placeholder="name@jobnestcareers.com" type="email"></div>
          <div class="field"><label for="sf-name">Full name</label><input id="sf-name" placeholder="e.g. Folake Adeyemi"></div>
          <div class="grid2"><div class="field"><label for="sf-role">Role</label><select id="sf-role">${opts}</select></div>
            <div class="field"><label for="sf-track">Track</label><select id="sf-track"><option value="">All tracks</option>${d.tracks.map((t) => `<option value="${t.code}">${esc(t.name)}</option>`).join("")}</select></div></div>
          <label class="consent"><input type="checkbox" id="sf-active" checked> Active (can sign in)</label>
          <label class="consent"><input type="checkbox" id="sf-invite" checked> Email them a link to set up their account</label>
          <p class="err" id="sf-err" role="alert"></p><div class="actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="reset">Clear</button></div></form>
        <div class="card"><span class="eyebrow">Accounts to check</span><h2 class="sc-h2">${check.length ? `${check.length} to look at` : "All accounts look fine"}</h2>
          ${check.length ? `<ul class="sc-people">${check.map(([x, why, btn]) => `<li><span class="sc-li"><span class="st-av">${staffIni(x.full_name)}</span><span class="sc-p-t"><b>${esc(x.full_name)}</b><span class="note">${why}</span></span>${btn === "Send invite" ? `<button class="btn sm ghost" data-act="staff-invite" data-k="${esc(x.email)}">${x.invited_at ? "Resend" : "Send invite"}</button>` : `<button class="btn sm ghost" data-act="edit-staff" data-email="${esc(x.email)}" data-name="${esc(x.full_name)}" data-role="${x.role}" data-active="${x.active}" data-track="${x.track_code || ""}">Edit</button>`}</span></li>`).join("")}</ul>` : `<p class="note">Everyone has set up their account and signed in recently.</p>`}
          <a class="link sm" href="#/portal/audit">Activity log: every grade, payment, decision and setting change</a></div></div></section>`,
    { eyebrow: "Organisation", actions: `<a class="btn" href="#staff-form" data-act="sf-new">Invite staff</a>` });
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
const stageOf = (w) => { const s = [[1, 1, 0], [2, 3, 1], [4, 11, 2], [12, 12, 3], [13, 14, 4], [15, 18, 5], [19, 19, 6], [20, 20, 7]].find(([a, b]) => w >= a && w <= b); return s ? ROUTE_STOPS[s[2]][1] : ""; };
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
  const projWk = LS.W.findIndex((w) => w.stage === 4), internEnd = LS.W.map((w, i) => (w.stage === 5 ? i : -1)).filter((i) => i >= 0).at(-1);
  const B = [["✍️", "Oath signed", oathSigned()], ["✅", "First week passed", wd >= 2], ["🔥", "5 weeks done", wd >= 5],
    ["💼", "Practical project", projWk >= 0 && weekDone(projWk + 1)], ["🏢", "Internship", internEnd != null && weekDone(internEnd)], ["🎓", "Graduate", !!cert]];
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
  exam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="M9 12l2 2 4-4M9 18h6"/></svg>`,
};
const LKIND = { lesson: "Video lesson", quiz: "Weekly assessment", task: "Activity", logweek: "Internship logbook", oath: "Student Oath", guide: "Getting started", exam: "Examination" };
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
const MORE_PAGES = [["results", "Results", "Assessments, examinations, project and final grade"], ["assignments", "Assignments & Projects", "Submissions, grades and feedback"], ["cohort", "My Cohort", "Pod, live sessions, announcements, discussion"],
  ["career", "My Career", "Goals, skills, readiness, interview prep", 18], ["opps", "Opportunities", "Jobs, internships and applications", 19],
  ["profile", "Profile & Achievements", "Student ID, certificate, badges"], ["graduate", "Graduation & next steps", "Certificate, your job news, alumni check-ins"], ["help", "Help & Support", "FAQs and how to get help"]];

/* ---------- derived state ---------- */
const lsStart = () => new Date(LS.L.start_date + "T00:00:00+01:00");
const weekStartAt = (wi) => new Date(lsStart().getTime() + wi * 7 * DAY);
const weekDue = (wi) => new Date(weekStartAt(wi).getTime() + 4 * DAY + 17 * 36e5);
const graceDue = (wi) => new Date(weekStartAt(wi).getTime() + 6 * DAY + (23 * 60 + 59) * 6e4);
const fmtD = (d) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
const PASS = () => LS.L.pass_mark || 70;
const row = (it) => LS.L.progress[it.key];
const examOf = (it) => (LS.L.results || {})[it.paper] || null;
const isDoneIt = (it) => { if (it.type === "exam") { const e = examOf(it); return !!e && ["Graded", "Missed"].includes(e.status); } const r = row(it); return !!r && r.status !== "revise"; };
const quizCorrect = (r) => r ? (r.data?.correct ?? Math.round((r.score || 0) * 5 / 100)) : null;
const marks1 = (n) => n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
function itemScoreIt(it) { const r = row(it); if (!r) return null; if (it.type === "quiz") return r.score ?? null; if (it.proj) return r.status === "graded" ? r.score : null; return null; }
function weekProgress(wi) { let d = 0, n = 0; LS.W[wi].items.forEach((it) => { if (it.opt) return; n++; if (isDoneIt(it)) d++; }); return { d, n, pct: n ? Math.round((d / n) * 100) : 100 }; }
const weekItemsDone = (wi) => { const p = weekProgress(wi); return p.d === p.n; };
// Weeks no longer have a pass mark: a week is finished when its required steps are done (Programme & Grading Policy).
function weekGate(wi) {
  return null;
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
const dateOpen = (wi) => wi === 0 || LS.L.ignore_dates || Date.now() >= weekStartAt(wi).getTime() - 2 * DAY;
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
  return it.type === "lesson" ? `${LKIND.lesson}${it.mins ? ` · ${it.mins} min` : ""}` : it.type === "quiz" ? `${LKIND.quiz} · ${QUIZ_N} questions · ${QUIZ_MIN} min · one attempt`
    : it.type === "exam" ? (() => { const e = examOf(it); return `${LKIND.exam} · ${it.paper === "fund" ? 30 : 40} questions · ${e?.minutes || (it.paper === "fund" ? 30 : 45)} min${e && LS.L.exam_published ? ` · ${fmtDateD(e.date)}` : ""}`; })()
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
  lsShell("home", pageHead(`Week ${cur + 1} of ${LS.W.length} · Stage ${wk.stage + 1}: ${esc(COURSE_STAGES[wk.stage]?.title || "")} · ${esc(C.me.track || "")}`, `${greeting()}, ${esc(C.me.first_name)}`, esc(before && !weekDone(0) && !LS.cert && !Object.keys(LS.L.progress || {}).some((k) => (findItem(k)?.wi || 0) > 0) ? `The programme starts on ${fmtDateD(LS.L.start_date)}. You can start Week 1 now.` : encouragement(cur))) +
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
      <a class="sti" href="#/learn/results"><span class="eyebrow">Assessments</span><b class="mono">${marks1(LS.L.results?.assess_score ?? 0)}<small>/40</small></b><span class="note">${LS.L.results?.assess_taken || 0} of 10 taken</span></a>
      <a class="sti" href="#/learn/results"><span class="eyebrow">Final result</span><b class="mono">${LS.L.results?.class ? esc(LS.L.results.class) : "—"}</b><span class="note">${LS.L.results?.class ? `${LS.L.results.final}/100` : LS.L.results?.status === "Complete" ? "waiting to be published" : "pending"}</span></a></div>
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
    <div class="lh-prog" id="tour-progress"><div class="lh-bar"><i style="width:${pct}%"></i></div><span><b class="mono">${pct}%</b> complete · Week ${current + 1} of ${LS.W.length} · assessments <b class="mono">${marks1(LS.L.results?.assess_score ?? 0)}/40</b></span></div></div>
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
  const ex = it.type === "exam" ? examOf(it) : null;
  const pill = ex ? `<span class="pill ${ex.status === "Graded" ? "ok" : ex.status === "Missed" ? "bad" : ex.status === "Open" || ex.status === "In progress" ? "now" : ""}">${ex.status === "Graded" ? `${ex.correct}/${ex.questions}` : ex.status}</span>`
    : it.type === "quiz" && r ? `<span class="pill ok">${quizCorrect(r)}/5 · ${marks1(quizCorrect(r) * 0.8)} marks</span>`
    : r?.status === "revise" ? `<span class="pill bad">Revise</span>` : r?.status === "submitted" ? `<span class="pill info">Grading</span>` : it.type === "logweek" && r ? (r.data?.signed ? `<span class="pill ok">Signed</span>` : `<span class="pill info">To sign</span>`) : dn ? `<span class="pill ok">${sc != null ? sc + "%" : "Done"}</span>` : `<span class="pill">Start</span>`;
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
      <ul class="almost-l">${openLeft.slice(0, 10).map(({ it, i }) => it ? `<li><a class="link" href="#/learn/learning/${i + 1}/${it.key}">Week ${i + 1}: ${esc(it.title)}</a>${row(it)?.status === "submitted" ? ` <span class="pill info">Waiting for grading</span>` : row(it)?.status === "revise" ? ` <span class="pill bad">Revise</span>` : ""}</li>` : `<li><a class="link" href="#/learn/learning/${i + 1}">Week ${i + 1}: finish this week</a></li>`).join("")}</ul></div>` : "";
  const next = (un && weekDone(wi) && wi < LS.W.length - 1 ? `<div class="celebrate"><div><b>Week ${wi + 1} complete.</b> <span class="note">${unlockedW(wi + 1) ? `Week ${wi + 2}: ${esc(LS.W[wi + 1].title)} is now unlocked.` : `Week ${wi + 2} opens on ${fmtD(new Date(weekStartAt(wi + 1).getTime() - 2 * DAY))}.`}</span></div>${unlockedW(wi + 1) ? `<a class="btn sm" href="#/learn/learning/${wi + 2}">Start Week ${wi + 2} →</a>` : ""}</div>` : "");
  const head = (extra) => `<div class="stage-head wk-head" id="tour-head"><div class="row"><div><p class="eyebrow">Week ${wi + 1} of ${LS.W.length} · Stage ${wk.stage + 1}: ${esc(st.title)}</p><h2 style="margin-top:.45rem">${esc(wk.title)}</h2></div>${weekPill(wi, un)}</div>${extra}</div>`;
  if (st.welcome) return head(`<div class="welcome"><p class="big">Congratulations, ${esc(me.first_name)}. You took a bold step.</p>
      <p>Choosing to invest in yourself and your future takes courage, and you've already done the hardest part: you started. We're proud to have you in ${esc(LS.C.cohort.name)}.</p>
      <p>Over the next ${LS.W.length} weeks you'll learn skills employers are hiring for, prove them in assessments and examinations, solve a real business problem in your practical project, and gain real work experience in your internship. Some weeks will stretch you. That is where the growth happens, and we'll be beside you every week.</p>
      <p>Show up, ask questions and keep going. We can't wait to see you build a career you are proud of.</p><div><span class="sig">The Jobnest Academy Team</span></div></div>
    <div class="bar" aria-hidden="true"><i style="width:${p.pct}%"></i></div>
    ${oathSigned() ? "" : `<div class="gate">${LICON.lock}<span>Complete the ${p.n} required tasks below. <b>Week 2 stays locked until you read and sign your Student Oath.</b></span></div>`}`) + `<div class="items" id="tour-items">${items}</div>${next}`;
  const tab = ui.wtab || "tasks", sess = un ? lsSessions().filter((s) => s.wi === wi)[0] : null;
  const stWeeks = LS.W.map((w, i) => (w.stage === wk.stage ? i + 1 : null)).filter(Boolean);
  const tabs = [["tasks", "Tasks", `${p.d}/${p.n}`], ["about", "About this week", ""], ["res", "Resources", String((wk.resources || []).length)]];
  const lockMsg = !un ? `<div class="gate">${LICON.lock}<span><b>Preview.</b> ${wi === 1 && !oathSigned() ? "Opens when you sign your Student Oath in Week 1." : !weekDone(wi - 1) ? `Opens when you finish Week ${wi}: ${esc(LS.W[wi - 1].title)}.` : `Opens on ${fmtD(new Date(weekStartAt(wi).getTime() - 2 * DAY))}.`}</span></div>` : "";
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
      ${wk.stage >= 1 && wk.stage <= 2 ? `<h3>How this week counts</h3><p class="note">This week's assessment has 5 questions and <b>one attempt</b>. Each correct answer is worth 0.8 marks, so it adds up to 4 marks to your 40 assessment marks. Your week task gets feedback from your facilitator but doesn't count towards your final score.</p>` : wk.stage === 3 ? `<h3>How this week counts</h3><p class="note">The two examinations give up to 60 marks: (correct answers ÷ 70) × 60.</p>` : wk.stage === 4 ? `<h3>How this week counts</h3><p class="note">Your final project is graded out of 100 against the rubric. That score goes straight into your final result.</p>` : ""}
      ${sess ? `<h3>Live session</h3><ul class="sess-list">${sessionRow(sess)}</ul>` : ""}
      <h3>About Stage ${wk.stage + 1}: ${esc(st.title)}</h3><p>${esc(st.objective || "")}</p>
      <dl class="kv"><div><dt>Weeks</dt><dd>${stWeeks.length > 1 ? `Weeks ${stWeeks[0]}–${stWeeks.at(-1)}` : `Week ${stWeeks[0]}`}</dd></div>${st.facilitators ? `<div><dt>Facilitators</dt><dd>${esc(st.facilitators)}</dd></div>` : ""}</dl></div>`;
  if (tab === "res") body = `<div class="card"><ul class="res">${(wk.resources || []).map((r) => `<li>${r[2] ? `<a class="resbtn" href="${esc(r[2])}" target="_blank" rel="noopener" download>${LICON.file}<span>${esc(r[0])}</span><span class="tag">${r[1]}</span></a>` : `<span class="resbtn" aria-disabled="true">${LICON.file}<span>${esc(r[0])}</span><span class="tag">${r[1]}</span></span>`}</li>`).join("")}</ul><p class="note" style="margin-top:.6rem">Your facilitators upload this week's files here.</p></div>`;
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
  const d = r?.data || {}, retake = false, att = 1, gate = LS.W[wi].stage >= 1;
  const Q = ui.quiz && ui.quiz.key === it.key ? ui.quiz : null;
  if (Q) return `<div class="qtimer" id="qtimer" aria-live="off"><span>⏱ <b class="mono" id="qt-left">--:--</b> left</span><span class="note">Question <b id="qt-done">0</b> of ${Q.d.qs.length} answered</span></div>
    <form id="ls-quiz" data-k="${it.key}" novalidate>${Q.d.qs.map((q, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(q.q)}</legend>${q.o.map((o, oi) => `<label class="opt"><input type="radio" name="q${qi}" value="${oi}" ${Q.ans[qi] === oi ? "checked" : ""}> ${esc(o)}</label>`).join("")}</fieldset>`).join("")}
      <p class="err" id="quiz-err" role="alert"></p><div style="margin-top:1rem"><button class="btn" type="submit">Submit answers</button></div></form>`;
  if (r) {
    const c = quizCorrect(r), pass = c >= 3;
    return `<div class="result ${pass ? "pass" : "fail"}">You got <b>${c} of 5</b> correct: <b>${marks1(c * 0.8)} of 4 marks</b> towards your 40 assessment marks. ${c === 5 ? "Full marks!" : pass ? "Well done!" : "Review this week's lessons before the examinations."}${d.late ? " Time ran out, so unanswered questions were marked wrong." : ""}</div>
      ${false ? `<div class="card retake"><h3>Below ${PASS()}%: redo the lessons, then retake</h3><p class="note">Go back through this week's lessons. When you've marked them complete again, you get <b>one retake</b> with new questions. Your best score counts.</p><div><button class="btn" data-act="ls-retry" data-k="${it.key}">Redo this week's lessons</button></div></div>` : ""}
      ${false ? `<div class="card retake"><h3>You've used your retake</h3><p class="note">Your week result uses your best score. If the week isn't passed, you can repeat the week from the week page.</p></div>` : ""}
      <h3 style="margin-top:1.2rem">Your answers</h3>${quizReview(d)}`;
  }
  return `<div class="card qstart"><h3>${retake ? "Your retake" : "Before you start"}</h3><ul class="reqs"><li>The assessment contains <b>${QUIZ_N} questions</b>.</li><li>You have <b>${QUIZ_MIN} minutes</b> to complete it once you start.</li><li>Answers are submitted automatically when the time runs out.</li>
    <li><b>You have one attempt.</b> There are no resits, so finish this week's lessons first.</li><li>Each correct answer is worth 0.8 marks: up to 4 of your 40 assessment marks.</li><li>Assessments close when the examination week (Week 12) starts.</li></ul>
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
/* ---------- examinations (Week 12) and results ---------- */
// Practical project rubric, out of 100 (draft for approval). [criterion, marks, what earns full marks]
const PROJECT_RUBRIC = [["Understanding of the brief", 15, "Every requirement in the brief is understood and addressed."],
  ["Quality and accuracy", 25, "Deliverables are correct, complete and free of errors."],
  ["Track skills", 20, "Uses the tools and techniques taught in the track confidently and correctly."],
  ["Problem-solving", 15, "Sensible decisions, clearly explained, with options considered."],
  ["Presentation", 15, "Professional, well organised and easy for a client to use."],
  ["Planning and self-review", 10, "Plan followed, submitted on time, honest self-review against the rubric."]];
const RUB_LEVELS = [["Not shown", 0], ["Weak", 0.4], ["Fair", 0.6], ["Good", 0.8], ["Excellent", 1]];
const projRubricTable = () => `<table class="tbl rub"><thead><tr><th>Criterion</th><th class="mono">Marks</th></tr></thead><tbody>${PROJECT_RUBRIC.map(([n, m, h]) => `<tr><td><b>${n}</b><span class="note">${h}</span></td><td class="mono">${m}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="mono">100</td></tr></tbody></table>
  <p class="note">Each criterion is marked Not shown (0), Weak (40%), Fair (60%), Good (80%) or Excellent (full marks).</p>`;
const GRADE_SCALE = [["A", "Distinction", "80–100"], ["B", "Merit", "60–79"], ["C", "Pass", "50–59"], ["F", "Fail", "0–49"]];
const scaleTable = () => `<table class="tbl"><thead><tr><th>Grade</th><th>Classification</th><th>Final score</th></tr></thead><tbody>${GRADE_SCALE.map(([g, c, r]) => `<tr><td class="mono">${g}</td><td>${c}</td><td class="mono">${r}</td></tr>`).join("")}</tbody></table>`;
const resPill = (st) => `<span class="pill ${["Graded", "Complete"].includes(st) ? "ok" : st === "Missed" ? "bad" : ["Open", "In progress", "Submitted", "Revision requested"].includes(st) ? "now" : ""}">${esc(st)}</span>`;
const paperName = (p) => p === "fund" ? "Fundamental Examination" : "Core Skill Learning Examination";
function examWhen(e) {
  if (!LS.L.exam_published) return "Date and time to be published by Student Success";
  return `${fmtDateD(e.date)} · start between ${fmtTime(new Date(e.opens))} and ${fmtTime(new Date(e.closes))}`;
}
function examRules() {
  const R = LS.L.results || {}, f = R.fund || {}, c = R.core || {};
  return `<div class="lesson-doc"><h3>When you sit each paper</h3><ul>
      <li><b>Fundamental Examination</b>: 30 questions in ${f.minutes || 30} minutes. ${LS.L.exam_published && f.date ? `Your day: <b>${fmtDateD(f.date)}</b>.` : "Monday or Tuesday of Week 12, depending on your track."}</li>
      <li><b>Core Skill Learning Examination</b>: 40 questions for your track in ${c.minutes || 45} minutes. ${LS.L.exam_published && c.date ? `Your day: <b>${fmtDateD(c.date)}</b>.` : "Wednesday, Thursday or Friday of Week 12, depending on your track."}</li>
      <li>Start any time inside the window on your day${LS.L.exam_published && f.opens ? ` (${fmtTime(new Date(f.opens))} to ${fmtTime(new Date(f.closes))})` : ""}. Your timer starts when you press Start and can't be paused.</li></ul>
    <h3>Rules</h3><ul>
      <li>One sitting per paper. Your answers save as you go, so a dropped connection doesn't lose your work. Open the paper again to carry on.</li>
      <li>When time runs out, your saved answers are submitted automatically.</li>
      <li>Work on your own. Questions are drawn at random, so every candidate's paper is different.</li>
      <li>You only see the examination for your own track.</li>
      <li>If you miss a paper, speak to Student Success straight away. A resit is only possible when staff authorise it, and it replaces your earlier score.</li></ul>
    <h3>How the examinations count</h3><p>(correct answers across both papers ÷ 70) × 60 gives up to 60 marks. Your final score is (assessments /40 + examinations /60 + project /100) ÷ 2.</p></div>`;
}
function examCard(it) {
  const e = examOf(it); if (!e) return "";
  const f = findItem(it.key), rules = f ? LS.W[f.wi].items.find((x) => x.title === "Read the examination rules") : null, rd = !rules || isDoneIt(rules);
  const st = e.status;
  let body = "";
  if (st === "Graded") body = `<div class="result pass">You got <b>${e.correct} of ${e.questions}</b> correct.${e.late ? " Time ran out, so your saved answers were submitted." : ""}</div>`;
  else if (st === "Missed") body = `<div class="result fail">You missed this examination. Speak to Student Success as soon as possible. A resit is only possible when staff authorise it.</div><div class="actions"><a class="btn sm ghost" href="#/learn/help">Contact Student Success</a></div>`;
  else if (st === "In progress") body = `<div class="actions"><button class="btn gold" data-act="ex-start" data-k="${it.paper}">Continue the examination</button></div>`;
  else if (st === "Open") body = !LS.L.exam_published ? "" : !rd ? `<p class="note">Read the examination rules first, then this opens.</p>` : `<div class="actions"><button class="btn gold" data-act="ex-start" data-k="${it.paper}">Start the examination</button></div>`;
  else if (st === "Upcoming") body = `<p class="note">This opens on your examination day.</p>`;
  return `<div class="card exam-card"><div class="ch"><h3>${esc(e.title)}</h3>${resPill(st)}</div>
    ${e.resit ? `<div class="notice">Resit authorised for <b>${fmtDateD(e.resit.date)}</b>. It replaces your earlier score.</div>` : ""}
    <dl class="kv"><div><dt>When</dt><dd>${examWhen(e)}</dd></div><div><dt>Questions</dt><dd>${e.questions}</dd></div><div><dt>Time limit</dt><dd>${e.minutes} minutes</dd></div></dl>${body}</div>`;
}
function examView(wi) {
  if (ui.exam) return examPaper();
  const W = LS.W[wi], rules = W.items.find((x) => x.title === "Read the examination rules"), R = LS.L.results || {};
  return `<p style="max-width:64ch">Two timed examinations this week: the <b>Fundamental Examination</b> and the <b>Core Skill Learning Examination</b> for your track. Together they give up to 60 of your final marks.</p>
    ${LS.L.exam_published ? "" : `<div class="notice">Student Success publishes your examination dates and times before Week 12.</div>`}
    ${rules ? `<div class="items">${itemRow(wi, rules, true)}</div>` : ""}
    <div class="cols">${W.items.filter((x) => x.type === "exam").map(examCard).join("")}</div>
    ${R.exam_score != null ? `<div class="card"><div class="ch"><h3>Examination score</h3><b class="mono">${R.exam_score}/60</b></div><p class="note">(${R.fund.score} + ${R.core.score} correct) ÷ 70 × 60</p></div>` : ""}`;
}
function examPaper() {
  const X = ui.exam;
  return `<div class="card exam-head"><b>${paperName(X.paper)}</b><span class="note">${X.d.qs.length} questions · answers save as you go</span></div>
    <div class="qtimer" id="ex-timer" aria-live="off"><span>⏱ <b class="mono" id="ex-left">--:--</b> left</span><span class="note"><b id="ex-done">${X.ans.filter((x) => x != null).length}</b> of ${X.d.qs.length} answered · <span id="ex-saved">Saved</span></span></div>
    <form id="ls-exam" data-p="${X.paper}" novalidate>${X.d.qs.map((q, qi) => `<fieldset class="q"><legend>${qi + 1}. ${esc(q.q)}</legend>${q.o.map((o, oi) => `<label class="opt"><input type="radio" name="x${qi}" value="${oi}" ${X.ans[qi] === oi ? "checked" : ""}> ${esc(o)}</label>`).join("")}</fieldset>`).join("")}
      <p class="err" id="ex-err" role="alert"></p><div style="margin-top:1rem"><button class="btn" type="submit">Submit examination</button></div></form>`;
}
let XTIMER = null, XSAVE = null;
function examTick() {
  const X = ui.exam, el = $("#ex-left"); if (!X || !el) { clearInterval(XTIMER); XTIMER = null; return; }
  const left = Math.max(0, Math.round((X.deadline - (Date.now() + X.skew)) / 1000));
  el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  $("#ex-timer").classList.toggle("warn", left <= 120);
  $("#ex-done").textContent = X.ans.filter((x) => x != null).length;
  if (left <= 0 && !X.sent) { X.sent = true; toast("Time's up. Submitting your answers."); examSubmit(true); }
}
function examSave() {
  const X = ui.exam; if (!X) return; const s0 = $("#ex-saved"); if (s0) s0.textContent = "Saving…";
  clearTimeout(XSAVE); XSAVE = setTimeout(() => rpc("learn_exam_save", { p_paper: X.paper, p_answers: X.ans })
    .then(() => { const s = $("#ex-saved"); if (s) s.textContent = "Saved"; })
    .catch(() => { const s = $("#ex-saved"); if (s) s.textContent = "Not saved yet. Check your connection."; }), 700);
}
async function examSubmit(auto) {
  const X = ui.exam; if (!X) return;
  if (!auto) { const n = X.ans.filter((x) => x == null).length; if (!confirm(n ? `${n} question${n === 1 ? " is" : "s are"} unanswered. Submit the examination anyway? You can't change it afterwards.` : "Submit the examination? You can't change it afterwards.")) return; }
  clearInterval(XTIMER); XTIMER = null; clearTimeout(XSAVE);
  let r; try { r = await busy($("#ls-exam button[type=submit]"), () => rpc("learn_exam_submit", { p_paper: X.paper, p_answers: X.ans })); } catch { X.sent = false; XTIMER = setInterval(examTick, 1000); return; }
  if (!r) return;
  ui.exam = null; LS.L = r; toast("Examination submitted"); await lsRender(); window.scrollTo({ top: 0, behavior: "smooth" });
}
function lsResultsPage() {
  const R = LS.L.results || {}, A = R.assessments || [], P = R.project || {}, done = R.status === "Complete";
  const tile = (l, v, mx, note) => `<div class="sti"><span class="eyebrow">${l}</span><b class="mono">${v}<small>/${mx}</small></b><span class="note">${note}</span></div>`;
  const fin = R.class ? `<div class="card res-final ok"><span class="eyebrow">Final result${R.published_at ? ` · published ${fmtDay(R.published_at)}` : ""}</span><div class="res-big"><b class="mono">${R.final}<small>/100</small></b><span><b>${esc(R.class)}</b><span class="note">Grade ${esc(R.grade)}</span></span></div></div>`
    : done ? `<div class="card res-final"><span class="eyebrow">Final result</span><h3>Being checked</h3><p class="note">All your scores are in. Your final score and classification appear here when the Programme Director publishes results.</p></div>`
    : `<div class="card res-final"><span class="eyebrow">Final result</span><h3>Pending</h3><p class="note">Your final result is worked out once every part below has a score:</p><ul class="reqs">${(R.missing || []).map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>`;
  lsShell("results", pageHead("Results", "Your results", "Final score = (assessments /40 + examinations /60 + practical project /100) ÷ 2. Scores are never rounded up.") + `<section class="wrap pagebody">
    <div class="strip res-strip">${tile("Assessments", marks1(R.assess_score ?? 0), 40, `${R.assess_taken || 0} of 10 taken${R.assess_missed ? ` · ${R.assess_missed} missed` : ""}`)}
      ${tile("Examinations", R.exam_score ?? "—", 60, R.exam_score != null ? "both papers sat" : "after both papers")}
      ${tile("Practical project", P.score ?? "—", 100, P.status || "")}</div>
    ${fin}
    <div class="card"><div class="ch"><h3>Weekly assessments</h3><b class="mono">${marks1(R.assess_score ?? 0)}/40</b></div><p class="note">Ten assessments, 5 questions each, one attempt. Each correct answer is 0.8 marks. They close when the examination week starts${R.assess_close ? ` (${fmtDay(R.assess_close)})` : ""}.</p>
      <div class="tbl-wrap"><table class="tbl res-tbl cards"><thead><tr><th>Assessment</th><th>Week</th><th>Status</th><th class="mono">Correct</th><th class="mono">Marks</th></tr></thead><tbody>
      ${A.map((x, i) => `<tr><td data-label="Assessment">${esc(x.title)}</td><td data-label="Week" class="mono">${x.week}</td><td data-label="Status">${resPill(x.status)}</td><td data-label="Correct" class="mono">${x.correct != null ? x.correct + "/5" : "—"}</td><td data-label="Marks" class="mono">${x.marks != null ? marks1(x.marks) + "/4" : "—"}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card"><div class="ch"><h3>Examinations</h3><b class="mono">${R.exam_score ?? "—"}/60</b></div>
      <div class="tbl-wrap"><table class="tbl res-tbl cards"><thead><tr><th>Paper</th><th>Date</th><th>Status</th><th class="mono">Correct</th></tr></thead><tbody>
      ${["fund", "core"].map((k) => { const e = R[k] || {}; return `<tr><td data-label="Paper">${paperName(k)}</td><td data-label="Date">${LS.L.exam_published && e.date ? fmtDateD(e.date) : "To be published"}</td><td data-label="Status">${resPill(e.status || "Upcoming")}</td><td data-label="Correct" class="mono">${e.score != null ? `${e.score}/${e.questions}` : "—"}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="note">Examination score = (Fundamental + Core correct answers) ÷ 70 × 60.</p></div>
    <div class="card"><div class="ch"><h3>Practical project</h3><b class="mono">${P.score ?? "—"}/100</b></div>
      <p>${resPill(P.status || "Not submitted")} ${P.graded_by ? `<span class="note">Graded by ${esc(P.graded_by)}</span>` : ""}</p>
      ${P.rubric ? `<table class="tbl rub"><tbody>${Object.entries(P.rubric).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v}/${(PROJECT_RUBRIC.find((r) => r[0] === k) || [0, "?"])[1]}</td></tr>`).join("")}</tbody></table>` : ""}
      ${P.feedback ? `<div class="card fb ok"><h3>Assessor feedback</h3><p>${esc(P.feedback)}</p></div>` : ""}</div>
    <div class="card"><h3>Grading scale</h3>${scaleTable()}</div></section>`);
}
const sampleLinks = (wi) => { const L = (LS.W[wi].resources || []).filter((r) => r[2]); return L.length ? `<div class="card samples"><h3>Files for this task</h3><ul class="res">${L.map((r) => `<li><a class="resbtn" href="${esc(r[2])}" target="_blank" rel="noopener" download>${LICON.file}<span>${esc(r[0])}</span><span class="tag">${r[1]}</span></a></li>`).join("")}</ul></div>` : ""; };
function lsItemView(wi, ii) {
  const it = LS.W[wi].items[ii], r = row(it), dn = isDoneIt(it), un = unlockedW(wi), me = LS.C.me;
  const head = `<a class="back" href="#/learn/learning/${wi + 1}">← Week ${wi + 1}: ${esc(LS.W[wi].title)}</a><div><p class="eyebrow">${LKIND[it.type] || "Activity"}${it.mins ? " · " + it.mins + " min" : ""}${it.opt ? " · Optional" : ""}</p><h2 style="margin-top:.4rem">${esc(it.title)}</h2></div>`;
  const nav = seqNav(wi, ii), btn = (lbl, undo) => `<div><button class="btn ${dn ? "ghost" : ""}" data-act="ls-done" data-k="${it.key}" data-v="${dn ? 0 : 1}">${dn ? undo : lbl}</button></div>`;
  if (!un) return `<div class="view">${head}<div class="gate">${LICON.lock}<span><b>Locked.</b> This opens when Week ${wi + 1} unlocks.</span></div></div>`;
  const blk = !dn && !r ? seqBlock(wi, it) : null;
  if (blk) return `<div class="view">${head}<div class="gate">${LICON.lock}<span><b>Do the steps in order.</b> Finish “${esc(blk.title)}” first, then this opens.</span></div><div><a class="btn" href="#/learn/learning/${wi + 1}/${blk.key}">Go to “${esc(blk.title)}”</a></div>${nav}</div>`;
  if (ON_WEEK_PAGE.includes(it.title)) return `<div class="view">${head}<p style="max-width:62ch">${esc(it.detail || "")}</p><div class="signoff ${dn ? "signed" : ""}"><b>${dn ? "Done ✓" : "Do this on the Week " + (wi + 1) + " page"}</b><p class="note">${it.title === "Have your Discovery Call" ? "Your coach marks this after your call." : it.title === "Book your Discovery Call" ? "Pick a time on the Week 15 page. This ticks itself when you book." : "The tools for this step are on the week page."}</p></div><div><a class="btn" href="#/learn/learning/${wi + 1}">Open Week ${wi + 1}</a></div>${nav}</div>`;
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
  if (it.type === "exam") return `<div class="view">${head}${ui.exam && ui.exam.paper === it.paper ? examPaper() : examCard(it, true)}${ui.exam ? "" : nav}</div>`;
  if (it.title === "Read the examination rules") return `<div class="view">${head}${examRules()}${btn("I've read the examination rules", "Read ✓ · Mark as not read")}${nav}</div>`;
  if (it.link) {
    const st = aStatus(it), canEdit = !r || r.status === "revise" || (r.status !== "graded" && !it.proj) || r.status === "submitted";
    return `<div class="view">${head}<p style="max-width:64ch">${esc(it.detail || "")}</p>${sampleLinks(wi)}${deadlineLine(wi)}
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
    ["logweek", "Internship logbook", "In Weeks 15 to 18 you fill one logbook entry each week."],
    ["oath", "The More menu", "Assignments, your cohort, your profile and Help & Support live here."]].map(([ic, t, b]) => `<div class="guide-row"><span class="ic">${LICON[ic]}</span><div><b>${t}</b><span class="note" style="font-size:.9rem">${b}</span></div></div>`).join("");
  return `<p style="max-width:64ch">Here's everything you need to find your way around the Jobnest student portal.</p><div class="guide">${rows}</div>`;
}
const handbookView = () => `<div class="lesson-doc"><h3>1. Attendance</h3><p>Join every live session. If you can't, tell Student Success before the session and watch the recording within 48 hours.</p>
  <h3>2. Deadlines</h3><p>Weekly tasks are due Friday at 17:00 for full marks. Until Sunday 23:59 you can still get up to 80%. After that, the maximum is 50%. Weekly assessments close when the examination week (Week 12) starts.</p>
  <h3>3. Grading</h3><p>Your final score = (10 weekly assessments, 40 marks + two examinations in Week 12, 60 marks + practical project, 100 marks) ÷ 2. Distinction 80–100, Merit 60–79, Pass 50–59, Fail below 50. Assessments have one attempt and no resits. An examination resit is only possible when staff authorise it. Weekly tasks get feedback within 5 working days but don't count towards your final score.</p>
  <h3>4. Code of conduct</h3><p>Submit your own work, respect everyone in your cohort and represent Jobnest professionally at your internship. Breaking the Student Oath can lead to removal from the programme.</p>
  <h3>5. Getting help</h3><p>Use Help & Support in the portal, or message Student Success in your cohort community.</p>
  <h3>6. Certificates</h3><p>Your certificate is issued after your final result is published, and shows your classification (Distinction, Merit or Pass). It appears in your profile.</p></div>`;
const communityView = () => `<div class="lesson-doc"><p>Your cohort community is where announcements, reminders and peer help happen.</p>
  <h3>How to join</h3><ol class="obj"><li>Open the invite link your cohort manager shares.</li><li>Use your real name and add your matric number to your profile.</li><li>Post your introduction.</li></ol>
  <h3>Introduction template</h3><div class="tpl"><pre>Hi everyone! I'm ${esc(LS.C.me.first_name)} from [city], on the ${esc(LS.C.me.track || "")} track.
One goal I have for this programme: [your goal].
Fun fact: [something about you].</pre></div></div>`;
function lsBrief(wi) {
  const it = LS.W[wi].items.find((x) => x.title === "Read your project brief");
  return `<div class="view brief-doc"><a class="back" href="#/learn/learning/${wi + 1}">← Week ${wi + 1}: ${esc(LS.W[wi].title)}</a>
    <div><p class="eyebrow">Practical project brief</p><h2 style="margin-top:.4rem">Your practical project</h2><p class="note" style="font-size:.95rem;margin-top:.3rem">${esc(LS.C.me.track || "")} track · individual project · Weeks ${wi + 1}–${wi + 2} · graded out of 100</p></div>
    <h3>Your task</h3><p>${esc(it?.detail || "")}</p>
    <h3>Timeline</h3><dl class="kv tl"><div><dt>Week ${wi + 1}</dt><dd>Project plan due ${fmtD(weekDue(wi))}, 17:00. Check in with your supervisor.</dd></div><div><dt>Week ${wi + 2}</dt><dd>Final project due ${fmtD(weekDue(wi + 1))}, 17:00. Self-review, then supervisor grading.</dd></div></dl>
    <h3>How you'll be graded</h3><p class="note">Your supervisor scores your final project out of 100 with this rubric. The score goes straight into your final result: (assessments + examinations + project) ÷ 2.</p>${projRubricTable()}
    <h3>How to submit</h3><p>Put everything in one Google Drive or Notion folder, set sharing to “anyone with the link can view”, and paste the link into the Week ${wi + 2} task “Submit your final project”.</p></div>`;
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
  const projW = LS.W.map((w, i) => (w.stage === 4 ? i : -1)).filter((i) => i >= 0), ph = projW.indexOf(wi), finalWi = projW.at(-1);
  const finalIt = LS.W[finalWi].items.find((x) => x.final) || LS.W[finalWi].items.find((x) => x.proj), fr = finalIt ? row(finalIt) : null, daysToFinal = Math.max(0, Math.ceil((weekDue(finalWi) - Date.now()) / DAY));
  const brief = (byTitle(projW[0], "Read your project brief") || {}).detail || "";
  const ms = []; projW.forEach((w) => LS.W[w].items.forEach((it) => ms.push({ t: it.title, w, ok: isDoneIt(it) })));
  const firstOpen = ms.findIndex((m) => !m.ok), p = weekProgress(wi), msgs = LS.X.messages || [];
  return `<div class="proj-hero"><p class="eyebrow">Practical project · ${ph + 1} of ${projW.length}</p><h2>${esc(LS.W[wi].title.replace("Project: ", ""))}</h2>
    <p class="ph-brief">${esc(brief)}</p>
    <div class="ph-stats"><div><span>Final project due</span><b class="mono">${daysToFinal}<small> days</small></b><span>${fmtD(weekDue(finalWi))}, 17:00</span></div>
      <div><span>This week</span><b class="mono">${p.d}<small>/${p.n}</small></b><span>tasks done</span></div>
      <div><span>Project score</span><b class="mono">${fr?.status === "graded" ? (fr.grade ?? fr.score) + "<small>/100</small>" : "—"}</b><span>${fr?.status === "graded" ? "graded by your supervisor" : fr ? "waiting for grading" : "after you submit"}</span></div></div>
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
    <div><p class="eyebrow">Internship · Weeks 15–18</p><h2 style="margin-top:.4rem">Logbook guide</h2></div>
    <p>Your logbook is the official record of your internship. Your supervisor signs every entry, and it becomes verified work experience for your CV and portfolio.</p>
    <h3>When to fill it</h3><ul><li>Once a week, at the end of each internship week: 4 entries in total.</li><li>Submit by <b>Friday, 17:00</b>. Write notes during the week so Friday is quick.</li></ul>
    <h3>What to write</h3><ul><li><b>Tasks:</b> list each task and what you delivered. Be specific.</li><li><b>Tools:</b> the software you used, e.g. Excel, Trello, Zendesk.</li><li><b>Skills:</b> what you learned or got better at.</li><li><b>Challenges:</b> one problem and how you solved it.</li><li><b>Next week:</b> two or three clear goals.</li></ul>
    <div class="ex"><div class="ex-bad"><span class="eyebrow">Weak entry</span><p>"Did some work on reports and attended meetings."</p></div>
      <div class="ex-good"><span class="eyebrow">Strong entry</span><p>"Cleaned the March sales export (2,400 rows) in Google Sheets, removed 130 duplicates and built a pivot table of sales by region. Presented the top 3 findings at Thursday's team stand-up."</p></div></div>
    <h3>What your supervisor checks</h3><ul><li>The entry matches what you actually did that week.</li><li>Your hours and days are accurate.</li><li>You show initiative and reflect honestly on challenges.</li></ul>
    ${pl ? `<p class="note">Your supervisor: <b>${esc(pl.sup_name)}</b>, ${esc(pl.org)}. If anything in your placement isn't going well, tell Student Success early.</p>` : ""}</div>`;
}

/* CV builder */
const TRACK_SKILLS = { BOP: ["Calendar & inbox management", "Google Workspace", "Microsoft Office", "Project coordination", "SOPs & process mapping", "Expense tracking"],
  PTA: ["Recruitment coordination", "Boolean sourcing", "CV screening", "Interview scheduling", "Onboarding", "HR reporting"],
  CSG: ["Zendesk", "Live chat support", "CRM (HubSpot)", "Customer onboarding", "Sales prospecting", "CSAT & NPS"] };
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
      <ul class="reqs"><li>Your practical project</li><li>Your internship${pl ? ` at ${esc(pl.org)}` : ""}</li><li>Your best week task from Weeks 4–11</li><li>Your CV</li></ul>
      ${pfI ? linkBox(pfI, "pf-url", "Portfolio link (Canva, Notion or Google Sites)", "https://", "Publish portfolio") : ""}</div></div>
  <div class="items">${wk.items.filter((it) => it.opt).map((it) => itemRow(wi, it, true)).join("")}</div>`;
}

/* Discovery Call (Week 20, after the course) */
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
  const prep = [["cv", "Your updated CV from Week 19"], ["port", "Your portfolio link"], ["roles", "3 roles you're targeting"], ["pitch", "Your 60-second introduction"]], pd = draft("prep", {});
  const apI = byTitle(wi, "Finalise your Job Search Action Plan"), callDone = doneT("Have your Discovery Call"), r = LS.X.result;
  return `<p style="max-width:64ch">Now that the course is done, your <b>Discovery Call</b> shows you where you stand. It's a 40-minute, 1-on-1 video call with a Career Coach: you go through your results, CV and portfolio, do a short <b>mock interview</b>, and leave with an <b>Interview Confidence Score</b> and a <b>Job Search Action Plan</b>.</p>
    ${stepsOl([["Book your call", doneT("Book your Discovery Call")], ["Have your call", callDone], ["Submit your action plan", apI && isDoneIt(apI)]])}
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
  const stW = LS.W.map((w, i) => (w.stage === 7 ? i : -1)).filter((i) => i >= 0), first = wi === stW[0]; let partA = "";
  const outs = draft("outreach", []), apps = draft("apps", []), pt = draft("pitch", {});
  const words = [pt.a, pt.b, pt.c].join(" ").trim().split(/\s+/).filter(Boolean).length;
  const stats = `<div class="ph-stats js-stats"><div><span>Outreach sent</span><b class="mono">${outs.length}<small>/10</small></b></div><div><span>Applications</span><b class="mono">${apps.length}</b></div><div><span>Interviews</span><b class="mono">${apps.filter((a) => a.st === "Interviewing" || a.st === "Offer").length}</b></div></div>`;
  if (first) { const pI = byTitle(wi, "Record your elevator pitch"), oI = byTitle(wi, "Send 10 cold outreach messages");
    partA = `<div class="cols"><div class="card"><div class="ch"><h3>Your 60-second pitch</h3>${pI && isDoneIt(pI) ? `<span class="pill ok">Recorded</span>` : ""}</div>
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
  return stats + partA + `<div class="card"><div class="ch"><h3>Add an application</h3></div>
    <form id="app-form" class="form" novalidate><div class="app-row"><div class="field"><label for="a-role">Role</label><input id="a-role" placeholder="e.g. Junior Data Analyst"></div><div class="field"><label for="a-co">Company</label><input id="a-co" placeholder="e.g. Flutterwave"></div><div class="field"><label for="a-st">Status</label><select id="a-st">${APP_ST.map((x) => `<option>${x}</option>`).join("")}</select></div><div class="field"><span class="lbl">&nbsp;</span><button class="btn sm" type="submit">Add</button></div></div></form></div>
  <div class="board">${APP_ST.map((st) => `<div class="col"><div class="col-h"><b>${st}</b><span class="mono">${apps.filter((a) => a.st === st).length}</span></div>${apps.map((a, i) => a.st !== st ? "" : `<div class="app-card"><b>${esc(a.role)}</b><span class="note">${esc(a.co)} · ${esc(a.on)}</span><label class="sr-only" for="as-${i}">Status</label><select id="as-${i}" data-app="${i}">${APP_ST.map((x) => `<option ${x === a.st ? "selected" : ""}>${x}</option>`).join("")}</select></div>`).join("") || `<p class="note">None yet</p>`}</div>`).join("")}</div>
  <div class="cols"><div class="card"><div class="ch"><h3>This week's tracker</h3>${tI && isDoneIt(tI) ? `<span class="pill ok">Submitted</span>` : ""}</div><p class="note">Submit your tracker every Friday. Aim for at least 5 targeted applications a week (minimum 3 to submit).</p>
      ${tI ? `<div><button class="btn sm" data-act="ls-done" data-k="${tI.key}" data-v="${isDoneIt(tI) ? 0 : 1}" ${apps.length < 3 && !isDoneIt(tI) ? "disabled" : ""}>${isDoneIt(tI) ? "Submitted ✓ · Undo" : `Submit tracker (${apps.length} applications)`}</button></div>` : ""}</div>
    <div class="card"><div class="ch"><h3>Got an interview?</h3>${rI && isDoneIt(rI) ? `<span class="pill ok">Reported</span>` : ""}</div><p class="note">Move an application to Interviewing, then tell your coach so they can help you prepare.</p>
      ${rI ? `<div><button class="btn sm gold" data-act="ls-done" data-k="${rI.key}" data-v="1" ${!hasInt || isDoneIt(rI) ? "disabled" : ""}>${isDoneIt(rI) ? "Coach notified ✓" : "Report interview to my coach"}</button></div>` : ""}</div></div>`;
}
const SPECIAL = { 3: examView, 4: projectView, 5: internView, 6: cvView, 7: (wi) => `<h3 class="sp-h">Your Discovery Call</h3>${dcView(wi)}<h3 class="sp-h">Pitch, outreach and applications</h3>${jobView(wi)}` };
// Items that are done from their week page rather than their own page.
const ON_WEEK_PAGE = ["Book your Discovery Call", "Have your Discovery Call", "ATS-compliant resume", "Weekly job application tracker", "Send 10 cold outreach messages", "Report your first interview invite"];
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
const webUrl = (u) => (/^https?:\/\/\S+$/i.test(u || "") ? u : ""), careersUrl = () => webUrl(INFO && INFO.careers_url), recruitUrl = () => webUrl(INFO && INFO.recruit_url);
function lsGraduatePage() {
  const G = LS.G || {}, me = LS.C.me, done = LS.W.filter((_, i) => weekDone(i)).length, all = done === LS.W.length, cert = LS.cert, o = G.outcome, sv = G.survey;
  const apps = draft("apps", []), ints = apps.filter((a) => a.st === "Interviewing" || a.st === "Offer").length, avg = avgScore();
  const ends = G.end_date ? new Date(G.end_date + "T12:00:00+01:00") : weekDue(LS.W.length - 1);
  const chk = [[`All ${LS.W.length} weeks complete`, all, `${done} of ${LS.W.length} done`], ["Internship evaluation from your supervisor", !!G.eval, G.eval ? "Received" : "Your host supervisor completes this in Week 13"],
    ["Exit survey", !!sv, sv ? "Thank you!" : "Below, 3 minutes"], ["Certificate issued", !!cert, cert ? "Ready to download" : "Jobnest issues it once the steps above are done"]];
  const ck = (d) => { const c = (G.checkins || {})[d], opens = new Date(ends.getTime() + (d - 7) * DAY), open = LS.L.unlock_all || LS.L.ignore_dates || Date.now() >= opens.getTime();
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
      <div class="card next-opp ${cert && careersUrl() ? "" : "lk"}"><div class="ch"><h3>Find your next opportunity</h3>${!cert ? `<span class="pill">🔒 Locked</span>` : careersUrl() ? `<span class="pill ok">Open</span>` : `<span class="pill">Coming soon</span>`}</div>
        ${!cert ? `<p class="note">Jobnest Careers opens here once your certificate is issued. Finish the steps on the left first.</p>`
          : careersUrl() ? `<p class="note">You're a Jobnest graduate. Browse jobs, internships and graduate programmes on Jobnest Careers, and apply with your verified certificate.</p><div class="actions"><a class="btn gold" href="${esc(careersUrl())}" target="_blank" rel="noopener">Go to Jobnest Careers ↗</a></div>`
          : `<p class="note">Jobnest Careers, our jobs and opportunities platform, is launching soon. Your link will appear here, and we'll send you an alert when it opens. Until then, use the Opportunities page.</p><div class="actions"><a class="btn sm ghost" href="#/learn/opps">Opportunities</a></div>`}</div>
      <div class="card"><h3>Keep your job search going</h3><p class="note">Your portal stays open after the programme. Keep using your tools:</p>
        <div class="actions"><a class="btn sm ghost" href="#/learn/learning/${LS.W.length}">Applications board</a><a class="btn sm ghost" href="#/learn/learning/${LS.W.findIndex((w) => w.stage === 6) + 1}">CV builder</a><a class="btn sm ghost" href="#/learn/help">Help & Support</a></div></div>
    </div></div>
    <h2 style="margin:1.6rem 0 .8rem">Alumni check-ins</h2><p class="note" style="margin-bottom:1rem">We check in 30, 60 and 90 days after the programme. Tell us how you're doing, and ask for help if you need it.</p>
    <div class="grad-cks">${[30, 60, 90].map(ck).join("")}</div></section>`);
}

/* ---------- staff: outcomes ---------- */
async function tabOutcomes() {
  const O = await rpc("acad_outcomes2", { p_cohort: ui.coh || null }), L = O.rows, work = ["hired", "internship", "freelance"];
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
    ${quotes.length ? `<div class="card" style="margin-top:1rem"><h3>Testimonials you can share</h3><p class="note">These students agreed to share their words with their first name and track.</p><ul class="quotes">${quotes.map((x) => `<li><p>“${esc(x.survey.testimonial)}”</p><span class="note">${esc(x.name.split(" ")[0])}, ${esc(x.track || "")}</span></li>`).join("")}</ul></div>` : ""}`, { actions: (O.cohorts || []).length > 1 ? `<label class="sr-only" for="coh-pick">Cohort</label><select id="coh-pick" class="st-sel"><option value="">All cohorts</option>${O.cohorts.map((c) => `<option value="${c.id}" ${String(c.id) === String(ui.coh || "") ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>` : "" });
}

/* ---------- More pages ---------- */
function lsAssignmentsPage(key) {
  if (key) return lsAssignmentDetail(key);
  const list = lsAssignments(), f = ui.asf || "All", groups = ["All", "Not Started", "Submitted", "Revision Required", "Graded"];
  const shown = list.filter((a) => f === "All" || aStatus(a.it) === f);
  const hist = (LS.L.history || []).slice().reverse().slice(0, 8).map((h) => ({ ...h, f: findItem(h.key) }));
  lsShell("assignments", pageHead("Assignments & Projects", "Your submissions", `Everything you need to submit across the ${LS.W.length} weeks, with deadlines, rubrics and facilitator feedback.`) +
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
      ${it.final ? `<div class="card"><h3>Project rubric</h3>${projRubricTable()}</div>` : it.proj ? `<div class="card"><h3>Feedback rubric</h3><p class="note">Week tasks get feedback but don't count towards your final score.</p><table class="tbl rub"><tbody>${RUBRIC.map((x) => `<tr><td><b>${x[0]}</b><span class="note">${x[1]}</span></td><td class="mono">${x[2]}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="mono">${total}</td></tr></tbody></table></div>` : ""}
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
      ${LS.icert && LS.icert.cert_id ? `<div class="card cert-card"><span class="eyebrow">Certificate of internship</span><h2>${esc(LS.icert.role)} at ${esc(LS.icert.org)}</h2><div class="actions"><a class="btn gold" href="${(() => { const f = LS.W.map((w, i) => [i, w.items.find((x) => x.title === "Collect your internship certificate")]).find(([, x]) => x); return f ? `#/learn/learning/${f[0] + 1}/${f[1].key}` : "#/learn/learning"; })()}">View and download</a></div></div>` : ""}
      ${installCard()}</div>
    <div class="stack">${progressCard(LS.C, cert)}${profileForm()}<div class="card"><h3>Account</h3><div class="actions"><a class="btn ghost" href="#/learn/forgot">Change password</a><button class="btn ghost" data-act="signout-learn">Sign out</button></div></div></div></div></section>`);
}
const SUPPORT_CATS = ["Technical problem", "Course content", "Deadlines or extension", "Payment", "Internship", "Personal or wellbeing", "Other"];
function lsHelpPage() {
  const Q = [["I can't open the next week", "Each week opens when you finish the required steps of the week before it, and not earlier than the Saturday before it starts."],
    ["Why can't I open a lesson?", "Inside each week, items open in order. Finish the step before it first. Optional items never block you."],
    ["How is my final result worked out?", "Ten weekly assessments (40 marks), the two examinations in Week 12 (60 marks) and your practical project (100 marks). Final score = (assessments + examinations + project) ÷ 2. Distinction 80–100, Merit 60–79, Pass 50–59, Fail below 50. Scores are never rounded up."],
    ["Can I retake an assessment or examination?", "Weekly assessments have one attempt and no resits. If you miss an examination for a serious reason, speak to Student Success: a resit is only possible when staff authorise it, and it replaces your earlier score."],
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
const CAREER_SKILLS = { BOP: ["Calendar & inbox management", "Business documents & spreadsheets", "Project coordination & SOPs", "Executive support & office records"],
  PTA: ["Recruitment lifecycle & job descriptions", "Sourcing & screening", "Interviews & onboarding", "HR policies, data privacy & metrics"],
  CSG: ["Support tools & etiquette", "Customer success & onboarding", "CRM & sales prospecting", "Retention & growth reporting"] };
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
    ["Build track skills", `The ${tn} core weeks complete, with all ten weekly assessments taken`, stageDone(2)],
    ["Sit the examinations", "Fundamental and Core Skill Learning Examinations in Week 12", stageDone(3)],
    ["Complete a practical project", "Final project submitted and graded out of 100 by your project supervisor", stageDone(4)],
    ["Gain verified work experience", "Internship logbook signed and evaluation received", !!LS.X.eval || stageDone(5)],
    ["Build a professional CV", "ATS-ready CV submitted in Week 19", stageDone(6)],
    ["Have your Discovery Call", "Post-course review and mock interview with your Career Coach", doneT("Have your Discovery Call")],
    ["Explore opportunities", "At least one application tracked as Applied or further", applied]];
}
function lsCareerPage() {
  const c = draft("career", {}), J = careerJourney(), ok = J.filter((x) => x[2]).length;
  const core = stageWeeks(2), skills = [["Professional communication & workplace readiness", stageWeeks(1).at(-1)], ...(CAREER_SKILLS[LS.L.track] || CAREER_SKILLS.BOP).map((n, i) => [n, core[i * 2 + 1] ?? core.at(-1)])];
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
        <p class="note">Saved automatically as you type.</p></div>
      ${discussionCard(LS.discCareer || [], false, "career")}
      <div class="card"><div class="ch"><h3>Talent matching</h3>${recruitUrl() ? `<span class="pill ok">Live</span>` : `<span class="pill">Coming soon</span>`}</div>
        <p class="note">${recruitUrl() ? "Employers hire through Jobnest Recruit. If you agree, they can see your assessed skills and the portfolio items you've made visible. Nothing is shared without your consent." : "When Jobnest Recruit launches, you can choose to share your assessed skills and portfolio with employers hiring through it. Nothing is shared without your consent."}</p>
        ${recruitUrl() ? `<div class="actions" style="margin-bottom:.4rem"><a class="btn sm ghost" href="${esc(recruitUrl())}" target="_blank" rel="noopener">Visit Jobnest Recruit ↗</a></div>` : ""}
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
    ${careersUrl() ? `<div class="notice careers-n"><span><b>More opportunities on Jobnest Careers.</b> Browse every live job, internship and graduate programme on our careers platform.</span><a class="btn sm gold" href="${esc(careersUrl())}" target="_blank" rel="noopener">Open Jobnest Careers ↗</a></div>` : ""}
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
  shell("opps", "Opportunities", "Jobs, internships and events students see on their Opportunities page (opens in Week 20). New listings send students an alert.",
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
    const [C, L, ex, ct, mod, X, G, POD, N, FEE, PF] = await Promise.all([rpc("student_campus"), rpc("learn_state"), rpc("student_campus_extra").catch(() => ({})), rpc("student_certificate").catch(() => null), COURSE_DATA ? null : import("./course.js"), rpc("learn_extra").catch(() => ({})), rpc("grad_state").catch(() => ({})), rpc("student_pod").catch(() => null), rpc("notices_list").catch(() => null), rpc("learn_fee_lock").catch(() => null), LS && LS.photo !== undefined ? null : rpc("profile_get").catch(() => ({})), info().catch(() => null)]);
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
  setTimeout(() => { if (ui.quiz && $("#qt-left") && !QTIMER) { QTIMER = setInterval(quizTick, 1000); quizTick(); } if (ui.exam && $("#ex-left") && !XTIMER) { XTIMER = setInterval(examTick, 1000); examTick(); } }, 0);
  if (p1 === undefined) [p1, p2, p3] = lsParts();
  const page = p1 || "home", cert = LS.cert;
  if (LS.fee && !["home", "help", "profile"].includes(page)) return feeLockPage();
  if (MORE_PAGES.some((m) => m[0] === page && m[3] != null) && !pageOpen(page)) return lockedPage(page);
  if (page === "learning") { const wi = Math.min(Math.max((parseInt(p2, 10) || curWeek() + 1) - 1, 0), LS.W.length - 1);
    if (LS.W[wi].stage === 7 && !LS.X.booking && !p3 && unlockedW(wi) && !LS.slots) { try { LS.slots = await rpc("dc2_slots"); } catch { LS.slots = []; } }
    const f3 = p3 ? findItem(p3) : null;
    if (f3 && f3.it.title === "Collect your internship certificate" && LS.X.eval && LS.icert === undefined) LS.icert = await rpc("certificate_view", { p_cert: internCertId() }).catch(() => null);
    if (LS.W[wi].stage === 4 && LS.sup === undefined) LS.sup = await rpc("learn_supervisor").catch(() => null);
    lsLearning(wi, p3 || null); }
  else if (page === "career") { LS.discCareer = await rpc("disc_list2", { p_channel: "career" }).catch(() => []); lsCareerPage(); }
  else if (page === "opps") { LS.opps = await rpc("opps_list").catch(() => LS.opps || []); lsOppsPage(); }
  else if (page === "assignments") lsAssignmentsPage(p2 || null);
  else if (page === "results") lsResultsPage();
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
  { t: "Your week at a glance", b: "Required tasks done, assignments due, your assessment marks and your final result.", sel: "#t-strip" },
  { t: "My Learning", b: "All 20 weeks, grouped into eight stages. Each week opens when you finish the one before it.", sel: "#nav-learning" },
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
  shell("intern", "Internships", "Weeks 15–18. Add each student's placement, then share the supervisor's link so they can sign the weekly logbook and give the final evaluation.",
    `<div class="card">${L.length ? `<div class="arows">${L.map(row3).join("")}</div>` : empty("No admitted students yet.")}</div>`);
}

/* ---------- staff: Discovery Call ---------- */
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
  shell("dc2", "Discovery Call", "Week 20, after the course. Students book a 40-minute call with a career coach to review where they are now, then you record their Interview Confidence Score and next steps.",
    `<div class="grid2">${isCoach ? `<form class="card form" id="dc2-times" novalidate><h3>Add times</h3><p class="note">Each call is 40 minutes. Times are in WAT.</p>
      <div class="field"><span class="lbl">Days</span><div class="chips-row">${days.map((d) => `<label class="chip-cb"><input type="checkbox" name="dday" value="${d}"><span>${fmt(d + "T12:00:00Z", { weekday: "short", day: "numeric", month: "short" })}</span></label>`).join("")}</div></div>
      <div class="field"><span class="lbl">Times</span><div class="chips-row">${CALL_TIMES.map((t) => `<label class="chip-cb"><input type="checkbox" name="dtime" value="${t}"><span>${t}</span></label>`).join("")}</div></div>
      <div><button class="btn" type="submit">Add these times</button></div></form>` : ""}
    <div class="card"><div class="ch"><h3>Open times</h3><span class="note">${open.length}</span></div>${open.length ? `<ul class="slot-list">${open.map((s) => `<li><span class="mono">${fmtAt(s.at)}</span>${isCoach ? `<button class="link sm" data-act="dc2-rm" data-k="${s.id}">Remove</button>` : `<span class="note">${esc(s.coach)}</span>`}</li>`).join("")}</ul>` : empty("No open times.")}</div></div>
    <div class="card" style="margin-top:1rem"><div class="ch"><h3>Booked calls</h3><span class="note">${booked.length}</span></div>${booked.length ? `<div class="arows">${booked.map((x) => call(x, L.indexOf(x))).join("")}</div>` : empty("No calls booked yet.")}</div>`);
}

/* ---------- staff: job search (Weeks 19–20) ---------- */
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
      <p class="note">${[["ATS-compliant resume", "CV submitted"], ["Weekly job application tracker", "Tracker submitted"], ["Report your first interview invite", "Interview reported"]].map(([t, l]) => `${has(x, t) ? "✓" : "○"} ${l}`).join(" · ")}${x.score ? ` · Discovery Call score ${x.score}/10` : ""}</p>
      ${x.pitch && (x.pitch.a || x.pitch.b || x.pitch.c) ? `<h4 style="margin:.8rem 0 .3rem">Pitch</h4><p class="note">${esc([x.pitch.a, x.pitch.b, x.pitch.c].filter(Boolean).join(" "))}</p>` : ""}
      <h4 style="margin:.8rem 0 .3rem">Applications</h4>${x.apps.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Role</th><th>Company</th><th>Status</th><th>Added</th></tr></thead><tbody>${x.apps.map((a) => `<tr><td data-label="Role"><b>${esc(a.role)}</b></td><td data-label="Company">${esc(a.co)}</td><td data-label="Status"><span class="pill ${a.st === "Offer" ? "ok" : a.st === "Interviewing" ? "now" : a.st === "Not selected" ? "bad" : ""}">${esc(a.st)}</span></td><td data-label="Added" class="note">${esc(a.on || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">None yet.</p>`}
      <h4 style="margin:.8rem 0 .3rem">Outreach</h4>${x.outreach.length ? `<ul class="roles">${x.outreach.map((o) => `<li><b>${esc(o.name)} · ${esc(o.co)}</b><span class="note">${esc(o.ch)} · ${esc(o.on || "")}</span><span class="pill ${o.st === "Sent" ? "" : "ok"}">${esc(o.st)}</span></li>`).join("")}</ul>` : `<p class="note">None yet.</p>`}
      ${x.cv ? `<details style="margin-top:.8rem"><summary class="link sm">See their CV</summary><div style="margin-top:.6rem">${cvPreview(x.cv)}</div></details>` : ""}
    </div></details>`;
  shell("jobs", "Job search", "Weeks 19–20. Each student's CV, LinkedIn, portfolio, pitch, outreach and job applications. It updates as students work.",
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
const podFields = (p, tracks) => `<div class="field"><label>Pod name</label><input name="name" value="${esc(p?.name || "")}" placeholder="e.g. Business Operations pod 1"></div>
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

const cohortPick = (L, cur) => (L || []).length > 1 ? `<label class="sr-only" for="coh-pick">Cohort</label><select id="coh-pick" class="st-sel">${L.map((c) => `<option value="${c.id}" ${String(c.id) === String(cur) ? "selected" : ""}>${esc(c.name)} · ${c.students} student${c.students === 1 ? "" : "s"}</option>`).join("")}${cur === "all" ? "" : ""}</select>` : "";
async function tabStudents() {
  const [d, certs, ls] = await Promise.all([rpc("acad_students2", { p_cohort: ui.coh || null }), rpc("acad_certificates").catch(() => ({})), rpc("acad_learn_stats").catch(() => ({}))]);
  const canCert = ["director", "academy_admin", "super"].includes(ME.role);
  const S = d.students, set = S.filter((s) => s.account).length;
  const att = S.filter((s) => s.sessions_past).map((s) => s.sessions_attended / s.sessions_past);
  const canInvite = ["cohort_manager", "academy_admin", "adm_admin", "super"].includes(ME.role);
  shell("students", "Students", `${esc(d.cohort.name)} · ${d.week < 1 ? `starts ${fmtDateD(d.cohort.start_date)}` : `week ${d.week}`}${d.my_track ? ` · ${esc(tName(d.tracks, d.my_track))} only` : ""}`,
    `<div class="kpis">${[["Students", S.length], ["Accounts set up", `${set}/${S.length}`], ["Waiting for grading", S.reduce((t, s) => t + (ls[s.id]?.to_grade || 0), 0)], ["Average attendance", att.length ? Math.round((att.reduce((a, b) => a + b, 0) / att.length) * 100) + "%" : "–"]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    ${canInvite && S.length > set ? `<div class="notice" style="margin-top:1rem"><span>${S.length - set} student${S.length - set === 1 ? " hasn't" : "s haven't"} set up their portal account yet.</span><button class="btn sm" data-act="invite">Email them a set-up link</button></div>` : ""}
    <div class="card" style="margin-top:1rem">${S.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Student</th><th>Track</th><th>Portal</th><th>Progress</th><th>Attendance</th><th>Fees</th><th>Certificate</th></tr></thead><tbody>
      ${S.map((s) => `<tr><td data-label="Student"><a class="link" href="#/portal/student/${s.id}"><b>${esc(s.first_name)} ${esc(s.surname)}</b></a><span class="note" style="display:block"><span class="mono">${esc(s.matric)}</span> · ${esc(s.phone)}</span></td><td data-label="Track">${esc(s.track || "")}</td>
        <td data-label="Portal">${s.account ? `<span class="pill ok">Set up</span>` : `<span class="pill">${s.invited_at ? `Invited ${fmtDay(s.invited_at)}` : "Not yet"}</span>`}</td>
        <td data-label="Progress" class="mono">${ls[s.id] ? `${ls[s.id].done}/${ls[s.id].total}${ls[s.id].avg != null ? ` · avg ${ls[s.id].avg}%` : ""}${ls[s.id].to_grade ? ` <span class="note">(${ls[s.id].to_grade} to grade)</span>` : ""}` : "–"}</td>
        <td data-label="Attendance" class="mono">${s.sessions_past ? `${s.sessions_attended}/${s.sessions_past}` : "–"}</td><td data-label="Fees">${s.balance ? `<span class="pill bad">Owes ${naira(s.balance)}</span>` : `<span class="pill ok">Paid</span>`}</td>
        <td data-label="Certificate">${certs[s.id] ? `<a class="link sm" href="#/certificate/${esc(certs[s.id].cert_id)}" target="_blank" rel="noopener">View</a>${canCert ? ` · <button class="link sm" data-act="cert-revoke" data-k="${s.id}">Withdraw</button>` : ""}` : canCert ? `<button class="btn sm" data-act="cert-issue" data-k="${s.id}">Issue</button>` : `<span class="note">Not yet</span>`}</td></tr>`).join("")}</tbody></table></div>` : empty("No admitted students yet.")}</div>`, { actions: cohortPick(d.cohorts, d.cohort.id) });
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
  if (!e.target.closest(".st-search")) { const b = $("#st-qres"); if (b && !b.hidden) b.hidden = true; }
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
  if (a === "ap-tracks") { e.preventDefault(); return apTracks(); }
  if (a === "ap-tracks-close") { e.preventDefault(); return apTracksClose(); }
  if (a === "ap-clear") { e.preventDefault(); try { localStorage.removeItem(AP_KEY); } catch (x) {} $("#apply-form").reset(); return pageApply(); }
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
  if (a === "res-csv") { if (ui.res) resultsCsv(ui.res); return; }
  if (a === "res-publish") { const on = t.dataset.v === "1";
    if (!confirm(on ? "Publish results for this cohort? Students with a complete result will see their final score and classification, and get an alert. Pending results stay Pending." : "Unpublish results? Students stop seeing their final score and classification.")) return;
    try { await busy(t, () => rpc("acad_results_publish", { p_cohort: ui.res.cohort.id, p_on: on })); toast(on ? "Results published" : "Results unpublished"); route(); } catch { /* shown */ } return; }
  if (a === "res-fix") { const mx = +t.dataset.mx, cur = t.dataset.v;
    const v = prompt(`New score (${t.dataset.u}, 0 to ${mx}). Leave empty to go back to the calculated score.${cur !== "" ? ` Current: ${cur}.` : ""}`, cur); if (v === null) return;
    const reason = prompt("Reason for the change (kept in the record and the activity log):"); if (!reason || !reason.trim()) return toast("A reason is needed");
    try { await busy(t, () => rpc("acad_score_correct", { p_app: ui.resD.id, p_component: k, p_value: v.trim() === "" ? null : +v, p_reason: reason })); toast("Score updated and result recalculated"); route(); } catch { /* shown */ } return; }
  if (a === "res-resit") { const dt = prompt(`Resit date for the ${paperName(k)} (YYYY-MM-DD). They can start it in the usual daily window.`, new Date(Date.now() + 864e5).toISOString().slice(0, 10)); if (!dt) return;
    const reason = prompt("Reason for the resit (e.g. illness with a doctor's note):"); if (!reason || !reason.trim()) return toast("A reason is needed");
    try { await busy(t, () => rpc("acad_exam_resit", { p_app: ui.resD.id, p_paper: k, p_date: dt.trim(), p_reason: reason })); toast("Resit authorised. The student gets an alert."); route(); } catch { /* shown */ } return; }
  if (a === "res-resit-x") { if (!confirm("Cancel this unused resit?")) return; try { await busy(t, () => rpc("acad_exam_resit_cancel", { p_app: ui.resD.id, p_paper: k })); toast("Resit cancelled"); route(); } catch { /* shown */ } return; }
  if (a === "res-exc") { const on = t.dataset.v === "1"; const reason = on ? prompt("Reason for the exception (missing scores will count as zero):") : ""; if (on && (!reason || !reason.trim())) return;
    if (!on && !confirm("Remove the exception? The result goes back to Pending while scores are missing.")) return;
    try { await busy(t, () => rpc("acad_result_exception", { p_app: ui.resD.id, p_on: on, p_reason: reason || null })); toast(on ? "Exception approved" : "Exception removed"); route(); } catch { /* shown */ } return; }
  if (a === "pod-del") { if (!confirm("Delete this pod? Its members go back to 'Not in a pod yet'.")) return; try { await busy(t, () => rpc("acad_pod_delete", { p_id: +k })); toast("Pod deleted"); route(); } catch { /* shown */ } return; }
  if (a === "dc2-rm") { try { await busy(t, () => rpc("coach_remove_slot", { p_id: +k })); toast("Time removed"); route(); } catch { /* shown */ } return; }
  if (a === "msg-reply") { const tx = $("#mr-" + k).value.trim(); if (!tx) return toast("Write a reply first"); try { await busy(t, () => rpc("acad_message_reply", { p_app: ui.msgs[+k].app, p_body: tx })); toast("Reply sent"); route(); } catch { /* shown */ } return; }
  if (a === "grad-close" || a === "grad-go") { $("#grad-modal")?.remove(); if (a === "grad-go") go("#/learn/graduate"); return; }
  if (a === "ex-start") {
    const e = (LS.L.results || {})[k];
    if (e && e.status !== "In progress" && !confirm(`Start the ${paperName(k)} now? You have ${e.minutes} minutes for ${e.questions} questions, and the timer can't be paused.`)) return;
    let d; try { d = await busy(t, () => rpc("learn_exam_start", { p_paper: k })); } catch { return; }
    if (!d) return;
    ui.exam = { paper: k, d, ans: d.qs.map((_, i) => (Array.isArray(d.answers) && d.answers[i] != null ? +d.answers[i] : null)), deadline: Date.parse(d.deadline), skew: Date.parse(d.now) - Date.now() };
    const f = LS.W.map((w, wi) => [wi, w.items.find((x) => x.type === "exam" && x.paper === k)]).find(([, it]) => it);
    if (f) go(`#/learn/learning/${f[0] + 1}/${f[1].key}`); else await lsRender();
    clearInterval(XTIMER); XTIMER = setInterval(examTick, 1000); setTimeout(examTick, 50); return;
  }
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
  if (a === "dm") { ui.dm = k; return route(); }
  if (a === "pilot-create" || a === "pilot-open" || a === "pilot-close") {
    if (a === "pilot-create" && !confirm("Start a pilot cohort? You'll get a private link for outside testers.")) return;
    try { await busy(t, () => rpc("admin_pilot", { p_action: a.slice(6) })); toast(a === "pilot-create" ? "Pilot started. Copy the link and send it to your testers." : a === "pilot-close" ? "Pilot sign-ups closed" : "Pilot sign-ups reopened"); route(); } catch { /* shown */ } return; }
  if (a === "cm-all") { ui.cmAll = !ui.cmAll; return route(); }
  if (a === "esc-yes" || a === "esc-no") { const note = a === "esc-no" ? prompt("Why? (optional, the person who raised it sees this)") : null;
    try { await busy(t, () => rpc("escalation_decide", { p_id: +k, p_decision: a === "esc-yes" ? "approved" : "declined", p_note: note })); toast(a === "esc-yes" ? "Approved" : "Declined"); route(); } catch { /* shown */ } return; }
  if (a === "cm-call") { const v = t.dataset.v, note = v === "reached" ? prompt("What did you agree? (optional, saved as a note)") : ""; if (note === null) return;
    try { await busy(t, () => rpc("cm_call_log", { p_app: k, p_outcome: v, p_note: note || null })); toast(v === "reached" ? "Call logged" : "Logged · try again tomorrow"); route(); } catch { /* shown */ } return; }
  if (a === "desk-pick") { const fb = $("#desk-fb"); if (fb) ui.fb = { ...(ui.fb || {}), [ui.deskSel]: fb.value }; ui.deskSel = k; return route(); }
  if (a === "rub") { const fb = $("#desk-fb"); if (fb) ui.fb = { ...(ui.fb || {}), [ui.deskSel]: fb.value }; ui.rub = ui.rub || {}; ui.rub[ui.deskSel] = { ...(ui.rub[ui.deskSel] || {}), [k]: +t.dataset.v }; return route(); }
  if (a === "fb-add") { const fb = $("#desk-fb"); if (fb) { fb.value = (fb.value.trim() ? fb.value.trim() + " " : "") + FB_SNIPS[+k]; fb.focus(); } return; }
  if (a === "desk-save" || a === "desk-revise") {
    const x = ui.lq.work.find((w) => w.key + w.app === ui.deskSel); if (!x) return; const R0 = (ui.rub || {})[ui.deskSel] || {}, fb = $("#desk-fb").value.trim();
    const RB = rubFor(x);
    if (a === "desk-save" && Object.keys(R0).length < RB.length) return toast(`Score all ${RB.length} parts first`);
    if (a === "desk-revise" && !fb) { toast("Say what to change in the feedback box"); $("#desk-fb").focus(); return; }
    const parts = Object.fromEntries(RB.map(([n], i) => [n, R0[i] ?? 0]));
    try { await busy(t, () => rpc("acad_learn_grade_parts", { p_app: x.app, p_key: x.key, p_status: a === "desk-save" ? "graded" : "revise", p_parts: parts, p_feedback: fb })); toast(a === "desk-save" ? "Grade sent" : "Changes requested"); ui.deskSel = null; route(); } catch { /* shown */ } return; }
  if (a === "cc-pick") { ui.ccSel = +k; return route(); }
  if (a === "cc-score") { ui.ccScore = { ...(ui.ccScore || {}), [ui.ccSel]: +k }; $$(".rh-sc .rh-s[data-act=cc-score]").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); const hid = t.closest("form")?.querySelector("input[type=hidden]"); if (hid) hid.value = k; return; }
  if (a === "cc-open") { try { await busy(t, () => rpc("coach_add_slots", { p_times: [k] })); toast("Time opened"); route(); } catch { /* shown */ } return; }
  if (a === "cc-close") { try { await busy(t, () => rpc("coach_remove_slot", { p_id: +k })); toast("Time closed"); route(); } catch { /* shown */ } return; }
  if (a === "go-disc") { ui.discCh = k; return go("#/portal/discussion"); }
  if (a === "ops-t") { ui.opsT = k; return route(); }
  if (a === "host-edit") { ui.hostEdit = k === "new" ? "new" : k ? +k : null; if (location.pathname !== "/portal/ops") return go("#/portal/ops"); await route(); $("#host-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  if (a === "pipe") { ui.pipe = k; return route(); }
  if (a === "of-pick") { ui.ofSel = k; return route(); }
  if (a === "of-score") { ui.ofScore = { ...(ui.ofScore || {}), [ui.ofSel]: +k }; $$(".rh-s[data-act=of-score]").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); return; }
  if (a === "of-rec") { ui.ofRec = { ...(ui.ofRec || {}), [ui.ofSel]: t.value }; $$(".rh-rec").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked)); return; }
  if (a === "of-open") { try { await busy(t, () => rpc("officer_add_slots", { p_times: [k] })); toast("Time opened"); route(); } catch { /* shown */ } return; }
  if (a === "qtab") { ui.qtab = k; $$(".sc-tab[data-act=qtab]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.k === k)); const l = $(".sc-ql"); if (l && ui.ov) l.innerHTML = queueRows(ui.ov.queue, k); return; }
  if (a === "sc-refresh") { ui.ov = null; return route(); }
  if (a === "risk-f") { ui.riskF = k; return route(); }
  if (a === "fee-remind-all" || a === "s3-remind") {
    const one = a === "s3-remind" ? ui.s360?.id : null;
    if (!one && !confirm("Send a payment reminder (email and portal alert) to every student with an overdue balance?")) return;
    try { const n = await busy(t, () => rpc("acad_fee_remind", { p_app: one })); toast(n ? `Reminder sent to ${n} student${n === 1 ? "" : "s"}` : "No one has an overdue balance"); } catch { /* shown */ } return; }
  if (a === "s3-tab") { e.preventDefault(); ui.s360t = k; await route(); if (t.getAttribute("href") === "#s3-extend") $("#s3-extend")?.scrollIntoView({ behavior: "smooth" }); return; }
  if (a === "s3-retake") { if (!confirm(`Give ${ui.s360?.first_name || "this student"} one more attempt at the Week ${k} assessment? They'll get an alert.`)) return;
    try { await busy(t, () => rpc("acad_grant_retake", { p_app: ui.s360.id, p_week: +k })); toast("One more attempt given"); route(); } catch { /* shown */ } return; }
  if (a === "s3-cv") { ui.s3cv = !ui.s3cv; return route(); }
  if (a === "s3-unextend") { try { await busy(t, () => rpc("acad_fee_extend", { p_app: ui.s360.id, p_date: null })); toast("Extension removed"); route(); } catch { /* shown */ } return; }
  if (a === "s3-note-del") { if (!confirm("Delete this note?")) return; try { await busy(t, () => rpc("acad_note_delete", { p_id: +k })); toast("Note deleted"); route(); } catch { /* shown */ } return; }
  if (a === "sq-app") { ui.q = (t.dataset.ref || "").toLowerCase(); ui.admG = null; return go("#/portal/apps"); }
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
  if (a === "staff-f") { ui.staffF = k; return route(); }
  if (a === "perm-r") { ui.permRole = k; return route(); }
  if (a === "staff-invite") { try { await busy(t, () => rpc("super_staff_invite", { p_email: k })); toast("Invite sent"); route(); } catch { /* shown */ } return; }
  if (a === "sf-new") { e.preventDefault(); $("#staff-form")?.reset(); $("#sf-h").textContent = "Add a staff member"; $("#staff-form")?.scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("#sf-email")?.focus(), 300); return; }
  if (a === "edit-staff") { $("#staff-form")?.scrollIntoView({ behavior: "smooth" }); if ($("#sf-h")) $("#sf-h").textContent = "Change " + t.dataset.name; if ($("#sf-invite")) $("#sf-invite").checked = false; $("#sf-email").value = t.dataset.email; $("#sf-name").value = t.dataset.name; $("#sf-role").value = t.dataset.role; $("#sf-active").checked = t.dataset.active === "true"; $("#sf-track").value = t.dataset.track || ""; $("#sf-name").focus(); return; }
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
  if (e.target.closest?.("#apply-form")) { clearTimeout(ui.apT); ui.apT = setTimeout(apSave, 400); }
  if (e.target.dataset?.cv && LS) { const c = { ...cvData() }; $$("[data-cv]").forEach((x) => (c[x.dataset.cv] = x.value)); saveDraft("cv", c); const s0 = $("#cv-saved"); if (s0) s0.textContent = "Saving…";
    $("#cv-preview").innerHTML = cvPreview(c); const ch = atsChecks(c), sc = ch.filter((x) => x[1]).length; $("#ats-list").innerHTML = atsList(ch); const pl = $("#ats-pill"); pl.textContent = `ATS check ${sc}/5`; pl.className = `pill ${sc >= 4 ? "ok" : "now"}`; return; }
  if (e.target.dataset?.pitch && LS) { const pt = { ...draft("pitch", {}) }; $$("[data-pitch]").forEach((x) => (pt[x.dataset.pitch] = x.value)); saveDraft("pitch", pt);
    const w = [pt.a, pt.b, pt.c].join(" ").trim().split(/\s+/).filter(Boolean).length; $("#pitch-count").textContent = `${w} words · about ${Math.round(w / 2.3)} seconds spoken (aim for 120–150 words)`; return; }
  if (e.target.dataset?.cr && LS && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") { saveCareer(e.target); return; }
  if (e.target.id === "st-q") { clearTimeout(ui.sqT); const q = e.target.value.trim(), box = $("#st-qres");
    if (q.length < 2) { box.hidden = true; return; }
    ui.sqT = setTimeout(async () => { let r = []; try { r = await rpc("super_search", { p_q: q }); } catch { return; } if ($("#st-q")?.value.trim() !== q) return;
      box.innerHTML = r.length ? r.map((x) => x.kind === "student" ? `<a class="st-qr" href="#/portal/student/${x.id}"><span class="pill ok">Student</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></a>`
        : x.kind === "staff" ? `<a class="st-qr" href="#/portal/staff"><span class="pill info">Staff</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></a>`
        : `<button class="st-qr" data-act="sq-app" data-ref="${esc(x.sub.split(" · ")[0])}"><span class="pill">Applicant</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></button>`).join("") : `<p class="st-qr none">No one matches “${esc(q)}”.</p>`;
      box.hidden = false; }, 220); return; }
  if (e.target.id === "adm-q") { ui.q = e.target.value.trim().toLowerCase(); applyFilter(); }
});
document.addEventListener("change", (e) => {
  const el = e.target, k = el.dataset.k;
  if (el.dataset.actChange === "track") { const none = el.value === "NONE"; $("#wi-" + k).hidden = !none; $("#ri-" + k).hidden = none; }
  if (el.dataset.actChange === "interest") { $("#wo-" + k).hidden = el.value !== "Other"; }
  if (["res-cohort", "res-track", "res-st", "res-q"].includes(el.dataset.change)) {
    if (el.dataset.change === "res-cohort") ui.resCohort = +el.value; else ui.resF = { ...(ui.resF || {}), [el.dataset.change.slice(4)]: el.value };
    route(); return; }
  if (el.dataset.change === "pod-move") {
    const v = el.value; if (v === "") return; el.disabled = true;
    rpc("acad_pod_assign", { p_app: el.dataset.app, p_pod: v === "0" ? null : +v }).then(() => { toast(v === "0" ? "Removed from pod" : "Moved"); route(); }).catch((x) => { toast(x.message); el.disabled = false; });
    return;
  }
  if (el.dataset.change === "ops-check") { el.disabled = true; rpc("ops_check", { p_item: el.dataset.k, p_done: el.checked }).then(() => route()).catch((x) => { el.checked = !el.checked; el.disabled = false; toast(x.message); }); return; }
  if (el.dataset.change === "lmark") {
    el.disabled = true;
    rpc("acad_learn_mark", { p_app: el.dataset.app, p_key: el.dataset.key, p_done: el.checked }).then(() => toast(el.checked ? "Marked done" : "Marked not done"))
      .catch((x) => { el.checked = !el.checked; toast(x.message); }).finally(() => { el.disabled = false; });
    return;
  }
  if (ui.quiz && el.closest?.("#ls-quiz") && el.name?.startsWith("q")) { ui.quiz.ans[+el.name.slice(1)] = +el.value; quizTick(); return; }
  if (ui.exam && el.closest?.("#ls-exam") && el.name?.startsWith("x")) { ui.exam.ans[+el.name.slice(1)] = +el.value; examSave(); examTick(); return; }
  if (el.dataset.li && LS) { const d = { ...draft("li", {}), [el.dataset.li]: el.checked }; saveDraft("li", d); return; }
  if (el.dataset.prep && LS) { const d = { ...draft("prep", {}), [el.dataset.prep]: el.checked }; saveDraft("prep", d); return; }
  if (el.dataset.app != null && el.tagName === "SELECT" && LS) { const apps = draft("apps", []).map((a, i) => (i === +el.dataset.app ? { ...a, st: el.value } : a)); saveDraft("apps", apps, true); lsRender(); return; }
  if (el.id === "pf-photo-in") { photoPick(el.files[0]); el.value = ""; return; }
  if (el.dataset.cr && LS) { saveCareer(el); return; }
  if (el.dataset.ostat && LS) { const o = draft("opps", {}), st = { ...(o.st || {}) }; if (el.value) st[el.dataset.ostat] = el.value; else delete st[el.dataset.ostat]; saveDraft("opps", { ...o, st }, true); lsRender(); return; }
  if (el.id === "coh-pick") { ui.coh = el.value || null; return route(); }
  if (el.id === "week-select") { ui.wtab = "tasks"; return go(el.value === "grad" ? "#/learn/graduate" : "#/learn/learning/" + el.value); }
  if (el.id === "g-state") fillTowns();
  if (el.id === "g-country") setCountry();
  if (el.id === "g-cc") { el.dataset.touched = "1"; ccShow(); }
  if ((el.id === "g-first" || el.id === "g-sur") && el.value.trim()) el.value = nameCase(el.value);
  if (el.id === "g-town") { const o = $("#g-town-o"); o.hidden = el.value !== "Other"; if (!o.hidden) o.focus(); }
  if (el.closest?.("#apply-form")) apSave();
  if (el.name === "st-mode") {
    const m = el.value; $$("input[name=st-mode]").forEach((x) => (x.disabled = true));
    rpc("admin_test_mode", { p_mode: m }).then((r) => { $("#st-unlock-msg").textContent = TEST_MSG[r] || ""; toast(r === "open" ? "All portal weeks are open for testing" : r === "progress" ? "Weeks now open by progress only. Dates are ignored." : "Portal weeks are back to normal"); })
      .catch((x) => toast(x.message)).finally(() => $$("input[name=st-mode]").forEach((x) => (x.disabled = false)));
    return;
  }
  if (el.name === "plan" && $("#pay-btn")) $("#pay-btn").textContent = `Accept and pay ${naira(+el.dataset.amount)}`;
});

document.addEventListener("submit", async (e) => {
  if (e.target.id === "ex-set") { e.preventDefault(); const f = e.target, err = $("#ex-err"); err.textContent = "";
    const sched = $$("#ex-set tr[data-track]").map((r) => ({ track: r.dataset.track, fund_day: +r.querySelector(".ex-fd").value, core_day: +r.querySelector(".ex-cd").value }));
    const p = { schedule: sched, exam_open: $("#ex-open").value, exam_close: $("#ex-close").value, exam_fund_minutes: $("#ex-fm").value, exam_core_minutes: $("#ex-cm").value, exam_week_start: $("#ex-week").value || "", published: $("#ex-pub").checked };
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("acad_exam_settings", { p })); toast("Examination settings saved"); route(); } catch (x) { err.textContent = x.message; } return; }
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
      if ((ui.ofScore || {})[k]) await rpc("officer_call_score", { p_id: k, p_score: ui.ofScore[k] }).catch(() => {});
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
      site: { site_url: v("st-site"), website_url: v("st-web"), zuri_url: v("st-zuri"), call_link: v("st-call"), info_session_url: v("st-info"), sample_lesson_url: v("st-sample"), team: JSON.stringify(Object.fromEntries(TEAM.map(([r], i) => [r, { name: v(`st-tn${i}`), photo: v(`st-tp${i}`) }]).filter(([, m]) => m.name || m.photo))), signer_name: v("st-sname"), signer_title: v("st-stitle"), careers_url: v("st-careers"), recruit_url: v("st-recruit") } };
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
  if (f.id === "cm-news") {
    const t0 = $("#cmn-t").value.trim(), b = $("#cmn-b").value.trim(); if (!t0 || !b) { $("#cmn-err").textContent = "Add a title and a message."; return; }
    try { const n = await busy(f.querySelector("button"), () => rpc("acad_announce", { p_title: t0, p_body: b, p_track: $("#cmn-to").value || null, p_email: $("#cmn-e").checked })); toast(n ? `Posted and emailed to ${n}` : "Posted"); f.reset(); } catch (x) { $("#cmn-err").textContent = x.message; }
    return;
  }
  if (f.id === "host-form") {
    const v = (id) => $("#" + id).value.trim(), P = { id: f.dataset.id ? +f.dataset.id : null, name: v("ho-n"), city: v("ho-c"), tracks: v("ho-t"), spots: v("ho-s"), contact_name: v("ho-cn"), contact_phone: v("ho-cp"), contact_email: v("ho-ce"), active: $("#ho-a").checked };
    if (!P.name) return toast("Add the organisation's name");
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("host_save", { p: P })); toast("Host saved"); ui.hostEdit = null; route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "s3-esc-form") {
    const t0 = $("#s3e-t").value.trim(); if (!t0) return toast("Say what needs deciding");
    try { await busy(f.querySelector("button"), () => rpc("escalation_raise", { p_app: ui.s360.id, p_kind: $("#s3e-k").value, p_title: t0, p_detail: $("#s3e-d").value, p_week: $("#s3e-k").value === "retake" ? ((ui.s360.weeks || []).find((w) => w.state === "fail")?.week ?? ui.s360.cur) : null })); toast("Sent to the Programme Director"); f.reset(); f.closest("details")?.removeAttribute("open"); } catch { /* shown */ }
    return;
  }
  if (f.id === "s3-note-form") {
    const v = $("#s3-note-t").value.trim(); if (!v) return toast("Write the note first");
    try { await busy(f.querySelector("button"), () => rpc("acad_note_add", { p_app: ui.s360.id, p_body: v })); toast("Note added"); route(); } catch { /* shown */ }
    return;
  }
  if (f.id === "s3-extend") {
    const v = $("#s3-date").value; if (!v) { $("#s3-ext-err").textContent = "Choose the new due date."; return; }
    try { await busy(f.querySelector("button[type=submit]"), () => rpc("acad_fee_extend", { p_app: ui.s360.id, p_date: v })); toast("New due date saved. Their learning is open."); route(); } catch (x) { $("#s3-ext-err").textContent = x.message; }
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
  if (f.id === "ls-exam" && ui.exam) { await examSubmit(false); return; }
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
    try { await busy(f.querySelector("button"), () => rpc("super_save_staff", { p_email: $("#sf-email").value, p_name: $("#sf-name").value, p_role: $("#sf-role").value, p_active: $("#sf-active").checked, p_track: $("#sf-track").value || null }));
      let sent = false; if ($("#sf-invite")?.checked && $("#sf-active").checked) { try { await rpc("super_staff_invite", { p_email: $("#sf-email").value }); sent = true; } catch { /* shown */ } }
      toast(sent ? "Saved and invite sent" : "Saved"); route(); }
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
      <span class="cert-prog">${esc(c.kind === "internship" ? c.role : c.programme)}</span>${c.kind !== "internship" && c.class ? `<span class="cert-class">${esc(c.class)}</span>` : ""}
      <span class="cert-sm">${c.kind === "internship" ? `at ${esc(c.org)} · 4 weeks · supervised by ${esc(c.sup_name)}` : `${c.track ? `${esc(c.track)} track · ` : ""}a ${c.weeks || 20}-week online programme by Jobnest Academy`}</span>
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
  F('400 16px "DM Sans", sans-serif'); x.fillStyle = "#3E5266"; x.fillText(c.kind === "internship" ? `at ${c.org} · 4 weeks · supervised by ${c.sup_name}` : `${c.track ? `${c.track} track · ` : ""}a ${c.weeks || 20}-week online programme by Jobnest Academy`, L, oy + 408);
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
    if (p0 === "portal") return pagePortal(p1 || "", p2);
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
      if (p1 === "pilot" && p2) { try { sessionStorage.setItem("jn_pilot", p2.slice(0, 40)); } catch (e) {} history.replaceState(null, "", "/apply"); }
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#ap-drawer")) apTracksClose(); });
