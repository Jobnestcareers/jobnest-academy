const TRACKS = {
  ADM:{name:"Administrative Support"}, CSP:{name:"Customer Support"},
  DAT:{name:"Data Analysis"}, DMK:{name:"Digital Marketing"}
};
let COHORT = "Cohort 7 · Nov 2026";
const TOTAL_WEEKS = 17;
/* week indexes (0-based): project W8–9, internship W10–13, CV W14, Discovery Call W15, job search W16–17 */
const WK={proj:[7,8],int0:9,cv:13,dc:14,job:[15,16]};
/* Example students issued on Matriculation Day. Default password = surname. */
const STUDENTS = {
  "GEP/26A/005":{first:"Adaeze",surname:"Okafor",track:"DAT",email:"adaeze.okafor@example.com"},
  "GEP/26A/012":{first:"Ibrahim",surname:"Musa",track:"CSP",email:"ibrahim.musa@example.com"},
  "GEP/26A/027":{first:"Temitope",surname:"Adeyemi",track:"DMK",email:"temi.adeyemi@example.com"}
};
const PLACEMENT = {
  DAT:{org:"Brightpath Logistics Ltd",sup:"Mrs. Funmi Bello",role:"Data Analyst Intern"},
  CSP:{org:"ShopNaija Online",sup:"Mr. Chinedu Eze",role:"Customer Support Intern"},
  DMK:{org:"Glow & Co. Skincare",sup:"Ms. Kemi Lawal",role:"Digital Marketing Intern"},
  ADM:{org:"JobNest Operations",sup:"Mrs. Ngozi Obi",role:"Administrative Intern"}
};
const INTERN_WEEKS = 4; // Weeks 10–13

const L=(title,mins,points,intro)=>({type:"lesson",title,mins,points,intro});
const T=(title,detail,link)=>({type:"task",title,detail,link:!!link});

const TRACK_LESSONS = {
  ADM:[L("Calendar & inbox management",22,["Inbox zero with labels and filters","Scheduling across time zones","Writing meeting invites people actually read"],"How executive assistants keep a manager's week under control."),
       L("Business documents in Google Docs & Word",28,["Templates, styles and headings","Version history and suggestion mode","Meeting minutes that capture decisions and owners"],"Producing clean, consistent documents fast."),
       L("Spreadsheets for admins",30,["Sorting, filtering and data validation","Simple trackers with conditional formatting","Sharing permissions"],"The spreadsheet skills every admin role expects."),
       L("Travel, expenses & vendor coordination",20,["Itinerary building","Expense reports and receipts","Following up with vendors professionally"],"Handling the logistics that keep an office running.")],
  CSP:[L("Customer support fundamentals",20,["The support funnel: tiers and escalation","Tone: empathy without over-apologising","First-contact resolution"],"What great support looks like from the customer's side."),
       L("Working in a ticketing tool",30,["Ticket statuses, tags and priorities","Macros and saved replies","SLA timers"],"A guided walk through a help desk like Zendesk or Freshdesk."),
       L("Live chat & email etiquette",24,["Handling several chats at once","De-escalating an angry customer","Closing a conversation cleanly"],"Practical scripts for written support."),
       L("CX metrics: CSAT, FRT and NPS",18,["What each metric measures","How agents are scored","Reading a weekly support report"],"The numbers your team lead will watch.")],
  DAT:[L("Spreadsheet foundations for analysts",30,["Clean tables and data types","XLOOKUP, SUMIFS and COUNTIFS","Pivot tables"],"Excel and Google Sheets as an analyst uses them."),
       L("Cleaning messy data",32,["Duplicates, blanks and inconsistent text","Splitting and joining columns","Documenting your cleaning steps"],"Turning a raw export into something you can trust."),
       L("Charts that answer a question",26,["Choosing the right chart","Labelling and colour","One chart, one message"],"Visualising findings for non-technical managers."),
       L("Building a simple dashboard",34,["KPIs and filters","Dashboards in Looker Studio or Power BI","Presenting insights in five minutes"],"Bringing it together into a shareable report.")],
  DMK:[L("Marketing fundamentals & the funnel",20,["Awareness, consideration, conversion","Personas and positioning","Setting campaign goals"],"How digital marketing turns attention into customers."),
       L("Content creation with Canva",30,["Brand kits and templates","Carousel and reel formats","Writing captions that convert"],"Producing on-brand content quickly."),
       L("Social media management",26,["Content calendars","Scheduling tools","Community replies and moderation"],"Running a brand page day to day."),
       L("Paid ads & analytics basics",30,["Meta Ads Manager structure","Budgets and audiences","Reading campaign results"],"Launching and measuring a small paid campaign.")]
};
const TRACK_WEEK_TITLES = {
  ADM:["Calendar & Inbox Management","Business Documents","Spreadsheets for Admins","Travel, Expenses & Vendors"],
  CSP:["Support Fundamentals","Ticketing Tools","Live Chat & Email Etiquette","CX Metrics"],
  DAT:["Spreadsheet Foundations","Cleaning Messy Data","Charts That Answer Questions","Building a Dashboard"],
  DMK:["Marketing Fundamentals","Content Creation with Canva","Social Media Management","Paid Ads & Analytics"]
};
const PROJECT_BRIEF = {
  ADM:"Plan a 2-day partner visit for a Lagos fintech: itinerary, travel bookings tracker, and a meeting pack.",
  CSP:"Set up a mock support ticketing workflow for an online store: categories, macros, escalation rules and SLA targets.",
  DAT:"Clean and analyse a messy 3,000-row sales dataset and present three findings in a one-page dashboard.",
  DMK:"Execute a two-week campaign brief for a small skincare brand: content calendar, 6 assets and a results report."
};

