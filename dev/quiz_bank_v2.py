# Question banks for programme v2 (20 weeks, 3 tracks). DRAFT for the Academy team to approve.
# Format: (question, [correct answer, wrong, wrong, wrong]). Options are shuffled per question when built.
# Weekly assessments draw 5 questions per learner (one attempt, no resits).
# Fundamental Examination draws 30 from "exam-fund". Core Skill Learning Examination draws 40 from "exam-core".
# Run: python3 dev/quiz_bank_v2.py  -> writes supabase/28c_question_banks.sql
# No semicolons in any text: the Supabase SQL editor splits on them.

from quiz_bank import SHARED, TRACK as OLD

NEW = {
"BOP": {
 "w8-2": [  # Project coordination basics
  ("A milestone in a project plan is:", ["A key checkpoint that marks a stage is complete", "A task that takes one day", "A meeting with the client", "The project budget"]),
  ("In a RACI chart, the person who is Accountable:", ["Owns the final decision and signs off the work", "Does all the work alone", "Is only kept informed", "Has no role in the task"]),
  ("A Gantt chart mainly shows:", ["Tasks laid out against time, with start and end dates", "How much each person is paid", "The company's org chart", "Customer complaints by week"]),
  ("Your weekly status report should lead with:", ["Overall status, key progress and risks that need a decision", "A full list of every email you sent", "Personal opinions about teammates", "Nothing, since status reports are optional"]),
  ("A task depends on another task finishing first. This is called a:", ["Dependency", "Milestone", "Deliverable", "Stakeholder"]),
  ("You notice a supplier delay will push the project back a week. You should:", ["Flag the risk early with its impact and options", "Wait and hope it resolves", "Quietly change the deadline", "Blame the supplier in the team chat"]),
  ("Breaking a big project into smaller tasks helps you:", ["Estimate time, assign owners and track progress", "Avoid planning", "Make the project look bigger", "Skip the deadline"]),
  ("A project kickoff meeting is mainly for:", ["Agreeing goals, scope, roles and timelines", "Celebrating the end of the project", "Reviewing last year's accounts", "Hiring new staff"]),
  ("Scope creep means:", ["Extra work keeps being added beyond what was agreed", "The project finishes early", "The budget is reduced", "A teammate leaves the team"]),
  ("The best place to keep the single source of truth for task status is:", ["A shared project board everyone updates", "Each person's private notes", "Scattered WhatsApp messages", "Your memory"]),
 ],
 "w9-2": [  # Processes & SOPs
  ("A standard operating procedure (SOP) is:", ["Written step-by-step instructions for doing a task the same way every time", "A company's annual budget", "A list of job vacancies", "A customer complaint form"]),
  ("Before writing an SOP, the most useful first step is to:", ["Watch or ask someone who does the task and map each step", "Copy an SOP from another industry", "Write it from memory without checking", "Ask the client to write it"]),
  ("A good SOP step is written as:", ["A short, clear action, e.g. Save the invoice to the Finance folder", "A long paragraph of background", "A vague goal like Be efficient", "A list of names only"]),
  ("A process map helps a team:", ["See every step, handover and decision point at a glance", "Avoid writing anything down", "Hide problems from managers", "Replace all meetings"]),
  ("A bottleneck in a process is:", ["A step where work piles up and slows everything after it", "The first step of a process", "A step that is optional", "The final sign-off"]),
  ("Why should an SOP have an owner and a review date?", ["So it stays accurate as the process changes", "So nobody else can read it", "Because it makes the file larger", "To make the process slower"]),
  ("A checklist is most useful for:", ["Repeatable tasks where missing a step causes problems", "One-off creative work", "Personal hobbies only", "Tasks nobody does"]),
  ("You find a faster way to do a step in a documented process. You should:", ["Suggest the change to the process owner and update the SOP once agreed", "Do it your way without telling anyone", "Keep it secret", "Delete the old SOP"]),
  ("Version control on an SOP means:", ["Each change is dated and numbered so everyone uses the latest version", "Only one person can ever open it", "It is printed and filed", "It cannot be changed"]),
  ("Which is a sign that a process needs improving?", ["The same mistakes or delays keep happening", "It is written down", "Several people follow it", "It has a clear owner"]),
 ],
 "w10-2": [  # Executive & virtual assistance
  ("At the start of the week, an executive assistant should first:", ["Agree priorities and the week's key meetings with the executive", "Clear the executive's whole calendar", "Reply to every email as the executive", "Wait for instructions all week"]),
  ("Two senior people want the same time slot with your executive. You should:", ["Check priorities with the executive or their rules, then offer an alternative to the other", "Book both at the same time", "Pick whoever asked first without checking", "Ignore both requests"]),
  ("Confidential information you see as an assistant should be:", ["Shared only with people who are authorised to see it", "Discussed with friends if you don't use names", "Posted in the team chat to keep everyone informed", "Forwarded to your personal email for safekeeping"]),
  ("A virtual assistant working for a client abroad should always:", ["Confirm time zones and agreed response times", "Work only in their own time zone without saying", "Use personal social media to send files", "Avoid written updates"]),
  ("A good daily update to your executive is:", ["Short: what's done, what's next and what needs their decision", "A copy of every email you received", "A long story of your day", "Nothing, unless they ask"]),
  ("Which tool is best for tracking delegated tasks with due dates?", ["A task tool such as Asana, ClickUp or Trello", "Sticky notes on your desk", "Your phone's photo gallery", "A printed calendar only"]),
  ("Before booking travel for your executive, you should know:", ["Their preferences, budget and the meeting schedule at the destination", "Only the destination city", "Your own travel preferences", "Nothing, just book the cheapest option"]),
  ("When drafting an email for your executive to send, you should:", ["Write it in their tone and let them review it before it goes", "Send it immediately in your own name", "Copy in everyone you know", "Leave out the main request"]),
  ("Managing an executive's inbox well means:", ["Sorting by priority, drafting replies and flagging what needs their decision", "Deleting anything older than a day", "Marking everything as read", "Forwarding every email to them"]),
  ("You make a scheduling mistake that causes a clash. The best response is:", ["Tell your executive quickly, fix it and explain how you'll prevent it", "Hide it and hope nobody notices", "Blame the calendar app", "Cancel both meetings without saying anything"]),
 ],
 "w11-2": [  # Office administration & records
  ("A good records system lets you:", ["Find any document quickly using a clear folder and naming structure", "Keep files only on your personal laptop", "Store everything in one unnamed folder", "Print every document"]),
  ("The usual order for a simple procurement is:", ["Request, quotes, approval, purchase, receipt and payment", "Payment, then request", "Purchase first, approval later", "Quotes after payment"]),
  ("Why get more than one quote before buying?", ["To compare price and quality and show a fair choice", "To delay the purchase", "Because suppliers like it", "It is never useful"]),
  ("A petty cash log should record:", ["Date, amount, purpose, who received it and the receipt", "Only the total spent each year", "Just the name of the person", "Nothing, cash doesn't need records"]),
  ("Reconciling petty cash means:", ["Checking that cash in hand plus receipts equals the starting float", "Spending the rest of the cash", "Writing a new budget", "Throwing away old receipts"]),
  ("Under Nigeria's data protection law (NDPA), personal data should be:", ["Collected for a clear purpose and kept secure", "Shared freely within the company", "Kept forever just in case", "Posted on notice boards"]),
  ("A staff member asks for a colleague's home address. You should:", ["Not share it without a valid reason and the right authorisation", "Share it if they say it's urgent", "Post it in the group chat", "Email it to everyone"]),
  ("Archiving old records means:", ["Moving them to a long-term store with clear labels and retention dates", "Deleting them immediately", "Leaving them on your desk", "Renaming them randomly"]),
  ("A visitor log at reception is useful because it:", ["Records who is on site, for safety and security", "Replaces staff attendance", "Lists customer complaints", "Tracks office supplies"]),
  ("An office supplies tracker should flag:", ["Items running low so they can be reordered in time", "Only items that are full", "Staff birthdays", "Unpaid invoices from customers"]),
 ],
},
"CSG": {
 "w8-2": [  # Customer success & onboarding
  ("The main difference between support and customer success is:", ["Support reacts to problems, customer success proactively helps customers reach their goals", "They are exactly the same", "Customer success only handles refunds", "Support only works with new customers"]),
  ("A good onboarding plan for a new customer starts with:", ["Understanding what success looks like for them", "Sending an invoice", "A long product feature list", "Waiting for them to ask for help"]),
  ("A customer health score helps you:", ["Spot customers at risk before they leave", "Calculate staff salaries", "Decide office opening hours", "Write job adverts"]),
  ("Which is a warning sign that a customer may churn?", ["Their product usage has dropped sharply", "They attended your training session", "They referred a friend", "They renewed early"]),
  ("Time to value means:", ["How long it takes a customer to get their first real benefit from the product", "How long a support call lasts", "The price of the product", "How many staff a customer has"]),
  ("A quarterly business review (QBR) with a customer is for:", ["Reviewing results against their goals and planning next steps", "Selling as much as possible in one call", "Complaining about late payments", "Introducing new staff only"]),
  ("During onboarding, a customer goes quiet for two weeks. You should:", ["Reach out with a helpful check-in and offer support", "Assume everything is fine", "Close their account", "Wait for them to complain"]),
  ("Which onboarding step usually comes first?", ["A welcome and kickoff call to agree goals and next steps", "A renewal discussion", "An upsell offer", "A satisfaction survey"]),
  ("Success plans should be:", ["Written down and shared with the customer, with clear milestones", "Kept secret from the customer", "Only in your head", "The same for every customer"]),
  ("A customer success team is often measured by:", ["Retention, renewals and customer health", "Number of emails sent", "Hours spent in meetings", "Office attendance"]),
 ],
 "w9-2": [  # CRM management
  ("A CRM is mainly used to:", ["Keep a shared record of customers, deals and every interaction", "Edit photos", "Pay staff salaries", "Design websites"]),
  ("In a CRM, a deal stage shows:", ["How far a sale has progressed in the pipeline", "The customer's birthday", "The product's colour", "The office location"]),
  ("You find the same company entered three times in the CRM. You should:", ["Merge the duplicates, keeping the most complete details", "Leave them, duplicates don't matter", "Delete all three", "Create a fourth record"]),
  ("Why log every call and email against a contact?", ["So anyone on the team can see the full history before contacting them", "To make the CRM look busy", "It is required by the phone company", "It isn't useful"]),
  ("Required fields in a CRM help to:", ["Make sure key information is always captured", "Slow people down", "Hide records from managers", "Delete old deals"]),
  ("A sales pipeline report shows:", ["How many deals are at each stage and their total value", "Staff holiday dates", "Website colours", "Office supply levels"]),
  ("Which is the cleanest way to store a Nigerian phone number?", ["One agreed format for everyone, e.g. +234 803 123 4567", "Whatever format each person likes", "Only the last four digits", "Inside the notes field as free text"]),
  ("Before importing a spreadsheet of contacts into a CRM, you should:", ["Clean it, match the columns to CRM fields and remove duplicates", "Import it as it is", "Delete the column headers", "Email it to all contacts"]),
  ("A CRM task such as Follow up on proposal is useful because:", ["It reminds the owner what to do and when", "It replaces talking to customers", "It closes the deal automatically", "It is only for managers"]),
  ("Data protection in a CRM means:", ["Only authorised people can see customer data, and it is used for agreed purposes", "Anyone can export the whole database", "Customer data can be shared on social media", "Passwords are shared across the team"]),
 ],
 "w10-2": [  # Sales development & prospecting
  ("An ideal customer profile (ICP) describes:", ["The type of company most likely to buy and succeed with your product", "Your favourite customer's personal details", "The price list", "Your sales targets"]),
  ("The main goal of a sales development rep is usually to:", ["Find and qualify prospects and book meetings for the sales team", "Close every deal alone", "Manage the company accounts", "Write product code"]),
  ("A strong cold email:", ["Is short, personal and ends with one clear next step", "Is a long list of every product feature", "Is the same message sent to everyone without changes", "Has no subject line"]),
  ("A prospect says Send me some information. A good reply is:", ["Agree, and ask one question to understand what would be most useful", "Send a 40-page brochure and never follow up", "Stop contacting them", "Argue that they should buy now"]),
  ("Qualifying a lead means checking:", ["Whether they have the need, budget, authority and timing to buy", "Their favourite football club", "How many followers they have", "Only their job title"]),
  ("A sequence in sales prospecting is:", ["A planned series of follow-up messages over days or weeks", "A single phone call", "The order of products in a catalogue", "A meeting agenda"]),
  ("A prospect says We already use a competitor. A good response is:", ["Acknowledge it and ask what's working well and what could be better", "Criticise the competitor harshly", "End the call immediately", "Lower your price without asking anything"]),
  ("Which is the best source for building a B2B prospect list?", ["Company websites, LinkedIn and industry directories that fit your ICP", "Random phone numbers", "Personal contacts' private data", "Any list bought without consent"]),
  ("Why log every prospecting activity in the CRM?", ["To track follow-ups and see which messages work", "To avoid talking to prospects", "Because it replaces the sales team", "It has no benefit"]),
  ("A good opening line in a cold call:", ["Says who you are, why you're calling and asks for a moment of their time", "Starts with a long product demo", "Asks them to buy immediately", "Avoids saying your name"]),
 ],
 "w11-2": [  # Retention, upsell & growth reporting
  ("Customer churn rate is:", ["The share of customers who stop buying in a period", "The number of new customers", "The price increase this year", "The number of support tickets"]),
  ("You start the month with 200 customers and 10 cancel. Churn for the month is:", ["5%", "10%", "2%", "20%"]),
  ("An upsell is when a customer:", ["Moves to a higher plan or buys more of what they already use", "Cancels their subscription", "Files a complaint", "Asks for a refund"]),
  ("Which is a good upsell signal?", ["The customer regularly hits the limits of their current plan", "The customer hasn't logged in for months", "The customer just complained about billing", "The customer asked to cancel"]),
  ("Net revenue retention above 100% means:", ["Revenue from existing customers grew, even after churn", "You lost all your customers", "Prices were cut in half", "Only new customers paid"]),
  ("The best time to start a renewal conversation is:", ["Well before the renewal date, with the value they've received", "The day after it expires", "Never, renewals happen on their own", "Only if they complain"]),
  ("Customer feedback from surveys should be:", ["Grouped into themes and turned into actions, then shared back with customers", "Ignored if it's negative", "Kept private from the product team", "Deleted after reading"]),
  ("A monthly growth report for the team should include:", ["Churn, retention, expansion revenue and the main reasons behind changes", "Every customer's personal details", "Only good news", "Staff lunch orders"]),
  ("An at-risk customer is best handled by:", ["Contacting them quickly to understand the problem and agree a fix", "Waiting for their contract to end", "Offering a discount without asking anything", "Removing them from the CRM"]),
  ("Retention matters because:", ["Keeping customers usually costs less than winning new ones", "New customers are never valuable", "It reduces the need for support", "It is only an accounting term"]),
 ],
},
"PTA": {
 "w4-2": [  # Recruitment lifecycle
  ("Which comes first in a typical hiring process?", ["Confirming the hiring need and writing the job description", "Making an offer", "Onboarding the new hire", "Running interviews"]),
  ("A recruitment coordinator usually owns:", ["Scheduling, candidate communication and keeping the process on track", "Deciding the final salary alone", "Firing staff", "Writing company accounts"]),
  ("The hiring manager is usually:", ["The person the new hire will report to, who makes the final hiring decision", "The newest employee", "An external customer", "The company's accountant"]),
  ("Candidate experience matters because:", ["Candidates share their experience and it affects your employer brand", "It has no effect on hiring", "Only hired candidates count", "It only matters for senior roles"]),
  ("Time to hire is measured from:", ["When a candidate applies or is approached to when they accept the offer", "The hire's first day to their last day", "The job ad going live to the end of probation", "The interview to the first payslip"]),
  ("A talent pipeline is:", ["A group of suitable candidates you keep in touch with for future roles", "A list of current staff salaries", "The office internet connection", "A training course"]),
  ("The offer stage usually includes:", ["Agreeing terms and sending a written offer letter", "Posting the job ad", "Screening CVs", "Sourcing candidates"]),
  ("Why agree a hiring timeline with the hiring manager at the start?", ["So everyone knows the target dates and can plan interviews", "To delay the process", "Because candidates set the timeline", "It isn't necessary"]),
  ("Internal recruitment means:", ["Filling a role with someone already working in the organisation", "Hiring only through agencies", "Hiring friends of the CEO", "Recruiting only from abroad"]),
  ("Which stage comes straight after interviews in most processes?", ["Decision and reference checks", "Writing the job description", "Sourcing", "Onboarding"]),
 ],
 "w5-2": [  # Job descriptions & job ads
  ("A job description should include:", ["Purpose of the role, responsibilities, requirements and reporting line", "Only the salary", "The interviewer's personal opinions", "A list of company parties"]),
  ("Must-have requirements are:", ["Skills or qualifications a candidate cannot do the job without", "Nice extras that would help", "The manager's hobbies", "Optional training courses"]),
  ("Which wording is most inclusive?", ["Strong written communication skills", "Young and energetic graduate", "Native English speaker only", "Male candidates preferred"]),
  ("A job ad differs from a job description because it:", ["Is shorter and written to attract the right applicants", "Includes confidential salary bands for all staff", "Is only for internal use", "Has no requirements"]),
  ("Why avoid a very long list of requirements in a job ad?", ["Good candidates may not apply if they don't meet every point", "It makes the ad look professional", "It increases applications from everyone", "It is required by law"]),
  ("A clear job title helps because:", ["Candidates search by common titles and understand the level", "It can be as creative as possible", "It hides the role from competitors", "It replaces the job description"]),
  ("The best way to describe responsibilities is:", ["Short action statements, e.g. Schedule interviews for 5 hiring managers", "Long paragraphs of company history", "Single words like Admin", "Vague phrases like Other duties"]),
  ("Including the work location and arrangement (on-site, hybrid, remote) is important because:", ["Candidates can decide if the role is practical for them", "It is never relevant", "It reduces applications from good candidates", "Only managers need to know"]),
  ("A job ad should end with:", ["How to apply and the closing date", "The manager's phone number", "A list of rejected candidates", "Nothing"]),
  ("Before publishing a job description, you should:", ["Have the hiring manager review and approve it", "Post it immediately without checking", "Copy a competitor's ad word for word", "Send it to all current staff for votes"]),
 ],
 "w6-2": [  # Sourcing candidates
  ("Sourcing means:", ["Actively searching for and approaching potential candidates", "Waiting for applications only", "Deciding the salary", "Running background checks"]),
  ("In a Boolean search, AND is used to:", ["Find profiles that include all the terms", "Find profiles with any one of the terms", "Exclude a term", "Search an exact phrase"]),
  ("In a Boolean search, OR is used to:", ["Include alternatives, e.g. recruiter OR talent acquisition", "Exclude unwanted words", "Require every term", "Search only job titles"]),
  ("Quote marks in a search, e.g. \"customer service\", tell the search to:", ["Match the exact phrase", "Ignore the words", "Exclude the phrase", "Search only in Nigeria"]),
  ("NOT in a Boolean search is used to:", ["Exclude a term, e.g. NOT intern", "Include synonyms", "Match exact phrases", "Search by location"]),
  ("A good outreach message to a passive candidate is:", ["Short, personal, mentions why they fit and asks a simple question", "A copy of the full job description", "The same generic message sent to hundreds", "A request for their salary first"]),
  ("Employee referrals are valuable because:", ["Referred candidates are often a good fit and stay longer", "They avoid any interview", "They are always the cheapest option", "They replace the job description"]),
  ("A sourcing tracker should record:", ["Name, profile link, source, status and next follow-up date", "Candidates' private phone numbers from unknown sources", "Only names", "Personal social media photos"]),
  ("Which is an appropriate place to source candidates?", ["Professional networks, job boards and relevant online communities", "Private contact lists shared without consent", "Hacked databases", "Random phone numbers"]),
  ("A candidate doesn't reply to your first message. A good next step is:", ["Send one polite follow-up a few days later", "Message them every day", "Call their current employer", "Post about them online"]),
 ],
 "w7-2": [  # Screening & shortlisting
  ("When screening CVs, you should compare each one against:", ["The must-have requirements agreed with the hiring manager", "Your personal preferences", "The candidate's photo", "Where they went on holiday"]),
  ("A screening scorecard helps because:", ["Every candidate is assessed on the same criteria, which is fairer", "It makes the process slower", "It lets you skip reading CVs", "It decides the salary"]),
  ("Which is a fair screening question?", ["Can you tell me about your experience handling customer complaints?", "Are you planning to have children soon?", "Which tribe are you from?", "How old are you?"]),
  ("A phone screen is mainly used to:", ["Check key requirements, interest and availability before full interviews", "Make the final offer", "Train the candidate", "Negotiate a contract"]),
  ("A shortlist summary for the hiring manager should include:", ["Each candidate's strengths, gaps and score against the criteria", "Only the candidates' names", "Personal gossip", "Every CV received"]),
  ("A gap of a year on a CV should be:", ["Asked about neutrally, without assuming the reason", "Treated as an automatic rejection", "Ignored completely without context", "Mentioned to other candidates"]),
  ("Why take notes during a phone screen?", ["So decisions are based on what was said and can be explained", "To share with friends", "Because candidates expect it", "It isn't useful"]),
  ("Knockout questions are:", ["Questions on essential requirements, e.g. Are you able to work in Lagos?", "Trick questions to confuse candidates", "Questions about hobbies", "Questions for the final interview only"]),
  ("Unconscious bias in screening can be reduced by:", ["Using clear criteria and a structured scorecard", "Going with your gut feeling", "Only looking at the candidate's name", "Screening CVs very quickly"]),
  ("After shortlisting, candidates who were not selected should:", ["Receive a polite, timely message", "Never hear back", "Be told the names of the shortlisted candidates", "Be asked to apply again tomorrow"]),
 ],
 "w8-2": [  # Interviews & candidate experience
  ("When scheduling a panel interview, you should first:", ["Check each interviewer's availability and the candidate's", "Book the room and hope everyone comes", "Ask the candidate to choose any time", "Send invites without times"]),
  ("An applicant tracking system (ATS) helps to:", ["Track every candidate's stage and keep communication in one place", "Write the company's accounts", "Replace interviews completely", "Pay new hires"]),
  ("A good interview invitation includes:", ["Date, time, format or location, interviewers and what to prepare", "Only the word Interview", "The salary of every interviewer", "No time zone or link"]),
  ("A structured interview means:", ["Every candidate is asked the same core questions and scored the same way", "Questions change for every candidate at random", "There is no scoring", "Only one interviewer is allowed"]),
  ("An interview pack for interviewers should include:", ["The job description, the candidate's CV, questions and a scoring sheet", "The candidate's personal social media", "Last year's accounts", "Nothing"]),
  ("A candidate asks to reschedule because of an emergency. You should:", ["Respond kindly and offer new times quickly", "Remove them from the process", "Ignore the message", "Tell them it reflects badly on them"]),
  ("Candidates who are rejected after interview should:", ["Hear back promptly and politely, with brief feedback where possible", "Never be contacted again", "Be told about other candidates' scores", "Receive a generic message months later"]),
  ("Why send a reminder the day before an interview?", ["It reduces no-shows and helps candidates prepare", "It annoys candidates", "It is required by law", "It replaces the invitation"]),
  ("After each interview, interviewers should:", ["Submit their scores and notes quickly, before discussing with others", "Wait a week before writing anything", "Decide by vote without notes", "Share notes with the candidate"]),
  ("A virtual interview link should be:", ["Tested beforehand and sent with clear joining instructions", "Sent five minutes before the start", "Shared publicly on social media", "Different for each interviewer without telling them"]),
 ],
 "w9-2": [  # Onboarding & HR administration
  ("An offer letter usually includes:", ["Job title, start date, salary, key terms and how to accept", "The interviewer's notes", "Other candidates' names", "Company bank passwords"]),
  ("Good onboarding starts:", ["Before the first day, with equipment, accounts and a welcome plan ready", "Three months after they start", "Only if the new hire asks", "On their last day"]),
  ("An onboarding checklist helps to:", ["Make sure nothing is missed in the new hire's first weeks", "Replace their manager", "Avoid giving them work", "Track their social life"]),
  ("Employee records should be:", ["Accurate, up to date and stored securely with restricted access", "Kept in a shared folder anyone can open", "Printed and left on desks", "Deleted after onboarding"]),
  ("A probation review is:", ["A check at the end of an agreed period to confirm the hire is meeting expectations", "A weekly team lunch", "A salary increase for everyone", "The first interview"]),
  ("Which document is usually needed to set up a new hire on payroll?", ["Bank details and tax identification details", "Their school report card", "Their social media passwords", "A list of their friends"]),
  ("A buddy in onboarding is:", ["A colleague who helps the new hire settle in and answers everyday questions", "Their line manager", "An external recruiter", "The company's lawyer"]),
  ("Why set probation reminders in a calendar or HR system?", ["So reviews happen on time and nobody is forgotten", "To delay the review", "Because new hires request them", "They aren't needed"]),
  ("A new hire's first week should include:", ["Introductions, tools access, key policies and clear first tasks", "No contact with their manager", "Only reading the full policy handbook", "Working alone without guidance"]),
  ("When a new hire's details change, e.g. a new address, you should:", ["Update their record promptly and keep the change secure", "Ignore it", "Post it in the team chat", "Write it on a sticky note"]),
 ],
 "w10-2": [  # HR policies, employment basics & data privacy
  ("A leave policy explains:", ["What leave staff are entitled to and how to request it", "How to apply for a job", "The company's sales targets", "How to use the photocopier"]),
  ("A grievance procedure is used when:", ["An employee wants to raise a formal concern or complaint", "Hiring a new manager", "Ordering office supplies", "Planning the company party"]),
  ("An employee asks a detailed legal question about their contract. An HR assistant should:", ["Pass it to the HR lead, who can check the details or take advice", "Give a definite legal answer from memory", "Ignore the question", "Post it on social media for opinions"]),
  ("A written employment contract helps because:", ["Both sides know the agreed terms, such as role, pay and notice", "It replaces the job description", "It is only for senior staff", "It can be changed by anyone at any time"]),
  ("Employee personal data, such as medical notes, should be:", ["Kept confidential and shared only with people who need it", "Discussed openly in team meetings", "Stored on a personal phone", "Shared with other employers"]),
  ("Under Nigeria's data protection law (NDPA), organisations should:", ["Collect only the personal data they need and keep it secure", "Collect as much data as possible", "Keep all data forever", "Sell employee data to partners"]),
  ("A code of conduct sets out:", ["The behaviour expected of everyone in the organisation", "Only the dress code for visitors", "The annual budget", "How to apply for leave"]),
  ("You accidentally email a salary spreadsheet to the wrong person. You should:", ["Report it to your manager immediately so it can be handled", "Hope nobody notices", "Delete your sent folder", "Ask the person to keep it secret and move on"]),
  ("Why should HR policies be easy to find for all staff?", ["So people know their rights and responsibilities", "So they can be ignored", "Because managers don't need them", "To make the intranet look full"]),
  ("Confidentiality in HR means:", ["Not sharing personal or sensitive information beyond those who need to know", "Never writing anything down", "Telling only close friends", "Sharing information if it seems interesting"]),
 ],
 "w11-2": [  # HR metrics & reporting
  ("Cost per hire is:", ["Total recruitment costs divided by the number of hires", "The new hire's monthly salary", "The cost of one job ad", "The interviewer's hourly rate"]),
  ("Offer acceptance rate is:", ["Offers accepted divided by offers made", "Applications divided by hires", "Interviews per week", "Staff leaving per year"]),
  ("You made 8 offers and 6 were accepted. The offer acceptance rate is:", ["75%", "60%", "80%", "48%"]),
  ("Source of hire shows:", ["Which channels, such as referrals or job boards, your hires came from", "The new hire's home town", "Which interviewer was best", "Where the office is located"]),
  ("Early turnover usually means:", ["New hires leaving within their first months", "Staff changing desks", "Promotions after 5 years", "Retiring staff"]),
  ("Time to fill is measured from:", ["When the job is opened to when an offer is accepted", "An employee's first day to their last", "The interview to the first payslip", "The end of probation to promotion"]),
  ("A good monthly recruitment report:", ["Shows a few key metrics, trends and what action is needed", "Lists every email sent", "Includes candidates' personal data", "Has no charts or numbers"]),
  ("If time to hire is rising every month, a useful first step is to:", ["Look at which stage is taking longest", "Stop tracking it", "Hire faster without checks", "Blame candidates"]),
  ("Why report source of hire to the team?", ["To spend more effort and budget on the channels that work", "To rank candidates by home town", "Because it's required by banks", "It isn't useful"]),
  ("Which chart best shows hires per month over a year?", ["A line or column chart over the months", "A pie chart with 12 slices", "A table of names", "A photo of the team"]),
 ],
},
}

