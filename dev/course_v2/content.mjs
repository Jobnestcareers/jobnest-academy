// Jobnest Academy programme v2 (Programme & Grading Policy, Oct 2026): 20 weeks, 8 stages, 3 tracks.
// DRAFT content for the Academy team to approve. Edit here, then run: node dev/course_v2/build.mjs

export const TRACKS = {
  BOP: { name: "Business Operations", roles: ["Operations Assistant", "Project Coordinator", "Executive / Virtual Assistant", "Admin Officer"] },
  PTA: { name: "People & Talent", roles: ["Recruitment Coordinator", "HR Assistant", "Talent Sourcer"] },
  CSG: { name: "Customer Success & Growth", roles: ["Customer Success Associate", "Sales Development Rep", "CRM Assistant", "Customer Support"] },
};

// Stage indexes are used across the app: 0 orientation, 1 fundamentals, 2 core, 3 exams, 4 project, 5 internship, 6 CV, 7 job search.
export const STAGES = [
  { title: "Orientation", welcome: true },
  { title: "Fundamental Learning",
    objective: "Build the professional habits every role expects: clear communication, remote work, organised files and managing your time.",
    activities: "Professional communication, remote work etiquette, file organisation, time management, task tracking.",
    outputs: "Two weekly assessments and two week projects.",
    facilitators: "Operations Specialists, resource libraries, guided video modules." },
  { title: "Core Skill Learning and Development",
    objective: "Build the track-specific skills employers hire for, through practical, hands-on training.",
    activities: "Software walkthroughs, masterclasses, guided exercises and a weekly practical task.",
    outputs: "Eight weekly assessments, weekly practical tasks and a technical competency check.",
    facilitators: "Domain Experts, pre-recorded masterclasses, documentation guides." },
  { title: "Examination Period",
    objective: "Show what you've learned in two timed examinations.",
    activities: "The Fundamental Examination (Monday or Tuesday) and the Core Skill Learning Examination for your track (Wednesday, Thursday or Friday).",
    outputs: "Fundamental Examination (30 questions, 30 minutes) and Core Skill Learning Examination (40 questions, 45 minutes).",
    facilitators: "Examinations Officer, Cohort Manager." },
  { title: "Practical Project",
    objective: "Apply your skills to a real business case and show your problem-solving.",
    activities: "Each learner solves a business case on their own, guided by a project supervisor.",
    outputs: "Project plan, final project and self-review. The final project is graded out of 100 against the rubric.",
    facilitators: "Project Supervisors, scenario briefs, rubric grading templates." },
  { title: "Internship",
    objective: "Gain real work experience inside a partner organisation or an internal Jobnest project.",
    activities: "Live tasks, team stand-ups and managing deliverables under supervision.",
    outputs: "Weekly logbook, supervisor evaluation and an internship certificate.",
    facilitators: "Host supervisors, Project Leads, performance scorecards." },
  { title: "CV and Portfolio Development",
    objective: "Package your skills, project and internship into a professional CV and portfolio.",
    activities: "CV rebuild, LinkedIn makeover and portfolio curation on Canva or Notion.",
    outputs: "ATS-compliant CV, optimised LinkedIn profile, published portfolio.",
    facilitators: "Talent Acquisition Specialists, CV writers, portfolio templates." },
  { title: "Discovery Call, Job Search and Pitching",
    objective: "Find out where you stand after the course in a Discovery Call with a Career Coach, then run a focused job search with a strong pitch.",
    activities: "Discovery Call (a 40-minute 1-on-1 review of your progress, CV and portfolio, with a short mock interview), role matching, elevator pitch, cold outreach, applications.",
    outputs: "Interview Confidence Score, Job Search Action Plan, recorded pitch, outreach log and application tracker.",
    facilitators: "Career Coaches, interviewers, outreach templates." },
];

const L = (title, mins, points, intro) => ({ type: "lesson", title, mins, points, intro });