const STAGES = [
  {title:"Orientation", welcome:true},
  {title:"The Fundamentals",
   objective:"Establish core professional etiquette, digital workspace habits, and a workplace productivity baseline.",
   activities:"Professional communication, remote work etiquette, file organisation, time management, basic task tracking.",
   outputs:"Workplace Readiness Quiz and setup of a clean digital workspace.",
   facilitators:"Operations Specialists, resource libraries, guided video modules."},
  {title:"Core Skill Learning",
   objective:"Build track-specific technical and digital competencies aligned with market demands.",
   activities:"Hands-on software tutorials, pre-recorded masterclasses and guided exercises.",
   outputs:"Module assignments, quizzes and a technical competency check.",
   facilitators:"Domain Experts, pre-recorded masterclasses, documentation guides."},
  {title:"Client Project / Practical",
   objective:"Apply learned skills to real-world client scenarios in collaborative team projects.",
   activities:"Each learner solves a real business case on their own, guided by a project supervisor.",
   outputs:"Project plan, final project, self-review and supervisor grading.",
   facilitators:"Project Supervisors, scenario briefs, rubric grading templates."},
  {title:"Internship / Work Experience",
   objective:"Gain verified work history inside partner organisations or internal JobNest projects.",
   activities:"Live tasks, team stand-ups and managing deliverables under supervision.",
   outputs:"Weekly logbook, supervisor evaluation, internship certificate and verified work for your portfolio.",
   facilitators:"Host supervisors, Project Leads, performance scorecards."},
  {title:"CV, LinkedIn & Portfolio",
   objective:"Package new skills, projects and experience into ATS-optimised professional assets.",
   activities:"Resume revamp, LinkedIn makeover and portfolio curation on Canva or Notion.",
   outputs:"ATS-compliant resume, optimised LinkedIn profile, published portfolio.",
   facilitators:"Talent Acquisition Specialists, CV writers, portfolio templates."},
  {title:"Discovery Call 2",
   objective:"Review portfolio readiness, test interview preparedness and finalise your job search strategy.",
   activities:"Mock interview, pitch refinement and job market strategy (1-on-1).",
   outputs:"Interview Confidence Score and a Job Search Action Plan.",
   facilitators:"Career Mentors, interviewers, feedback rubrics."},
  {title:"Job Search & Personal Pitch",
   objective:"Run an active, high-conversion job search with networking and a polished personal pitch.",
   activities:"Cold outreach, job boards, LinkedIn networking, elevator pitch, interview follow-up.",
   outputs:"Weekly application tracker, outreach logs and interview invitations.",
   facilitators:"Job Search Coaches, outreach templates, tracking dashboards."}
];

const QUIZ_READINESS = {type:"quiz",title:"Workplace Readiness Quiz",pass:70,qs:[
  {q:"A client emails a question you can't answer yet. What should you do first?",o:["Wait until you have the full answer","Acknowledge the email and give a time you'll reply by","Forward it to your manager without comment","Reply on WhatsApp instead"],a:1},
  {q:"Which file name follows good practice?",o:["final final.docx","report-new(2).docx","2026-11-04_AcmeCo_Onboarding-Guide_v2.docx","Untitled document"],a:2},
  {q:"In a remote team meeting you are not presenting. Best practice is to:",o:["Keep your mic on so people know you're there","Mute and use the raise-hand feature to speak","Turn your camera off and step away","Type everything in the chat"],a:1},
  {q:"In the Eisenhower matrix, a task that is important but not urgent should be:",o:["Done immediately","Delegated","Scheduled","Deleted"],a:2},
  {q:"A Trello card for a deliverable should always have:",o:["A colourful cover image","A due date and a clear owner","At least ten checklist items","A long description of the client"],a:1}]};