# Fundamental Examination pool: the two fundamental assessment banks plus these. Each learner gets 30 at random.
FUND_EXTRA = [
 ("Which email subject line is clearest?", ["Approval needed: venue booking by Thursday", "Hi", "Urgent!!!", "Question"]),
 ("You need to share a large file with a client. Best practice is to:", ["Share a link with the right permission level", "Attach it in pieces across ten emails", "Send it on WhatsApp to their personal number", "Print and post it"]),
 ("During a video call your connection keeps dropping. You should:", ["Tell the host briefly, turn off your camera and stay on audio", "Leave without saying anything", "Keep rejoining without explanation", "Blame the host's connection"]),
 ("A colleague asks for an update you can't give yet. You should:", ["Say when you'll have it and follow up by then", "Ignore the message", "Guess an answer", "Tell them to ask someone else"]),
 ("Which file name will be easiest to find later?", ["2026-12-01_Jobnest_Report_v1.docx", "new doc (3).docx", "final FINAL.docx", "Untitled"]),
 ("Writing in all capital letters in a work message usually comes across as:", ["Shouting", "Professional", "Friendly", "Neutral"]),
 ("When you finish a task someone is waiting on, you should:", ["Tell them it's done and where to find it", "Wait for them to notice", "Move straight to the next task", "Mention it next week"]),
 ("The Eisenhower matrix sorts tasks by:", ["Urgency and importance", "Cost and size", "Colour and shape", "Who asked first"]),
 ("A task that is urgent but not important should usually be:", ["Delegated where possible", "Done before everything else", "Deleted", "Ignored"]),
 ("Time-blocking works best when you:", ["Reserve focused time for important work and protect it", "Book every minute with meetings", "Never plan ahead", "Work only when you feel like it"]),
 ("On a task board, a card in the Review column means:", ["The work is done and waiting to be checked", "Nobody has started it", "It is cancelled", "It is overdue"]),
 ("You have more work than you can finish this week. The best step is to:", ["Tell your manager early and agree priorities", "Work through the night every night", "Quietly drop tasks", "Wait until deadlines pass"]),
 ("Which is the best channel for a formal request to a client?", ["A clear, polite email", "A voice note at midnight", "A comment on their social media", "A message through a friend"]),
 ("Professional tone in a written reply means:", ["Polite, clear and focused on the next step", "Very casual with lots of slang", "Short and rude", "Long and full of jargon"]),
 ("Why update your status when you step away from work online?", ["So colleagues know when to expect a reply", "To look busy", "Because it's fun", "It has no purpose"]),
 ("A shared drive folder should be organised:", ["By client or project with clear subfolders", "By the date you joined", "In one big folder", "By file size"]),
 ("Giving someone Viewer access to a document means they can:", ["Read it but not change it", "Edit and delete it", "Share it as the owner", "Nothing at all"]),
 ("Before you send an important email, you should:", ["Check the recipient, attachment, spelling and the ask", "Send it as fast as possible", "Copy in everyone you know", "Remove the subject line"]),
 ("A workplace-ready professional handles feedback by:", ["Listening, asking questions and acting on it", "Arguing straight away", "Ignoring it", "Complaining to colleagues"]),
 ("Meeting notes are most useful when they record:", ["Decisions, actions, owners and due dates", "Every word that was said", "Only who was late", "Personal opinions"]),
 ("A daily shutdown routine ends your day by:", ["Reviewing what's done and planning tomorrow", "Leaving all tabs open", "Checking social media", "Deleting your to-do list"]),
]