// Eight core weeks per track (programme Weeks 4–11). Each: title, lesson(s), week task brief.
export const CORE = {
  BOP: [
    { title: "Calendar & Inbox Management",
      lessons: [L("Calendar & inbox management", 22, ["Inbox zero with labels and filters", "Scheduling across time zones", "Writing meeting invites people actually read", "Protecting your manager's focus time"], "How executive assistants keep a manager's week under control.")],
      task: "Set up a labelled inbox and a colour-coded week for a fictional manager. Share screenshots or a document showing your labels, filters and calendar." },
    { title: "Business Documents",
      lessons: [L("Business documents in Google Docs & Word", 28, ["Templates, styles and headings", "Version history and suggestion mode", "Meeting minutes that capture decisions and owners", "File names and sharing settings"], "Producing clean, consistent documents fast.")],
      task: "Turn the sample meeting recording notes into one page of minutes with decisions, owners and due dates. Share a link." },
    { title: "Spreadsheets for Operations",
      lessons: [L("Spreadsheets for operations", 30, ["Sorting, filtering and data validation", "Trackers with conditional formatting", "SUMIF, COUNTIF and simple totals", "Sharing permissions"], "The spreadsheet skills every operations role expects.")],
      task: "Build an office supplies tracker with dropdowns, a low-stock highlight and a monthly total. Share a view link." },
    { title: "Travel, Expenses & Vendors",
      lessons: [L("Travel, expenses & vendor coordination", 20, ["Building a clear itinerary", "Expense reports and receipts", "Comparing vendor quotes fairly", "Following up with vendors professionally"], "Handling the logistics that keep an office running.")],
      task: "Plan a 2-day Abuja trip for your manager: itinerary, estimated budget and a vendor comparison for the hotel. Share a link." },
    { title: "Project Coordination Basics",
      lessons: [L("Coordinating a project", 26, ["Breaking a project into tasks and milestones", "Simple timelines and Gantt views", "Who does what: the RACI chart", "Weekly status reports that flag risks early"], "The everyday work of a project coordinator, from kickoff to close.")],
      task: "Create a task plan and timeline for an office relocation in Trello, Asana or a sheet, plus a one-paragraph status report. Share a link." },
    { title: "Processes & SOPs",
      lessons: [L("Mapping processes and writing SOPs", 24, ["Mapping a process step by step", "Writing a standard operating procedure", "Checklists for repeatable work", "Spotting bottlenecks and small improvements"], "How operations teams make work repeatable and reliable.")],
      task: "Write a one-page SOP for onboarding a new office supplier, with a simple process map. Share a link." },
    { title: "Executive & Virtual Assistance",
      lessons: [L("Supporting an executive remotely", 24, ["Daily and weekly check-ins with your executive", "Prioritising competing requests", "Confidentiality and handling sensitive information", "Delegation tools: Asana, ClickUp and shared inboxes"], "What great executive and virtual assistants do differently.")],
      task: "Prepare a weekly briefing pack for an executive: priorities, meetings, decisions needed and follow-ups. Share a link." },
    { title: "Office Administration & Records",
      lessons: [L("Records, procurement and petty cash", 24, ["Organising records so anyone can find them", "Simple procurement: request, quote, approve, pay", "Recording petty cash and reconciling it", "Keeping personal data safe (NDPA basics)"], "The admin systems that keep a small organisation compliant and organised.")],
      task: "Set up a records folder structure and a petty cash log for one month, with a short reconciliation note. Share a link." },
  ],
  PTA: [
    { title: "The Recruitment Lifecycle",
      lessons: [L("How hiring works", 22, ["The stages: need, job description, sourcing, screening, interview, offer, onboarding", "Who's involved: hiring manager, recruiter, coordinator", "What a recruitment coordinator owns day to day", "Candidate experience and why it matters"], "A walk through the full hiring process and where you fit in it.")],
      task: "Draw the recruitment lifecycle for a junior accountant role at a Lagos SME, with the owner and a target time for each stage. Share a link." },
    { title: "Job Descriptions & Job Ads",
      lessons: [L("Writing job descriptions and job ads", 24, ["The parts of a job description", "Must-haves versus nice-to-haves", "Inclusive, clear wording", "Turning a job description into an ad that attracts applicants"], "Writing roles so the right people apply.")],
      task: "Write a job description and a short job ad for a Customer Service Officer at a fintech. Share a link." },
    { title: "Sourcing Candidates",
      lessons: [L("Finding candidates", 28, ["Where to source: job boards, LinkedIn, referrals, communities", "Boolean search with AND, OR, NOT and quotes", "Writing a short, personal outreach message", "Tracking candidates in a sourcing sheet"], "How talent sourcers find and approach good candidates.")],
      task: "Build a Boolean search string and a sourcing sheet with 15 suitable LinkedIn profiles (names only, no personal contact details), plus one outreach message. Share a link." },
    { title: "Screening & Shortlisting",
      lessons: [L("Screening CVs and phone screens", 26, ["Screening CVs against the must-haves", "Running a 15-minute phone screen", "Using a scorecard so decisions are fair", "Writing a shortlist summary for the hiring manager"], "Turning a pile of applications into a strong shortlist.")],
      task: "Screen the 8 sample CVs with a scorecard and write a shortlist summary of your top 3. Share a link." },
    { title: "Interviews & Candidate Experience",
      lessons: [L("Coordinating interviews", 24, ["Scheduling interviews across several diaries", "Using an applicant tracking system (ATS)", "Preparing interview packs and question sets", "Keeping every candidate informed, including rejections"], "Running an interview process candidates speak well of.")],
      task: "Draft an interview schedule for 4 candidates and 3 interviewers, plus invitation and rejection emails. Share a link." },
    { title: "Onboarding & HR Administration",
      lessons: [L("Offers, onboarding and employee records", 24, ["Offer letters and what they include", "Pre-start and first-week onboarding checklists", "Setting up employee records", "Probation reviews and reminders"], "The HR admin that turns a new hire into a productive employee.")],
      task: "Create an onboarding checklist for a new hire's first two weeks and a draft offer letter template. Share a link." },
    { title: "HR Policies, Employment Basics & Data Privacy",
      lessons: [L("HR policies and handling people data", 24, ["Common HR policies: leave, conduct, grievance", "Employment basics in Nigeria: contracts, notice, leave", "Handling employee data under the NDPA", "Confidentiality and when to escalate to HR leadership"], "The policy and privacy basics every HR assistant must know. Always check specifics with your HR lead or a legal adviser.")],
      task: "Summarise a sample leave policy into a one-page FAQ for staff, and list 5 rules for handling employee data safely. Share a link." },
    { title: "HR Metrics & Reporting",
      lessons: [L("Measuring hiring and people data", 26, ["Time to hire and time to fill", "Cost per hire and source of hire", "Offer acceptance and early turnover", "A simple monthly HR report in Sheets or Excel"], "The numbers HR and recruitment leaders watch, and how to report them.")],
      task: "Use the sample hiring data to build a one-page monthly recruitment report with 4 metrics and one chart. Share a link." },
  ],
  CSG: [
    { title: "Support Fundamentals",
      lessons: [L("Customer support fundamentals", 20, ["The support funnel: tiers and escalation", "Tone: empathy without over-apologising", "First-contact resolution", "Knowing when to escalate"], "What great support looks like from the customer's side.")],
      task: "Rewrite 3 sample replies to angry customers so they are empathetic, clear and solve the problem. Share a link." },
    { title: "Ticketing Tools",
      lessons: [L("Working in a ticketing tool", 30, ["Ticket statuses, tags and priorities", "Macros and saved replies", "SLA timers", "Internal notes versus public replies"], "A guided walk through a help desk like Zendesk or Freshdesk.")],
      task: "Set up ticket categories, 5 macros and a priority guide for an online store. Share a link or screenshots." },
    { title: "Live Chat & Email Etiquette",
      lessons: [L("Live chat & email etiquette", 24, ["Handling several chats at once", "De-escalating an angry customer", "Closing a conversation cleanly", "Writing for mobile readers"], "Practical scripts for written support.")],
      task: "Write a live chat script for a delayed-delivery complaint, from greeting to close. Share a link." },
    { title: "CX Metrics",
      lessons: [L("CX metrics: CSAT, FRT and NPS", 18, ["What each metric measures", "How agents are scored", "Reading a weekly support report", "Turning numbers into improvements"], "The numbers your team lead will watch.")],
      task: "Read the sample weekly support report and write 3 findings and 3 actions. Share a link." },
    { title: "Customer Success & Onboarding",
      lessons: [L("Helping customers succeed", 24, ["Support versus customer success", "Onboarding a new customer step by step", "Customer health scores and warning signs", "Check-ins and business reviews"], "How customer success teams keep customers happy and renewing.")],
      task: "Design a 30-day onboarding plan for a new business customer of a payroll app, with check-in points. Share a link." },
    { title: "CRM Management",
      lessons: [L("Working in a CRM", 28, ["Contacts, companies, deals and activities", "Pipelines and deal stages", "Keeping records clean: duplicates and required fields", "Simple CRM reports and dashboards"], "Using HubSpot, Zoho or Salesforce the way a CRM assistant does.")],
      task: "Clean the sample contact list (duplicates, missing fields, formats) and set up a 5-stage sales pipeline in a free CRM or a sheet. Share a link." },
    { title: "Sales Development & Prospecting",
      lessons: [L("Prospecting and booking meetings", 26, ["The ideal customer profile (ICP)", "Building a prospect list", "Cold email and call structure", "Handling common objections"], "The daily work of a sales development rep.")],
      task: "Define an ICP for a B2B logistics app, build a list of 15 target companies, and write a 3-step cold email sequence. Share a link." },
    { title: "Retention, Upsell & Growth Reporting",
      lessons: [L("Keeping and growing customers", 24, ["Why customers churn and how to spot it", "Renewals and upsell signals", "Collecting and using customer feedback", "A monthly growth report: churn, retention and revenue"], "How customer-facing teams grow revenue from existing customers.")],
      task: "Using the sample account data, flag 5 at-risk customers, suggest an action for each, and summarise churn and retention for the month. Share a link." },
  ],
};