/* The programme, week by week. stage = index into STAGES. */
function _buildWeeks(track){
  const tl=TRACK_LESSONS[track], tt=TRACK_WEEK_TITLES[track], pl=PLACEMENT[track];
  const W=(stage,title,items)=>({stage,title,items});
  return [
  W(0,"Welcome & Orientation",[{type:"guide",title:"How to navigate the platform"},{type:"oath",title:"Read & sign the Student Oath"},
     T("Read the Student Handbook","Attendance rules, grading, code of conduct and how to get help."),
     T("Join your cohort community","Introduce yourself: your name, track and one goal for the programme.")]),
  W(1,"Communication & Remote Work",[
     L("Professional communication",18,["Write subject lines that state the ask","Keep emails to one topic and a clear next step","Reply within one working day, even if only to acknowledge","Match formality to the channel: email vs Slack vs WhatsApp"],"How to write and speak so managers and clients trust you."),
     L("Remote work etiquette",15,["Camera on for team meetings unless agreed otherwise","Mute when not speaking; use the raise-hand feature","Update your status when away","Overcommunicate progress and blockers"],"The unwritten rules of working from home with a distributed team."),
     L("File organisation in Google Drive & OneDrive",20,["One top-level folder per client or project","Name files YYYY-MM-DD_Project_Description_v1","Share with links and the right permission level","Never keep work only on your desktop"],"Build a folder system anyone on your team can navigate.")]),
  W(1,"Productivity & Workplace Readiness",[
     L("Time management",16,["Time-block deep work in your calendar","Use the Eisenhower matrix to triage","Estimate tasks, then compare with actual time","Protect a daily shutdown routine"],"Plan your day so deadlines stop surprising you."),
     L("Task tracking with Trello & Notion",22,["Boards with To do, Doing, Review, Done","One card per deliverable with a due date and owner","Checklists for repeatable work","Weekly review of your board"],"Set up a simple system to track every task you own."),
     QUIZ_READINESS,
     {...T("Week project: set up your clean digital workspace","Create your Drive/OneDrive folder structure and a Trello or Notion board. Paste a share link for review.",true),proj:true}]),
  W(2,tt[0],[tl[0],{...T("Week project: "+tt[0],"Complete this week's guided exercise from the masterclass and share a link to your work. Your facilitator grades it with the rubric.",true),proj:true}]),
  W(2,tt[1],[tl[1],{...T("Week project: "+tt[1],"Complete this week's guided exercise from the masterclass and share a link to your work. Your facilitator grades it with the rubric.",true),proj:true}]),
  W(2,tt[2],[tl[2],{...T("Week project: "+tt[2],"Complete this week's guided exercise from the masterclass and share a link to your work. Your facilitator grades it with the rubric.",true),proj:true}]),
  W(2,tt[3],[tl[3],{...T("Week project: module assignment","Bring this month's skills together in the module assignment and submit a link to your work.",true),proj:true},
     T("Technical competency check","A 30-minute practical check with a Domain Expert.")]),
  W(3,"Project: Plan & Build",[T("Read your project brief",PROJECT_BRIEF[track]),
     {...T("Submit your project plan","Share your plan: what you'll deliver, the steps you'll take and your timeline.",true),proj:true},
     T("Check-in with your project supervisor","A 20-minute call to review your plan and early progress.")]),
  W(3,"Project: Delivery",[{...T("Submit your final project","Share a link to your finished project.",true),proj:true},
     T("Self-review against the rubric","Score your own work honestly with the rubric before your supervisor grades it."),
     T("Supervisor grading","Your project supervisor grades your project against the rubric.")]),
  W(4,"Internship · Week 1",[T("Confirm your placement",`Accept your placement at ${pl.org} and meet your supervisor, ${pl.sup}.`),{type:"logweek",wk:1,title:"Logbook entry · Week 1"}]),
  W(4,"Internship · Week 2",[{type:"logweek",wk:2,title:"Logbook entry · Week 2"}]),
  W(4,"Internship · Week 3",[{type:"logweek",wk:3,title:"Logbook entry · Week 3"}]),
  W(4,"Internship · Week 4",[{type:"logweek",wk:4,title:"Logbook entry · Week 4"},
     T("Supervisor performance evaluation","Your supervisor completes your performance scorecard."),
     T("Collect your internship certificate","Issued once your logbook and evaluation are complete.")]),
  W(5,"CV, LinkedIn & Portfolio",[T("ATS-compliant resume","Rebuild your CV with the template and submit for review.",true),
     T("LinkedIn profile makeover","Headline, About section and Featured projects. Share your profile URL.",true),
     T("Publish your portfolio","Curate your project and internship work on Canva or Notion.",true)]),
  W(6,"Discovery Call 2",[T("Book your 1-on-1 session","Pick a slot with your Career Mentor."),
     T("Mock interview simulation","A 40-minute interview with feedback against the rubric."),
     T("Finalise your Job Search Action Plan","Target roles, companies and weekly application goals.",true)]),
  W(7,"Personal Pitch & Outreach",[T("Record your elevator pitch","A 60-second video introducing yourself. Share the link.",true),
     T("Send 10 cold outreach messages","Use the templates and log each one.")]),
  W(7,"Applications & Interviews",[T("Weekly job application tracker","Submit your tracker every Friday.",true),
     T("Report your first interview invite","Tell your coach so they can help you prepare.")])
  ];
}