# Core Skill Learning Examination pool per track: that track's eight weekly core banks plus these scenarios. Each learner gets 40 at random.
CORE_EXTRA = {
"BOP": [
 ("Your manager's flight is cancelled the night before a client meeting in Abuja. Your first step is to:", ["Check alternatives, tell your manager and the client, and rebook", "Cancel the meeting without telling anyone", "Wait until morning", "Book the most expensive option without checking"]),
 ("You're asked to coordinate a team offsite with a fixed budget. You should start with:", ["The goals, date, headcount and budget, then gather quotes", "Booking the first venue you find", "Ordering food", "Sending invitations with no date"]),
 ("A recurring report takes you 3 hours every week. The best improvement is to:", ["Map the steps, then template or automate the repetitive parts", "Stop doing the report", "Do it faster with less care", "Ask a colleague to do it secretly"]),
 ("Two vendors quote the same price. The best way to choose is to compare:", ["Quality, reliability, delivery time and terms", "Whose name sounds better", "Who replied first", "Nothing, pick at random"]),
 ("An executive asks you to keep a restructuring plan confidential. A colleague asks what's happening. You should:", ["Politely say you can't discuss it", "Share a few hints", "Tell them everything", "Forward them the document"]),
 ("A project task is three days late and blocking two others. You should:", ["Raise it in the status update with the impact and a recovery plan", "Hide it until it's fixed", "Remove the task from the plan", "Wait for someone to ask"]),
 ("You receive an expense claim with no receipt. You should:", ["Ask for the receipt or follow the policy for missing receipts", "Approve it anyway", "Reject it without explaining", "Pay it from petty cash"]),
 ("Which is the best way to share a new SOP with the team?", ["Publish it in the shared folder, announce it and walk through the changes", "Email it once without a subject", "Keep it on your laptop", "Print one copy for your desk"]),
 ("Your manager has back-to-back meetings all day. A good assistant would:", ["Add short breaks and travel time where possible and flag the risk", "Add more meetings", "Cancel all meetings", "Say nothing"]),
 ("An operations dashboard should mainly show:", ["The few numbers that tell you if operations are on track", "Every data point you can find", "Staff birthdays", "Only last year's numbers"]),
 ("A supplier misses a delivery for the second time. You should:", ["Log it, raise it with the supplier and review alternatives", "Ignore it", "Cancel the contract by text", "Pay them extra"]),
 ("The best way to hand over your tasks before leave is:", ["A written handover with status, contacts and next steps", "Telling one person in passing", "Nothing, they'll work it out", "Leaving sticky notes"]),
 ("To check the final cost of an event against budget, you should use:", ["A tracker comparing budgeted and actual spend for each item", "A guess at the end", "Only the biggest invoice", "The venue's website"]),
 ("Your executive asks for a one-page brief before a meeting. It should include:", ["Purpose, attendees, background, key decisions and suggested talking points", "Every email about the topic", "Your personal opinions only", "A list of restaurants"]),
 ("A new admin process is causing confusion. The first thing to do is:", ["Ask the people using it where they get stuck", "Make the process longer", "Blame the team", "Remove all documentation"]),
],
"PTA": [
 ("A hiring manager wants to hire in two weeks but hasn't approved the job description. You should:", ["Explain the timeline risk and get the job description approved first", "Post the ad anyway", "Cancel the role", "Write the job description without them"]),
 ("You receive 300 applications for one role. The most efficient fair approach is to:", ["Screen against agreed must-haves with a scorecard", "Pick the first 10", "Choose by name", "Reject all and repost"]),
 ("A strong candidate is about to accept another offer. You should:", ["Tell the hiring manager quickly so they can decide whether to speed up", "Do nothing", "Pressure the candidate", "Share the other company's offer with your team"]),
 ("A candidate complains they never heard back after an interview. You should:", ["Apologise, update them and fix the communication gap", "Ignore them", "Blame the hiring manager publicly", "Tell them to apply elsewhere"]),
 ("Which Boolean string finds HR assistants in Lagos, excluding interns?", ["(\"HR assistant\" OR \"human resources assistant\") AND Lagos NOT intern", "HR assistant intern Lagos", "HR OR Lagos OR intern", "\"HR assistant Lagos intern\""]),
 ("An interviewer asks a candidate about their religion. As coordinator you should:", ["Raise it with HR leadership so interviewers are reminded what not to ask", "Ignore it", "Ask the same question to all candidates", "Note it in the candidate's file"]),
 ("Before a new hire's first day, the most important thing to confirm is:", ["Their equipment, accounts and first-week plan are ready", "Their favourite food", "Their social media handles", "Their previous salary history"]),
 ("Your recruitment report shows most hires come from referrals. A sensible action is to:", ["Encourage and reward referrals while keeping other channels open", "Stop all other recruitment channels at once", "Hide the data", "Stop tracking source of hire"]),
 ("A manager asks you to share a candidate's CV with a friend at another company. You should:", ["Decline, because candidate data is for this recruitment only", "Share it quickly", "Share it without the name", "Post it online"]),
 ("You need to schedule interviews for 6 candidates with a 3-person panel. The best tool is:", ["A shared calendar or scheduling tool that shows everyone's availability", "Separate phone calls to each person", "Guessing times", "A single group chat with no times"]),
 ("A new hire seems lost in their second week. A good HR assistant would:", ["Check in, connect them with their buddy and flag it to their manager", "Wait for probation to end", "Ignore it", "Tell them to read the handbook again"]),
 ("Which metric best shows whether your hiring process is slow?", ["Time to hire", "Number of job ads", "Office headcount", "Training hours"]),
 ("An employee asks HR to keep a complaint about their manager confidential. You should:", ["Explain how confidentiality works in the grievance process and pass it to the right person", "Promise total secrecy no matter what", "Tell the manager directly", "Discuss it with colleagues"]),
 ("A job ad has had very few applicants after two weeks. You should first:", ["Review the title, requirements and where it's posted", "Close the role", "Double the requirements", "Wait another two months"]),
 ("At the end of a hiring process, candidate records should be:", ["Kept only as long as needed and stored securely, then deleted", "Kept forever in a shared folder", "Emailed to all staff", "Printed and filed on a desk"]),
],
"CSG": [
 ("A customer has emailed three times about the same unresolved issue. You should:", ["Own it, apologise, give a clear fix or timeline and follow up", "Send the same template again", "Close the ticket", "Pass it on with no note"]),
 ("Your CSAT dropped this week. The most useful first step is to:", ["Read the low-score comments and look for common causes", "Stop sending surveys", "Ignore it", "Blame the customers"]),
 ("A high-value customer's usage has dropped by half. You should:", ["Reach out to understand why and agree a plan", "Wait for renewal", "Send a discount code with no message", "Remove them from the CRM"]),
 ("A prospect replies Not now, maybe next quarter. You should:", ["Thank them, ask a brief question and set a follow-up task for next quarter", "Delete them from the list", "Call again tomorrow", "Send the same email daily"]),
 ("You find two CRM records for the same customer with different phone numbers. You should:", ["Confirm the correct details and merge the records", "Keep both", "Delete both", "Guess which is right"]),
 ("An angry customer on live chat uses rude language. You should:", ["Stay calm and professional, acknowledge the issue and follow the abuse policy if needed", "Reply in the same tone", "End the chat immediately without a word", "Ignore their messages"]),
 ("Which is the best measure of how quickly your team first responds?", ["First response time (FRT)", "Net Promoter Score", "Churn rate", "Average deal size"]),
 ("A customer asks for a feature you don't have. A good reply is:", ["Thank them, explain the current options and log the request for the product team", "Promise it will be built next week", "Tell them it's a bad idea", "Ignore the request"]),
 ("Before a renewal call, you should prepare:", ["Their usage, results achieved, open issues and goals for next year", "A new price only", "Nothing", "A list of competitors"]),
 ("A customer is ready to upgrade but has an open billing complaint. You should:", ["Resolve the complaint first, then discuss the upgrade", "Push the upgrade and ignore the complaint", "Cancel the account", "Offer a free upgrade without fixing anything"]),
 ("Your ticket queue is full and an SLA is about to be breached. You should:", ["Prioritise by urgency and SLA, and tell your team lead early", "Answer the easiest tickets first", "Close old tickets without replying", "Wait for the queue to clear itself"]),
 ("A good cold email subject line is:", ["Short and relevant to the prospect, e.g. Faster deliveries for Ikeja stores", "FREE OFFER!!!", "Hello", "Very long and full of product names"]),
 ("You notice many tickets ask the same question. The best long-term fix is to:", ["Write a help article and a macro, and share the trend with the product team", "Keep answering one by one", "Close those tickets", "Ignore the pattern"]),
 ("A new customer hasn't completed setup after 10 days. You should:", ["Offer a short call or guide to help them finish setup", "Wait until they cancel", "Send an invoice reminder only", "Mark them as churned"]),
 ("Which report would best show your team whether customers are staying?", ["A monthly retention and churn report with reasons", "A list of staff holidays", "Website traffic only", "The number of emails sent"]),
],
}