export const PROJECT_BRIEF = {
  BOP: "Plan a 2-day partner visit for a Lagos fintech: itinerary, travel and budget tracker, meeting pack, vendor comparison and a short SOP for the next visit.",
  PTA: "Run a mock hiring campaign for a Customer Service Officer at a growing fintech: job description and ad, sourcing plan, screening scorecard, interview schedule and an onboarding checklist.",
  CSG: "Set up a customer support and success workflow for an online store: ticket categories and macros, escalation rules, SLA targets, an onboarding email sequence and a monthly CX report.",
};

export const PLACEMENT = {
  BOP: { org: "JobNest Operations", sup: "your host supervisor", role: "Operations Intern" },
  PTA: { org: "JobNest Recruit", sup: "your host supervisor", role: "Recruitment & HR Intern" },
  CSG: { org: "a partner company", sup: "your host supervisor", role: "Customer Success Intern" },
};

const T = (title, detail, link) => ({ type: "task", title, detail, link: !!link });
const Q = (title) => ({ type: "quiz", title });
const W = (stage, title, items, objectives) => ({ stage, title, items, objectives });

// The 20 weeks for one track. Each week's items get keys w{week}-{n} in this order.
export function buildWeeks(track) {
  const core = CORE[track], pl = PLACEMENT[track];
  const weeks = [
    W(0, "Welcome & Orientation", [{ type: "guide", title: "How to navigate the platform" }, { type: "oath", title: "Read & sign the Student Oath" },
      T("Read the Student Handbook", "Attendance rules, assessments, examinations, grading, code of conduct and how to get help."),
      { ...T("Join your cohort community", "Introduce yourself: your name, track and one goal for the programme."), opt: true }]),
    W(1, "Communication & Remote Work", [
      L("Professional communication", 18, ["Write subject lines that state the ask", "Keep emails to one topic and a clear next step", "Reply within one working day, even if only to acknowledge", "Match formality to the channel: email vs Slack vs WhatsApp"], "How to write and speak so managers and clients trust you."),
      L("Remote work etiquette", 15, ["Camera on for team meetings unless agreed otherwise", "Mute when not speaking; use the raise-hand feature", "Update your status when away", "Overcommunicate progress and blockers"], "The unwritten rules of working from home with a distributed team."),
      L("File organisation in Google Drive & OneDrive", 20, ["One top-level folder per client or project", "Name files YYYY-MM-DD_Project_Description_v1", "Share with links and the right permission level", "Never keep work only on your desktop"], "Build a folder system anyone on your team can navigate."),
      Q("Assessment 1 · Communication & Remote Work"),
      { ...T("Week project: rewrite a messy email", "Rewrite the sample email from the Professional communication lesson so it's clear and professional. Share a link. Your facilitator gives feedback.", true), proj: true }],
      ["Write clear, professional emails and messages", "Follow remote meeting etiquette", "Organise your files in Google Drive or OneDrive"]),
    W(1, "Productivity & Workplace Readiness", [
      L("Time management", 16, ["Time-block deep work in your calendar", "Use the Eisenhower matrix to triage", "Estimate tasks, then compare with actual time", "Protect a daily shutdown routine"], "Plan your day so deadlines stop surprising you."),
      L("Task tracking with Trello & Notion", 22, ["Boards with To do, Doing, Review, Done", "One card per deliverable with a due date and owner", "Checklists for repeatable work", "Weekly review of your board"], "Set up a simple system to track every task you own."),
      Q("Assessment 2 · Workplace Readiness"),
      { ...T("Week project: set up your clean digital workspace", "Create your Drive/OneDrive folder structure and a Trello or Notion board. Paste a share link for review.", true), proj: true }],
      ["Plan your week with time-blocking", "Track your tasks on a Trello or Notion board", "Show workplace readiness in Assessment 2"]),
  ];
  core.forEach((c, i) => {
    const n = i + 3, items = [...c.lessons, Q(`Assessment ${n} · ${c.title}`),
      { ...T(`Week task: ${c.title}`, c.task + " Your facilitator gives feedback using the rubric.", true), proj: true }];
    if (i === core.length - 1) items.push(T("Technical competency check", "A 30-minute practical check with a Domain Expert before the examinations."));
    items.push({ ...T("Stretch challenge", "A harder extra exercise for learners who want to go further. Share a link to your work.", true), opt: true });
    weeks.push(W(2, c.title, items, c.lessons[0].points.slice(0, 3)));
  });
  weeks.push(W(3, "Examinations", [
    T("Read the examination rules", "When and where you sit each paper, the time limits, and what happens if you miss one."),
    { type: "exam", paper: "fund", title: "Fundamental Examination" },
    { type: "exam", paper: "core", title: "Core Skill Learning Examination" }],
    ["Sit the Fundamental Examination on your scheduled day", "Sit the Core Skill Learning Examination for your track", "Know how your exam score counts towards your final grade"]));
  weeks.push(W(4, "Project: Plan & Build", [T("Read your project brief", PROJECT_BRIEF[track]),
    { ...T("Submit your project plan", "Share your plan: what you'll deliver, the steps you'll take and your timeline.", true), proj: true },
    T("Check-in with your project supervisor", "A 20-minute call to review your plan and early progress.")],
    ["Understand your client's brief", "Plan your project with clear steps and a timeline", "Get early feedback from your project supervisor"]));
  weeks.push(W(4, "Project: Delivery", [{ ...T("Submit your final project", "Share a link to your finished project. It is graded out of 100 against the project rubric.", true), proj: true, final: true },
    T("Self-review against the rubric", "Score your own work honestly with the rubric before your supervisor grades it."),
    T("Supervisor grading", "Your project supervisor grades your project against the rubric.")],
    ["Deliver complete, professional work", "Review your own work against the rubric", "Reflect on what you'd do differently"]));
  for (let k = 1; k <= 4; k++) {
    const items = [{ type: "logweek", wk: k, title: `Logbook entry · Week ${k}` }];
    if (k === 1) items.unshift(T("Confirm your placement", `Accept your placement (${pl.role}) and meet ${pl.sup}.`));
    if (k === 4) items.push(T("Supervisor performance evaluation", "Your supervisor completes your performance scorecard."), T("Collect your internship certificate", "Issued once your logbook and evaluation are complete."));
    weeks.push(W(5, `Internship · Week ${k}`, items, ["Work on live tasks under supervision", "Attend stand-ups and report progress clearly", "Record your week accurately in your logbook"]));
  }
  weeks.push(W(6, "CV, LinkedIn & Portfolio", [T("ATS-compliant resume", "Rebuild your CV with the template and submit for review.", true),
    T("LinkedIn profile makeover", "Headline, About section and Featured projects. Share your profile URL.", true),
    T("Publish your portfolio", "Curate your project and internship work on Canva or Notion.", true),
    { ...T("CV swap with a pod member", "Swap CVs with someone in your pod and give feedback using the checklist."), opt: true }],
    ["Rebuild your CV so it passes ATS filters", "Rewrite your LinkedIn headline and About section", "Publish a portfolio of your best work"]));
  // Steps open in order inside a week. Booking the Discovery Call comes first; the call itself (marked by the coach) comes after the
  // learner's own job-search steps, so nobody waits on the coach's diary to keep going.
  weeks.push(W(7, "Discovery Call, Job Search & Pitching", [T("Book your Discovery Call", "Your Discovery Call is a 40-minute 1-on-1 with a Career Coach after the course. Pick a time on this week's page."),
    T("Record your elevator pitch", "A 60-second video introducing yourself. Share the link.", true),
    T("Send 10 cold outreach messages", "Use the templates and log each one."),
    T("Weekly job application tracker", "Log your applications and submit your tracker by Sunday at 18:00.", true),
    { ...T("Report your first interview invite", "Tell your coach so they can help you prepare."), opt: true },
    T("Have your Discovery Call", "Your coach reviews where you are now after the course: your results, CV and portfolio. You do a short mock interview and agree your next steps. Your coach marks this after the call."),
    T("Finalise your Job Search Action Plan", "Write up what you agreed in your Discovery Call: target roles, companies and weekly application goals.", true)],
    ["Know where you stand after the course, from your Discovery Call", "Deliver a confident 60-second pitch", "Apply consistently and track every application"]));
  const RES = { 1: ["Email templates pack", "DOC"], 2: ["Trello board template", "Template"], 11: ["Exam timetable and rules", "PDF"], 12: ["Project brief & rubric", "PDF"], 18: ["ATS CV template", "DOC"], 19: ["Interview question bank", "PDF"] };
  weeks.forEach((w, i) => {
    if (i === 0) return;
    w.resources = [[`Week ${i + 1} slides`, "PDF"], ["Kickoff session recording", "Video"], ...(RES[i] ? [RES[i]] : w.stage === 2 ? [["Practice workbook", "XLSX"]] : [])];
  });
  if (weeks.length !== 20) throw new Error("expected 20 weeks, got " + weeks.length);
  return weeks;
}
