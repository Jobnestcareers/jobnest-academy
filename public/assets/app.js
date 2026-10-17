// Jobnest Academy web app: public Academy site, applicant journey, staff portals.
import { rpc, auth } from "./api.js";
import { NG } from "./ng.js";

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
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
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
const pubFoot = () => `<footer class="wrap lp-foot"><a class="link" href="#/check">Continue an application</a><a class="link" href="#/staff">Staff sign-in</a><span class="note">© ${new Date().getFullYear()} Jobnest Services</span></footer>`;

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
        <li><b>Internship experience</b><span>Three weeks with a partner company.</span></li>
        <li><b>A job-ready CV and LinkedIn</b><span>Reviewed with your Career Coach.</span></li></ul>
        <div class="nl-certwrap"><div class="cert-box nl-cert" aria-label="Example certificate">${certHTML({ name: "Your Name", programme: p.name || "Graduate Employability Programme", weeks, track: "", completed_on: null, cert_id: "JNA-27-SAMPLE", signer_name: INFO.signer_name || "Shekemi Odeyemi", signer_title: INFO.signer_title || "Programme Director", year: String(new Date().getFullYear() + 1) })}</div></div>
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
      <nav aria-label="Footer"><a href="#/check">Continue an application</a><a href="#/learn/signin">Student sign-in</a><a href="#/staff">Staff sign-in</a><a href="${esc(INFO.website_url || "https://jobnestcareers.com")}">Jobnest.com ↗</a></nav></div></footer>`;
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
    <div class="grid2"><div class="field"><label for="g-first">First name</label><input id="g-first" autocomplete="given-name" maxlength="80"></div><div class="field"><label for="g-sur">Surname</label><input id="g-sur" autocomplete="family-name" maxlength="80"></div></div>
    <div class="grid2"><div class="field"><label for="g-email">Email</label><input id="g-email" type="email" autocomplete="email"></div><div class="field"><label for="g-phone">WhatsApp number</label><input id="g-phone" inputmode="tel" autocomplete="tel" placeholder="0803 000 0000"></div></div>
    <div class="grid2"><div class="field"><label for="g-state">State</label>${select("g-state", Object.keys(NG))}</div>
    <div class="field"><label for="g-town">City or town</label><select id="g-town" disabled><option value="">Choose your state first</option></select>
      <input id="g-town-o" placeholder="Type your city or town" maxlength="80" hidden style="margin-top:.5rem"></div></div>
    <h3>Your background</h3>
    <div class="grid2"><div class="field"><label for="g-edu">Highest education</label>${select("g-edu", ["OND / NCE", "HND", "B.Sc / B.A.", "Master's", "Other"])}</div>
    <div class="field"><label for="g-nysc">NYSC status</label>${select("g-nysc", ["Completed", "Currently serving", "Exempted", "Not yet"])}</div></div>
    <div class="field"><label for="g-sit">Which best describes you now?</label>${select("g-sit", ["Final-year student", "Recent graduate", "Currently serving (NYSC)"])}</div>
    <h3>Readiness</h3>
    <div class="field"><span class="lbl">Can you commit at least 15 hours a week for ${prog().weeks || 17} weeks?</span>${radios("g-hours", ["Yes", "Not sure", "No"])}</div>
    <div class="grid2"><div class="field"><span class="lbl">Do you have a laptop?</span>${radios("g-laptop", ["Yes", "No"])}</div>
    <div class="field"><span class="lbl">Reliable internet?</span>${radios("g-net", ["Yes", "Sometimes", "No"])}</div></div>
    <div class="field"><label for="g-mot">What would you like to be doing in 6 months? <span class="note" style="font-weight:400">A sentence or two. “Not sure yet” is a fine answer.</span></label><textarea id="g-mot" rows="3" maxlength="2000">${esc(zGoal)}</textarea></div>
    <div class="field"><label for="g-zuri">Your Zuri summary <span class="note" style="font-weight:400" id="g-zuri-note">${zuri ? "Filled in from your chat with Zuri. You can edit it." : "Optional. If you chatted with Zuri, paste the summary here."}</span></label><textarea id="g-zuri" rows="${zuri ? 7 : 3}" maxlength="4000">${esc(zuri)}</textarea></div>
    <label class="consent"><input type="checkbox" id="g-consent"> <span>I agree that Jobnest Academy may use these details to process my application, as set out in the <a href="${esc(INFO.website_url || "https://jobnestcareers.com")}/#privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
    <p class="err" id="g-err" role="alert"></p>
    <div class="actions"><button class="btn gold" type="submit">Submit application</button><span class="note">Next: a ${INFO.cohort?.assess_minutes || 5}-minute readiness assessment.</span></div>
  </form></section>`;
}

function cityValue() {
  const st = $("#g-state")?.value || "", t = $("#g-town")?.value || "", o = ($("#g-town-o")?.value || "").trim();
  if (!st) return "";
  if (st === "Outside Nigeria") return o ? `${o} (outside Nigeria)` : "";
  const town = t === "Other" ? o : t;
  return town ? `${town}, ${st}` : "";
}
function fillTowns() {
  const st = $("#g-state").value, sel = $("#g-town"), other = $("#g-town-o");
  const list = NG[st] || [];
  if (st === "Outside Nigeria") { sel.hidden = true; sel.innerHTML = ""; other.hidden = false; other.placeholder = "City and country"; return; }
  sel.hidden = false; sel.disabled = !st; other.hidden = true; other.value = ""; other.placeholder = "Type your city or town";
  sel.innerHTML = st ? `<option value="">Choose one</option>${list.map((c) => `<option>${esc(c)}</option>`).join("")}<option value="Other">Other (type it)</option>` : `<option value="">Choose your state first</option>`;
}

async function submitApply(form) {
  const v = (id) => ($("#" + id)?.value || "").trim();
  const r = (n) => $(`input[name="${n}"]:checked`)?.value || "";
  const d = { first_name: v("g-first"), surname: v("g-sur"), email: v("g-email"), phone: v("g-phone"), city: cityValue(), edu: v("g-edu"), nysc: v("g-nysc"),
    situation: v("g-sit"), hours: r("g-hours"), laptop: r("g-laptop"), internet: r("g-net"), motivation: v("g-mot"), zuri_summary: v("g-zuri") };
  const miss = [["first_name", "first name"], ["surname", "surname"], ["email", "email"], ["phone", "WhatsApp number"], ["city", "state and city"], ["edu", "education"], ["nysc", "NYSC status"],
    ["situation", "current situation"], ["hours", "weekly hours"], ["laptop", "laptop"], ["internet", "internet"], ["motivation", "6-month answer"]].filter(([k]) => !d[k]).map(([, l]) => l);
  const err = $("#g-err");
  if (miss.length) { err.textContent = "Please complete: " + miss.join(", ") + "."; return; }
  if (!/^\S+@\S+\.\S+$/.test(d.email)) { err.textContent = "Add a valid email address, e.g. name@gmail.com."; return; }
  if (d.phone.replace(/\D/g, "").length < 10) { err.textContent = "Add your WhatsApp number, e.g. 0803 000 0000."; return; }
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
    <form id="find-form" class="form" novalidate><div class="grid2"><div class="field"><label for="f-ref">Application number</label><input id="f-ref" placeholder="APP-1A2B3C" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase"></div>
      <div class="field"><label for="f-sur">Surname</label><input id="f-sur" autocomplete="family-name"></div></div><p class="err" id="f-err" role="alert"></p><div><button class="btn gold" type="submit">Continue</button></div></form>
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
  if (view === "paid" || view === "payfail" || view === "paycheck") history.replaceState(null, "", base);
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
    <form id="signin-form" class="form" novalidate><div class="field"><label for="s-email">Work email</label><input id="s-email" type="email" autocomplete="username"></div>
    <div class="field"><label for="s-pass">Password</label><input id="s-pass" type="password" autocomplete="current-password"></div>
    <p class="err" id="s-err" role="alert"></p><div><button class="btn" type="submit">Sign in</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff/reset">Forgot your password?</a> · <a class="link" href="#/staff/signup">First time? Set up your account</a></p>`);
}
function pageStaffSignup() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Set up your staff account</h1><p class="note">Use the email the Super Admin added for you.</p>
    <form id="signup-form" class="form" novalidate><div class="field"><label for="u-email">Work email</label><input id="u-email" type="email" autocomplete="username"></div>
    <div class="field"><label for="u-pass">Choose a password</label><input id="u-pass" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
    <div class="field"><label for="u-pass2">Confirm password</label><input id="u-pass2" type="password" autocomplete="new-password"></div>
    <p class="err" id="u-err" role="alert"></p><div><button class="btn" type="submit">Create account</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff">Back to sign in</a></p>`);
}
function pageStaffReset() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Reset your password</h1><p class="note">We'll email you a link to choose a new password.</p>
    <form id="reset-form" class="form" novalidate><div class="field"><label for="r-email">Work email</label><input id="r-email" type="email" autocomplete="username"></div>
    <p class="err" id="r-err" role="alert"></p><div><button class="btn" type="submit">Email me a reset link</button></div></form>
    <p class="note" style="margin-top:1rem"><a class="link" href="#/staff">Back to sign in</a></p>`);
}
function pageNewPassword() {
  app.innerHTML = staffCard(`<span class="eyebrow">Staff</span><h1>Choose a new password</h1>
    <form id="newpw-form" class="form" novalidate><div class="field"><label for="n-pass">New password</label><input id="n-pass" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
    <div class="field"><label for="n-pass2">Confirm new password</label><input id="n-pass2" type="password" autocomplete="new-password"></div>
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
  if (["director", "cohort_manager", "facilitator", "academy_admin", "super"].includes(role)) ac.push({ k: "content", l: "Content" });
  if (["director", "cohort_manager", "facilitator", "super"].includes(role)) ac.push({ k: "grading", l: "Grading" });
  ac.push({ k: "sessions", l: "Live sessions" }, { k: "news", l: "Announcements" });
  if (role === "super") return [{ g: "Jobnest" }, { k: "staff", l: "Staff accounts" }, { k: "audit", l: "Activity log" }, ...adm, ...ac];
  if (role === "adm_admin") return [...adm, { g: "Academy" }, { k: "students", l: "Students" }];
  if (role === "adm_officer") return adm;
  return ac;
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
  const pages = { home: tabHome, calls: tabCalls, times: tabTimes, decide: tabDecide, pay: tabPay, apps: tabApps, students: tabStudents, content: tabContent, grading: tabGrading, sessions: tabSessions, news: tabNews, emails: tabEmails, settings: tabSettings, staff: tabStaff, audit: tabAudit, soon: tabSoon };
  try { await pages[tab](); }
  catch (e) { shell(tab, "Something went wrong", "", `<div class="notice">${esc(e.message)}</div>`); }
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
  return `<form class="form call-form" data-k="${id}" novalidate><div class="field"><label for="dn-${id}">Call notes</label><textarea id="dn-${id}" rows="2"></textarea></div>
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
      <div class="field"><label for="sf-email">Work email</label><input id="sf-email" type="email"></div>
      <div class="field"><label for="sf-name">Full name</label><input id="sf-name"></div>
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
      <div class="field"><label for="ac-p">Password</label><input id="ac-p" type="password" autocomplete="new-password"><span class="note">At least 8 characters, including a number.</span></div>
      <div class="field"><label for="ac-p2">Confirm password</label><input id="ac-p2" type="password" autocomplete="new-password"></div>
      <p class="err" id="ac-err" role="alert"></p><div><button class="btn gold" type="submit">Save and open the portal</button></div></form>
    <p class="note"><a class="link" href="${base}">← Back to your application</a></p></div></section>`;
}