if __name__ == "__main__":
    import random, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    TRACKS = {"BOP": OLD["ADM"], "CSG": OLD["CSP"], "PTA": {}}
    rows = []
    def add(track, key, qs, minimum):
        assert len(qs) >= minimum, (track, key, len(qs))
        for i, (q, opts) in enumerate(qs, 1):
            assert len(opts) == 4, (track, key, q)
            rnd = random.Random(f"v2-{track}-{key}-{i}")
            order = list(range(4)); rnd.shuffle(order)
            rows.append((track, key, i, q, [opts[j] for j in order], order.index(0)))
    for track in ["BOP", "PTA", "CSG"]:
        weekly = {**SHARED, **TRACKS[track], **NEW[track]}
        keys = ["w2-4", "w3-3"] + [f"w{w}-2" for w in range(4, 12)]
        assert sorted(weekly) == sorted(keys), (track, sorted(weekly))
        for key in keys:
            add(track, key, weekly[key], 10)
        add(track, "exam-fund", SHARED["w2-4"] + SHARED["w3-3"] + FUND_EXTRA, 30)
        add(track, "exam-core", [q for k in keys[2:] for q in weekly[k]] + CORE_EXTRA[track], 40)
    def lit(s):
        assert ";" not in s and "$q$" not in s, s
        return "$q$" + s + "$q$"
    out = ["-- Jobnest Academy update 28c: question banks for the 20-week programme (generated by dev/quiz_bank_v2.py).",
           "-- Weekly assessments draw 5 per learner. exam-fund: Fundamental Examination (30 drawn). exam-core: Core Skill Learning Examination (40 drawn).",
           "delete from quiz_bank;",
           "insert into quiz_bank(track_code, key, qid, q, o, a) values"]
    out.append(",\n".join(f"({lit(t)},{lit(k)},{i},{lit(q)},array[{','.join(lit(x) for x in o)}],{a})" for t, k, i, q, o, a in rows) + ";")
    out.append("select count(*) || ' questions in the bank' as done from quiz_bank;")
    (root / "supabase/28c_question_banks.sql").write_text("\n".join(out) + "\n")
    from collections import Counter
    c = Counter((t, k) for t, k, *_ in rows)
    print(len(rows), "questions")
    for t in ["BOP", "PTA", "CSG"]:
        print(t, {k: n for (tt, k), n in c.items() if tt == t})