/* Sample weekly quiz built from the week's lessons */
const BAD_PRACTICE=["Wait until the deadline before sharing any progress","Keep important work only on your personal laptop","Skip checking your work before you send it","Avoid asking questions so you look confident","Reply to messages only when it suits you","Copy a classmate's work and change a few words"];
function weekQuiz(wi,wk){const qs=[];let b=wi;
  wk.items.filter(x=>x.type==="lesson").forEach(l=>l.points.slice(0,l.points.length>3?2:3).forEach(pt=>{const a=(qs.length+wi)%4,o=[];for(let k=0;k<4;k++)o.push(k===a?pt:BAD_PRACTICE[(b++)%BAD_PRACTICE.length]);qs.push({q:`Which of these is good practice from “${l.title}”?`,o,a})}));
  return {type:"quiz",title:`Week ${wi+1} assessment`,pass:70,qs:qs.slice(0,5)}}
/* Week objectives, resources and optional extras (sample content) */
const _wkCache={};
function buildWeeks(track){
  if(_wkCache[track])return _wkCache[track];
  const ws=_buildWeeks(track), tl=TRACK_LESSONS[track];
  const OBJ={
    1:["Write clear, professional emails and messages","Follow remote meeting etiquette","Organise your files in Google Drive or OneDrive"],
    2:["Plan your week with time-blocking","Track your tasks on a Trello or Notion board","Pass the Workplace Readiness Quiz"],
    7:["Understand your client's brief","Plan your project with clear steps and a timeline","Get early feedback from your project supervisor"],
    8:["Deliver complete, professional work","Review your own work against the rubric","Reflect on what you'd do differently"],
    13:["Rebuild your CV so it passes ATS filters","Rewrite your LinkedIn headline and About section","Publish a portfolio of your best work"],
    14:["Complete a full mock interview","Sharpen your personal pitch","Leave with a job search action plan"],
    15:["Deliver a confident 60-second pitch","Write cold outreach that gets replies","Network on LinkedIn with purpose"],
    16:["Apply consistently and track every application","Prepare for and follow up after interviews","Keep your momentum after the programme"]};
  [3,4,5,6].forEach((w,i)=>OBJ[w]=tl[i].points);
  [9,10,11,12].forEach(w=>OBJ[w]=["Work on live tasks under supervision","Attend stand-ups and report progress clearly","Record your week accurately in your logbook"]);
  const EXTRA_RES={1:["Email templates pack","DOC"],2:["Trello board template","Template"],3:["Practice workbook","XLSX"],4:["Practice workbook","XLSX"],5:["Practice workbook","XLSX"],6:["Module assignment brief","PDF"],7:["Scenario brief & rubric","PDF"],13:["ATS CV template","DOC"],14:["Interview question bank","PDF"],15:["Cold outreach templates","DOC"]};
  ws.forEach((w,i)=>{if(i===0)return;w.objectives=OBJ[i];w.resources=[[`Week ${i+1} slides`,"PDF"],["Kickoff session recording","Video"],...(EXTRA_RES[i]?[EXTRA_RES[i]]:[])]});
  ws[0].items.forEach(it=>{if(it.title==="Join your cohort community")it.opt=true});
  ws[1].items.push(weekQuiz(1,ws[1]),{...T("Week project: rewrite a messy email","Rewrite the sample email from the Professional communication lesson so it's clear and professional. Share a link. Your facilitator grades it with the rubric.",true),proj:true});
  [3,4,5,6].forEach(w=>ws[w].items.splice(1,0,weekQuiz(w,ws[w])));
  [3,4,5,6].forEach(w=>ws[w].items.push({...T("Stretch challenge","A harder extra exercise for learners who want to go further. Share a link to your work.",true),opt:true}));
  ws[13].items.push({...T("CV swap with a pod member","Swap CVs with someone in your pod and give feedback using the checklist."),opt:true});
  return _wkCache[track]=ws;
}