const learnCard = (h) => pubHeader("admissions").replace("Jobnest Admissions", "Jobnest Academy") + `<section class="wrap pub-wrap"><div class="card verify">${h}</div></section>` + pubFoot();
function pageLearnSignIn(msg = "") {
  app.innerHTML = learnCard(`<span class="eyebrow">Student portal</span><h1>Sign in</h1>${msg ? `<div class="notice">${msg}</div>` : ""}
    <form id="lsignin-form" class="form" novalidate><div class="field"><label for="ls-m">Matric number</label><input id="ls-m" placeholder="GEP/27A/001" autocomplete="username" autocapitalize="characters"></div>
    <div class="field"><label for="ls-p">Password</label><input id="ls-p" type="password" autocomplete="current-password"></div>
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

function campusShell(tab, title, sub, body) {
  const me = CAMPUS.me;
  const items = [["home", "Home"], ["weeks", "Weeks"], ["tasks", "Tasks"], ["sessions", "Live sessions"], ["news", "Announcements"], ...(CAMPUS.cert ? [["certificate", "Certificate 🎓"]] : [])];
  const todo = CAMPUS.tasks.filter((t) => !t.sub || t.sub.status === "redo").length;
  const nav = items.map(([k, l]) => `<a class="snav-i" href="#/learn/${k}" aria-current="${k === tab ? "page" : "false"}"><span>${l}</span>${k === "tasks" && todo ? `<b class="cnt-b mono">${todo}</b>` : ""}</a>`).join("")
    + `<p class="snav-g">${esc(me.matric)}</p><button class="snav-i" data-act="tour"><span>Take the tour again</span></button><button class="snav-i" data-act="signout-learn"><span>Sign out</span></button>`;
  app.innerHTML = `<header class="adm-top role-top"><div class="shell-top"><div class="logo">${LOGO}Jobnest Academy · Student</div>
    <div class="shell-tr"><span class="note" style="color:#C9D6E2">${esc(me.first_name)} · <span class="mono">${esc(me.matric)}</span></span><button class="btn sm ghost" data-act="signout-learn">Sign out</button></div></div></header>
    <div class="shell"><aside class="snav" aria-label="Menu"><p class="snav-g">${esc(me.track || "")}</p>${nav}</aside>
    <main class="shell-main"><details class="snav-m"><summary><span>Menu</span><b>${(items.find((x) => x[0] === tab) || [])[1] || ""}</b></summary><nav class="snav-m-list">${nav}</nav></details>
    <div class="wrap greet"><div><p class="eyebrow">${esc(CAMPUS.cohort.programme)} · ${esc(me.track || "")}</p><h1 style="margin-top:.5rem">${title}</h1>${sub ? `<p class="note" style="font-size:.95rem;margin-top:.4rem;max-width:62ch">${sub}</p>` : ""}</div></div>
    <section class="wrap pagebody">${body}</section></main></div>`;
}

const lessonItem = (l) => `<li class="lesson"><span class="lk" aria-hidden="true">${KIND_I[l.kind] || "📘"}</span><div><b>${esc(l.title)}</b><span class="note"> · ${KIND_L[l.kind] || "Lesson"}</span>${l.body ? `<p class="note">${lines(l.body)}</p>` : ""}</div>${l.url ? `<a class="btn sm ghost" href="${esc(l.url)}" target="_blank" rel="noopener">Open ↗</a>` : ""}</li>`;
const subPill = (t) => !t.sub ? (new Date(t.due_at) < new Date() ? `<span class="pill bad">Overdue</span>` : `<span class="pill now">To do</span>`)
  : t.sub.status === "passed" ? `<span class="pill ok">Passed${t.sub.score != null ? ` · ${t.sub.score}%` : ""}</span>` : t.sub.status === "redo" ? `<span class="pill bad">Try again</span>` : `<span class="pill">Waiting for marking</span>`;
function taskCard(t, open = false) {
  const s = t.sub;
  return `<details class="arow noav task" ${open ? "open" : ""}><summary><span class="an"><b>${esc(t.title)}</b><span class="note">Week ${t.week} · due ${fmtAt(t.due_at)} WAT</span></span>${subPill(t)}</summary>
    <div class="abody">${t.brief ? `<p>${lines(t.brief)}</p>` : ""}${t.url ? `<p><a class="link" href="${esc(t.url)}" target="_blank" rel="noopener">Task materials ↗</a></p>` : ""}
      ${s ? `<div class="rec ${s.status === "passed" ? "rec-offer" : s.status === "redo" ? "rec-decline" : ""}"><span class="eyebrow">Your work · sent ${fmtAt(s.submitted_at)}</span><a class="link" href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.link)}</a>${s.feedback ? `<span><b>Feedback:</b> ${lines(s.feedback)}</span>` : ""}</div>` : ""}
      ${s?.status === "passed" ? "" : `<form class="form sub-form" data-k="${t.id}" novalidate><div class="field"><label for="sl-${t.id}">Link to your work</label><input id="sl-${t.id}" type="url" placeholder="https://docs.google.com/…" value="${s?.status === "redo" ? esc(s.link) : ""}"><span class="note">Set sharing to “Anyone with the link can view”.</span></div>
        <div class="field"><label for="sn-${t.id}">Note for your facilitator (optional)</label><input id="sn-${t.id}"></div>
        <div class="actions"><button class="btn sm" type="submit">${s ? "Send again" : "Submit"}</button></div></form>`}</div></details>`;
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
  const passed = C.tasks.filter((t) => t.sub && t.sub.status === "passed");
  const past = C.sessions.filter((x) => new Date(x.starts_at).getTime() + x.minutes * 6e4 < Date.now());
  const came = past.filter((x) => ["present", "late", "joined"].includes(x.att)).length;
  const w = C.week, weeks = C.cohort.weeks;
  const B = [["🚀", "Started", true], ["✅", "First task", passed.length >= 1], ["🔥", "5 tasks passed", passed.length >= 5],
    ["💼", "Client project", passed.some((t) => t.week >= 8 && t.week <= 9)], ["🎓", "Graduate", !!cert]];
  return `<div class="card prog-card"><h3>Your progress</h3>
    <div class="prog-stats"><div><b class="mono">${passed.length}/${C.tasks.length}</b><span>tasks passed</span></div><div><b class="mono">${past.length ? Math.round((came / past.length) * 100) + "%" : "–"}</b><span>attendance</span></div></div>
    <div class="badges" aria-label="Badges">${B.map(([e, t, on]) => `<span class="badge ${on ? "on" : ""}" title="${t}${on ? "" : " (not yet)"}"><i aria-hidden="true">${e}</i>${t}</span>`).join("")}</div></div>`;
}

async function pageLearn(tab) {
  if (!auth.session) return pageLearnSignIn();
  if (!isStudent()) { app.innerHTML = learnCard(`<h1>You're signed in as staff</h1><p>Sign out first to use the student portal.</p><div class="actions"><a class="btn" href="#/portal">Go to the staff portal</a><button class="btn ghost" data-act="signout-learn">Sign out</button></div>`); return; }
  loading();
  let extra = {};
  let cert = null;
  try { [CAMPUS, extra, cert] = await Promise.all([rpc("student_campus"), rpc("student_campus_extra").catch(() => ({})), rpc("student_certificate").catch(() => null)]); }
  catch (e) { if (e.status === 401 || /sign in/i.test(e.message)) { await auth.signOut(); return pageLearnSignIn("Please sign in again."); } throw e; }
  CAMPUS.cert = cert;
  const C = CAMPUS, w = C.week, weeks = C.cohort.weeks;
  const tab_ = ["home", "weeks", "tasks", "sessions", "news", "certificate"].includes(tab) && (tab !== "certificate" || cert) ? tab : "home";
  const upcoming = C.sessions.filter((x) => new Date(x.starts_at).getTime() + x.minutes * 6e4 > Date.now());
  const todo = C.tasks.filter((t) => !t.sub || t.sub.status === "redo");
  const bal = C.me.balance > 0 ? `<div class="notice bal"><span>Your second instalment of <b>${naira(C.me.balance)}</b> is due by ${fmtDateD(C.me.due_date)}.</span><a class="btn sm gold" href="#/a/${esc(C.me.ref)}/${esc(C.me.token)}">Pay now</a></div>` : "";
  if (tab_ === "home") {
    const days = Math.ceil((new Date(C.cohort.start_date + "T00:00:00+01:00") - Date.now()) / 864e5);
    const thisWeek = Math.min(Math.max(w, 1), weeks);
    const L = C.lessons.filter((l) => l.week === thisWeek);
    const head = w < 1 ? `<div class="card hero-c" id="t-week"><span class="eyebrow">Before you start</span><h2>${days} day${days === 1 ? "" : "s"} to go</h2><p>${esc(C.cohort.name)} starts on <b>${fmtDateD(C.cohort.start_date)}</b> with Week 1: Orientation. Week 1 opens here on the Saturday before.</p></div>`
      : w > weeks ? `<div class="card hero-c" id="t-week"><span class="eyebrow">Programme complete</span><h2>You made it 🎉</h2><p>Your lessons and work stay here for you to look back on.</p></div>`
      : `<div class="card hero-c" id="t-week"><span class="eyebrow">Week ${w} of ${weeks}</span><h2>${esc(stageOf(w))}</h2><div class="wbar" aria-label="Progress"><i style="width:${(w / weeks) * 100}%"></i></div></div>`;
    setTimeout(() => { let seen = false; try { seen = localStorage.getItem("jn.tour." + C.me.matric) === "1"; } catch { /* ignore */ } if ((ui.wantTour || (!extra.tour_done && !seen)) && TOUR_I == null) { ui.wantTour = false; startTour(); } }, 50);
    const certCard = cert ? `<div class="card cert-card"><span class="eyebrow">Certificate of completion</span><h2>Your certificate is ready 🎓</h2><div class="actions"><a class="btn gold" href="#/learn/certificate">View and download</a></div></div>` : "";
    campusShell("home", `Hi ${esc(C.me.first_name)}`, "", `${installCard()}${bal}${certCard}${head}${progressCard(C, cert)}<div class="grid2" style="margin-top:1rem">
      <div class="card" id="t-lessons"><div class="ch"><h3>This week's lessons</h3><a class="link sm" href="#/learn/weeks">All weeks →</a></div>${L.length ? `<ul class="lessons">${L.map(lessonItem).join("")}</ul>` : empty(C.open_weeks ? "Lessons for this week will appear here." : "Week 1 opens on the Saturday before the start date.")}</div>
      <div class="stack"><div class="card" id="t-session"><div class="ch"><h3>Next live session</h3><a class="link sm" href="#/learn/sessions">All →</a></div>${upcoming.length ? `<ul class="sess-list">${sessionRow(upcoming[0])}</ul>` : empty("No sessions scheduled yet.")}</div>
        <div class="card" id="t-tasks"><div class="ch"><h3>Tasks to do</h3><a class="link sm" href="#/learn/tasks">All →</a></div>${todo.length ? `<ul class="lessons">${todo.slice(0, 4).map((t) => `<li class="lesson"><span class="lk" aria-hidden="true">📝</span><div><a class="link" href="#/learn/tasks"><b>${esc(t.title)}</b></a><span class="note" style="display:block">Due ${fmtAt(t.due_at)} WAT</span></div>${subPill(t)}</li>`).join("")}</ul>` : empty("Nothing to hand in right now.")}</div>
        ${C.news[0] ? `<div class="card"><div class="ch"><h3>Latest announcement</h3><a class="link sm" href="#/learn/news">All →</a></div><p><b>${esc(C.news[0].title)}</b></p><p class="note">${lines(C.news[0].body).slice(0, 400)}</p></div>` : ""}</div></div>`);
  }
  if (tab_ === "weeks") {
    const rows = [...Array(weeks)].map((_, i) => {
      const n = i + 1, open = n <= C.open_weeks, L = C.lessons.filter((l) => l.week === n), T = C.tasks.filter((t) => t.week === n);
      const opens = new Date(new Date(C.cohort.start_date + "T12:00:00Z").getTime() + ((n - 1) * 7 - 2) * 864e5);
      return `<details class="arow wk ${open ? "" : "locked"}" ${n === Math.max(w, 1) && open ? "open" : ""} ${open ? "" : 'data-locked="1"'}><summary><span class="aav mono">${n}</span><span class="an"><b>Week ${n}</b><span class="note">${esc(stageOf(n))}</span></span><span class="anext">${open ? `${L.length} item${L.length === 1 ? "" : "s"}${T.length ? ` · ${T.length} task${T.length === 1 ? "" : "s"}` : ""}` : `🔒 Opens ${fmtDay(opens)}`}</span>${n === w ? `<span class="pill now">This week</span>` : n < w ? `<span class="pill ok">Done</span>` : ""}</summary>
        ${open ? `<div class="abody">${L.length ? `<ul class="lessons">${L.map(lessonItem).join("")}</ul>` : empty("Nothing posted for this week yet.")}${T.length ? `<p class="eyebrow" style="margin-top:.6rem">Tasks</p>${T.map((t) => `<p><a class="link" href="#/learn/tasks">${esc(t.title)}</a> ${subPill(t)}</p>`).join("")}` : ""}</div>` : ""}</details>`;
    }).join("");
    campusShell("weeks", "Weeks", `${weeks} weeks. Each week opens on the Saturday before it starts.`, `<div class="arows">${rows}</div>`);
  }
  if (tab_ === "tasks") {
    const passed = C.tasks.filter((t) => t.sub?.status === "passed").length;
    campusShell("tasks", "Tasks", `Hand in each task by sharing a link to your work. You've passed <b>${passed}</b> of ${C.tasks.length}.`,
      C.tasks.length ? `<div class="arows">${C.tasks.slice().sort((a, b) => (a.sub?.status === "passed") - (b.sub?.status === "passed") || new Date(a.due_at) - new Date(b.due_at)).map((t, i) => taskCard(t, i === 0 && t.sub?.status !== "passed")).join("")}</div>` : `<div class="card">${empty("No tasks yet. They'll appear here as each week opens.")}</div>`);
  }
  if (tab_ === "sessions") {
    const past = C.sessions.filter((x) => !upcoming.includes(x)).reverse();
    campusShell("sessions", "Live sessions", "Join from here so your attendance is recorded. Times are in WAT.",
      `<div class="card"><h3>Coming up</h3>${upcoming.length ? `<ul class="sess-list">${upcoming.map(sessionRow).join("")}</ul>` : empty("No sessions scheduled yet.")}</div>
      ${past.length ? `<div class="card" style="margin-top:1rem"><h3>Past sessions</h3><ul class="sess-list">${past.map(sessionRow).join("")}</ul></div>` : ""}`);
  }
  if (tab_ === "certificate") {
    let c = null;
    try { c = await rpc("certificate_view", { p_cert: cert.cert_id }); } catch { c = null; }
    campusShell("certificate", `Congratulations, ${esc(C.me.first_name)}! 🎓`, "You finished the programme. Download your certificate, add it to LinkedIn, or share the link with employers.", c ? certBlock(c) : empty("Your certificate couldn't load. Please refresh."));
    fitCert();
    return;
  }
  if (tab_ === "news") {
    campusShell("news", "Announcements", "", C.news.length ? `<div class="stack">${C.news.map((n) => `<article class="card"><span class="eyebrow">${fmtAt(n.at)} · ${esc(n.by)}</span><h3 style="margin:.4rem 0">${esc(n.title)}</h3><p>${lines(n.body)}</p></article>`).join("")}</div>` : `<div class="card">${empty("No announcements yet.")}</div>`);
  }
}

/* ---------- welcome tour (student portal) ---------- */
const TOUR = [
  { t: "Welcome to your student portal", b: "Here's a quick look around. It takes less than a minute." },
  { t: "Where you are", b: "Your week and stage of the programme. Before the start date, this counts down the days.", sel: "#t-week" },
  { t: "This week's lessons", b: "Videos, readings and links for the week. Tap Open to start one. Each week opens on the Saturday before it starts.", sel: "#t-lessons" },
  { t: "Live sessions", b: "Join classes from here. Joining through the portal records your attendance.", sel: "#t-session" },
  { t: "Tasks", b: "Hand in each task by pasting a link to your work. Your facilitator marks it and you'll get an email with feedback.", sel: "#t-tasks" },
  { t: "Your menu", b: "Weeks, Tasks, Live sessions and Announcements are all here. On a phone, tap Menu at the top.", sel: [".snav", ".snav-m"] },
  { t: "You're all set", b: "Sign out from the top bar or the menu. You can take this tour again from the menu any time." },
];
let TOUR_I = null;
function clearSpot() { $$(".spot").forEach((x) => x.classList.remove("spot")); }
function startTour() { if (!$("#t-week")) { ui.wantTour = true; return go("#/learn/home"); } TOUR_I = 0; $("#toast").hidden = true; clearTimeout(toast.t); renderTour(); }
function renderTour() {
  clearSpot();
  let root = $("#tour-root");
  if (!root) { root = document.createElement("div"); root.id = "tour-root"; document.body.appendChild(root); }
  if (TOUR_I == null) { root.innerHTML = ""; return; }
  const i = TOUR_I, st = TOUR[i], last = i === TOUR.length - 1;
  let low = false;
  if (st.sel) {
    const el = [].concat(st.sel).map((x) => $(x)).find((x) => x && x.offsetParent !== null);
    if (el) { el.classList.add("spot"); el.scrollIntoView({ block: "center", behavior: "smooth" }); low = true; }
  }
  root.innerHTML = `<div class="scrim"></div><div class="tour ${low ? "low" : ""}" role="dialog" aria-modal="true" aria-labelledby="tour-t">
    <div class="hd"><span class="badge">${i + 1} of ${TOUR.length}</span><button class="x" data-act="tour-end" aria-label="Close tour">✕</button></div>
    <h2 id="tour-t">${st.t}</h2><p>${st.b}</p>
    <div class="dots" aria-hidden="true">${TOUR.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
    <div class="ft">${i > 0 ? `<button class="skip" data-act="tour-back">Back</button>` : `<button class="skip" data-act="tour-end">Skip tour</button>`}
    <button class="btn" data-act="${last ? "tour-end" : "tour-next"}" id="tour-next">${last ? "Get started" : "Next →"}</button></div></div>`;
  $("#tour-next").focus({ preventScroll: true });
}
function endTour() {
  TOUR_I = null; renderTour(); window.scrollTo({ top: 0, behavior: "smooth" });
  try { localStorage.setItem("jn.tour." + (CAMPUS?.me?.matric || ""), "1"); } catch { /* ignore */ }
  rpc("student_tour_done").catch(() => {});
}

/* ---------- staff: academy ---------- */
const trackOpts = (tracks, mine, val) => (mine ? tracks.filter((t) => t.code === mine) : [{ code: "", name: "All tracks" }, ...tracks]).map((t) => `<option value="${t.code}" ${t.code === (val ?? "") ? "selected" : ""}>${esc(t.name)}</option>`).join("");
const tName = (tracks, c) => c ? (tracks.find((t) => t.code === c)?.name || c) : "All tracks";

async function tabStudents() {
  const [d, certs] = await Promise.all([rpc("acad_students"), rpc("acad_certificates").catch(() => ({}))]);
  const canCert = ["director", "academy_admin", "super"].includes(ME.role);
  const S = d.students, set = S.filter((s) => s.account).length;
  const att = S.filter((s) => s.sessions_past).map((s) => s.sessions_attended / s.sessions_past);
  const canInvite = ["cohort_manager", "academy_admin", "adm_admin", "super"].includes(ME.role);
  shell("students", "Students", `${esc(d.cohort.name)} · ${d.week < 1 ? `starts ${fmtDateD(d.cohort.start_date)}` : `week ${d.week}`}${d.my_track ? ` · ${esc(tName(d.tracks, d.my_track))} only` : ""}`,
    `<div class="kpis">${[["Students", S.length], ["Accounts set up", `${set}/${S.length}`], ["Waiting for marking", S.reduce((t, s) => t + s.tasks_waiting, 0)], ["Average attendance", att.length ? Math.round((att.reduce((a, b) => a + b, 0) / att.length) * 100) + "%" : "–"]].map(([l, v]) => `<div class="kpi card"><span class="eyebrow">${l}</span><b class="mono">${v}</b></div>`).join("")}</div>
    ${canInvite && S.length > set ? `<div class="notice" style="margin-top:1rem"><span>${S.length - set} student${S.length - set === 1 ? " hasn't" : "s haven't"} set up their portal account yet.</span><button class="btn sm" data-act="invite">Email them a set-up link</button></div>` : ""}
    <div class="card" style="margin-top:1rem">${S.length ? `<div class="tbl-wrap"><table class="tbl cards"><thead><tr><th>Student</th><th>Track</th><th>Portal</th><th>Tasks passed</th><th>Attendance</th><th>Fees</th><th>Certificate</th></tr></thead><tbody>
      ${S.map((s) => `<tr><td data-label="Student"><b>${esc(s.first_name)} ${esc(s.surname)}</b><span class="note" style="display:block"><span class="mono">${esc(s.matric)}</span> · ${esc(s.phone)}</span></td><td data-label="Track">${esc(s.track || "")}</td>
        <td data-label="Portal">${s.account ? `<span class="pill ok">Set up</span>` : `<span class="pill">${s.invited_at ? `Invited ${fmtDay(s.invited_at)}` : "Not yet"}</span>`}</td>
        <td data-label="Tasks passed" class="mono">${s.tasks_passed}/${s.tasks_due}${s.tasks_waiting ? ` <span class="note">(+${s.tasks_waiting} to mark)</span>` : ""}</td>
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
        <div class="field"><label for="le-title">Title</label><input id="le-title" value="${e.type === "lesson" ? esc(e.title) : ""}"></div>
        <div class="field"><label for="le-url">Link (YouTube, Google Drive, …)</label><input id="le-url" type="url" placeholder="https://" value="${e.type === "lesson" ? esc(e.url || "") : ""}"></div>
        <div class="field"><label for="le-body">Notes for students (optional)</label><textarea id="le-body" rows="3">${e.type === "lesson" ? esc(e.body || "") : ""}</textarea></div>
        <label class="consent"><input type="checkbox" id="le-pub" ${e.type === "lesson" && !e.published ? "" : "checked"}> Visible to students</label>
        <div class="actions"><button class="btn sm" type="submit">${e.type === "lesson" ? "Save changes" : `Add to week ${wk}`}</button>${e.type === "lesson" ? `<button class="btn sm ghost" type="button" data-act="cancel-edit">Cancel</button>` : ""}</div></form>
      <form class="card form" id="task-form" data-id="${e.type === "task" ? e.id : ""}" novalidate><h3>${e.type === "task" ? "Edit task" : "Add a task"}</h3>
        <div class="field"><label for="tk-title">Title</label><input id="tk-title" value="${e.type === "task" ? esc(e.title) : ""}"></div>
        <div class="field"><label for="tk-brief">What should they do and hand in?</label><textarea id="tk-brief" rows="3">${e.type === "task" ? esc(e.brief || "") : ""}</textarea></div>
        <div class="field"><label for="tk-url">Materials link (optional)</label><input id="tk-url" type="url" placeholder="https://" value="${e.type === "task" ? esc(e.url || "") : ""}"></div>
        <div class="grid2"><div class="field"><label for="tk-date">Due date</label><input id="tk-date" type="date" value="${e.type === "task" ? watParts(e.due_at).date : defDue.date}"></div><div class="field"><label for="tk-time">Time (WAT)</label><input id="tk-time" type="time" value="${e.type === "task" ? watParts(e.due_at).time : "23:59"}"></div></div>
        <div class="field"><label for="tk-track">For</label><select id="tk-track">${trackOpts(d.tracks, d.my_track, e.type === "task" ? e.track_code : null)}</select></div>
        <label class="consent"><input type="checkbox" id="tk-pub" ${e.type === "task" && !e.published ? "" : "checked"}> Visible to students</label>
        <div class="actions"><button class="btn sm" type="submit">${e.type === "task" ? "Save task" : `Add task to week ${wk}`}</button>${e.type === "task" ? `<button class="btn sm ghost" type="button" data-act="cancel-edit">Cancel</button>` : ""}</div></form></div>` : ""}</div>`);
  ui.content = d;
}

async function tabGrading() {
  const L = await rpc("acad_submissions");
  const wait = L.filter((x) => x.status === "submitted"), done = L.filter((x) => x.status !== "submitted");
  const canGrade = ["cohort_manager", "facilitator", "super"].includes(ME.role);
  const row = (x) => `<details class="arow noav" data-id="g${x.id}" ${ui.open === "g" + x.id ? "open" : ""}><summary><span class="an"><b>${esc(x.student)}</b><span class="note">${esc(x.matric)} · ${esc(x.task)} · week ${x.week}</span></span><span class="anext">${x.status === "submitted" ? `Sent ${ago(x.submitted_at)}${new Date(x.submitted_at) > new Date(x.due_at) ? " · late" : ""}` : `${x.status === "passed" ? "Passed" : "Asked to redo"} · ${esc(x.graded_by || "")}`}</span>${x.status === "submitted" ? `<span class="pill now">To mark</span>` : x.status === "passed" ? `<span class="pill ok">Passed</span>` : `<span class="pill bad">Redo</span>`}</summary>
    <div class="abody"><p><a class="btn sm ghost" href="${esc(x.link)}" target="_blank" rel="noopener">Open their work ↗</a></p>${x.note ? `<p class="note">“${esc(x.note)}”</p>` : ""}${x.brief ? `<p class="note"><b>Task:</b> ${lines(x.brief)}</p>` : ""}${x.feedback && x.status !== "submitted" ? `<p class="note"><b>Your feedback:</b> ${lines(x.feedback)}</p>` : ""}
      ${canGrade && x.status === "submitted" ? `<form class="form grade-form" data-k="${x.id}" novalidate><div class="rate"><label><input type="radio" name="gr-${x.id}" value="passed"><span>Passed</span></label><label><input type="radio" name="gr-${x.id}" value="redo"><span>Needs another try</span></label></div>
        <div class="grid2"><div class="field"><label for="gs-${x.id}">Score % (optional)</label><input id="gs-${x.id}" type="number" min="0" max="100" inputmode="numeric"></div></div>
        <div class="field"><label for="gf-${x.id}">Feedback (required for “another try”)</label><textarea id="gf-${x.id}" rows="2"></textarea></div><div class="actions"><button class="btn sm" type="submit">Send result</button></div></form>` : ""}</div></details>`;
  shell("grading", "Grading", "Students get an email with your result and feedback.",
    `<div class="card"><div class="ch"><h3>To mark</h3><span class="note">${wait.length}</span></div>${wait.length ? `<div class="arows">${wait.map(row).join("")}</div>` : empty("Nothing waiting. 🎉")}</div>
    <div class="card" style="margin-top:1rem"><h3>Marked in the last 30 days</h3>${done.length ? `<div class="arows">${done.map(row).join("")}</div>` : empty("Nothing yet.")}</div>`);
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
      <div class="grid2"><div class="field"><label for="se-min">Minutes</label><input id="se-min" type="number" min="10" max="480" value="${e ? e.minutes : 60}"></div><div class="field"><label for="se-host">Host</label><input id="se-host" value="${e ? esc(e.host || "") : esc(ME.name)}"></div></div>
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
      <div class="field"><label for="nw-title">Title</label><input id="nw-title"></div>
      <div class="field"><label for="nw-body">Message</label><textarea id="nw-body" rows="5"></textarea></div>
      <div class="field"><label for="nw-track">Send to</label><select id="nw-track">${trackOpts(d.tracks, d.my_track, null)}</select></div>
      <label class="consent"><input type="checkbox" id="nw-email" checked> Also email it to them</label>
      <p class="err" id="nw-err" role="alert"></p><div><button class="btn" type="submit">Post</button></div></form>` : ""}
    <div class="stack">${d.news.length ? d.news.map((n) => `<article class="card"><span class="eyebrow">${fmtAt(n.created_at)} · ${esc(n.by || "")} · ${esc(n.track || "All tracks")}${n.emailed ? " · emailed" : ""}</span><h3 style="margin:.4rem 0">${esc(n.title)}</h3><p>${lines(n.body)}</p></article>`).join("") : `<div class="card">${empty("No announcements yet.")}</div>`}</div></div>`);
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
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
  if (a === "signout-learn") { TOUR_I = null; renderTour(); await auth.signOut(); CAMPUS = null; return go("#/learn/signin"); }
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
  if (e.target.id === "adm-q") { ui.q = e.target.value.trim().toLowerCase(); applyFilter(); }
});
document.addEventListener("change", (e) => {
  const el = e.target, k = el.dataset.k;
  if (el.dataset.actChange === "track") { const none = el.value === "NONE"; $("#wi-" + k).hidden = !none; $("#ri-" + k).hidden = none; }
  if (el.dataset.actChange === "interest") { $("#wo-" + k).hidden = el.value !== "Other"; }
  if (el.id === "g-state") fillTowns();
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
  if (f.classList.contains("sub-form")) {
    const k = f.dataset.k, link = $("#sl-" + k).value.trim();
    if (!/^https?:\/\//i.test(link)) return toast("Paste the full link, starting with https://");
    try { await busy(f.querySelector("button"), () => rpc("student_submit", { p_task: +k, p_link: link, p_note: $("#sn-" + k).value.trim() || null })); toast("Submitted. Your facilitator will mark it."); route(); } catch { /* shown */ }
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
      <span class="cert-sm">has successfully completed</span>
      <span class="cert-prog">${esc(c.programme)}</span>
      <span class="cert-sm">${c.track ? `${esc(c.track)} track · ` : ""}a ${c.weeks || 17}-week online programme by Jobnest Academy</span>
    </div>
    <div class="cert-sig"><img src="/assets/signature-pd.png" alt="Signature of ${esc(c.signer_name)}"><span class="cert-line"></span><b>${esc(c.signer_name)}</b><span>${esc(c.signer_title)}, Jobnest Academy</span></div>
    <div class="cert-ribbon"><span class="cert-title">CERTIFICATE<br>OF<br>COMPLETION</span><i></i><div class="cert-seal">${CERT_SEAL}<text x="105" y="140" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700" fill="#10263D">${esc(c.year || "")}</text></svg></div></div>
    <div class="cert-verify">Verify at ${esc(location.host)}/#/verify/<b>${esc(c.cert_id)}</b><br>Jobnest Academy confirms this person completed the programme.</div>
  </div></div>`;
}
function fitCert() {
  $$(".cert-box").forEach((box) => { const c = box.querySelector(".cert"); if (!c) return;
    const k = Math.min(1, box.clientWidth / 1123); c.style.transform = `scale(${k})`; box.style.height = `${794 * k}px`; });
}
window.addEventListener("resize", fitCert);
const certUrl = (c) => `${location.origin}/#/verify/${c.cert_id}`;
function certBlock(c) {
  const d = c.completed_on ? new Date(c.completed_on + "T12:00:00Z") : new Date();
  const li = "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=" + encodeURIComponent(c.programme) + "&organizationName=" + encodeURIComponent("Jobnest Academy") +
    "&issueYear=" + d.getUTCFullYear() + "&issueMonth=" + (d.getUTCMonth() + 1) + "&certUrl=" + encodeURIComponent(certUrl(c)) + "&certId=" + encodeURIComponent(c.cert_id);
  CERT_NOW = c;
  return `<div class="cert-actions"><button class="btn gold" data-act="cert-pdf">Download PDF</button><a class="btn li-btn" href="${esc(li)}" target="_blank" rel="noopener">Add to LinkedIn ↗</a><button class="btn ghost" data-act="cert-copy">Copy verification link</button></div>
    <div id="cert-box" class="cert-box">${certHTML(c)}</div>
    <p class="note" style="margin-top:.8rem">Employers can check it's real at <span class="mono" style="overflow-wrap:anywhere">${esc(certUrl(c).replace(/^https?:\/\//, ""))}</span></p>`;
}
let CERT_NOW = null;
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
    <dl class="v-facts"><div><dt>Name</dt><dd>${esc(c.name)}</dd></div><div><dt>Programme</dt><dd>${esc(c.programme)}</dd></div>${c.track ? `<div><dt>Track</dt><dd>${esc(c.track)}</dd></div>` : ""}<div><dt>Completed</dt><dd>${esc(fmtDateD(c.completed_on))}</dd></div><div><dt>Certificate</dt><dd class="mono">${esc(c.cert_id)}</dd></div></dl>
    ${certBlock(c)}</section>`;
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
  F('400 16px "DM Sans", sans-serif'); x.fillStyle = "#3E5266"; x.fillText("has successfully completed", L, oy + 332);
  F('500 28px "Playfair Display", serif'); x.fillStyle = "#10263D"; x.fillText(c.programme, L, oy + 374);
  F('400 16px "DM Sans", sans-serif'); x.fillStyle = "#3E5266"; x.fillText(`${c.track ? `${c.track} track · ` : ""}a ${c.weeks || 17}-week online programme by Jobnest Academy`, L, oy + 408);
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
  spaced("CERTIFICATE", rx + rw / 2, oy + 100); spaced("OF", rx + rw / 2, oy + 135); spaced("COMPLETION", rx + rw / 2, oy + 170);
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
  F('400 13px "DM Sans", sans-serif'); x.fillStyle = "#5B6B7B"; x.fillText(`Verify at ${location.host}/#/verify/`, vr - cw, oy + ih - 62); x.fillText("Jobnest Academy confirms this person completed the programme.", vr, oy + ih - 41);
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
  if (TOUR_I != null && !location.hash.startsWith("#/learn")) { TOUR_I = null; renderTour(); }
  const back = auth.takeFromUrl();
  if (back) {
    history.replaceState(null, "", location.pathname + (back.type === "recovery" ? "#/staff/new-password" : back.error ? "#/staff" : "#/portal"));
    if (back.error) return pageStaffSignIn(esc(back.error));
  }
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [p0, p1, p2, p3] = parts;
  window.scrollTo(0, 0);
  try {
    if (p0 === "staff") {
      if (p1 === "signup") return pageStaffSignup();
      if (p1 === "reset") return pageStaffReset();
      if (p1 === "new-password") return pageNewPassword();
      return auth.session ? go("#/portal") : pageStaffSignIn();
    }
    if (p0 === "portal") return pagePortal(p1 || "");
    if (p0 === "learn") {
      if (p1 === "signin") return auth.session && isStudent() ? go("#/learn") : pageLearnSignIn();
      if (p1 === "forgot") return pageLearnForgot();
      return pageLearn(p1 || "home");
    }
    if (p0 === "a" && p1 && p2) return pageApplicant(p1, p2, p3 || "");
    await info();
    if (p0 === "gep") return pageHome();
    if (p0 === "tracks") return pageTracks();
    if (p0 === "programmes") return pagePrograms();
    if ((p0 === "verify" || p0 === "certificate") && p1) return pageCertificate(p1);
    if (p0 === "start") return go("#/apply");
    if (p0 === "apply") {
      if (p1 === "zuri" && p2) { try { sessionStorage.setItem("jn_zuri", p2.slice(0, 4000)); } catch (e) {} history.replaceState(null, "", location.pathname + "#/apply"); }
      return pageApply();
    }
    if (p0 === "check") return pageCheck();
    if (p0 === "paycheck") return pagePayCheck();
    return pageHome();
  } catch (e) {
    app.innerHTML = `<section class="wrap pub-wrap"><div class="card verify"><h1>We can't load this page</h1><p>${esc(e.message)}</p><p class="note">Check your internet connection and try again.</p><div><a class="btn" href="">Try again</a></div></div></section>`;
  }
}
window.addEventListener("hashchange", route);
route();
