# Sample files for the week tasks (placeholders until facilitators upload their own).
# All people and companies are fictional. Run: python3 dev/course_v2/samples.py -> writes public/samples/
import csv, io, pathlib, random
root = pathlib.Path(__file__).resolve().parents[2] / "public" / "samples"
F = {}
def txt(path, body): F[path] = body.strip() + "\n"
def table(path, head, rows):
    b = io.StringIO(); w = csv.writer(b); w.writerow(head); w.writerows(rows); F[path] = b.getvalue()

NOTE = "SAMPLE FILE · Jobnest Academy · fictional people and companies, for practice only.\n\n"

# ---------- Fundamentals ----------
txt("common/w2-messy-email.txt", NOTE + """
WEEK 2 PROJECT: REWRITE THIS EMAIL

From: Tolu (Admin Assistant)
To: Mrs Adaeze Nwosu (Head of Operations)
Subject: hello

good morning ma hope you are fine. so about the thing we discussed on monday i have been trying to get the venue people they are not picking but i sent whatsapp also. also the printer on 2nd floor is not working since last week and people are complaining and the toner guy said he will come but he didnt come. Also for the training next month do we still want 40 people or 25 because the venue need to know but i dont know the budget yet and finance said they will revert. please let me know asap. also can i take friday off. thanks

YOUR TASK
1. Split this into clear emails (one topic each) with subject lines that state the ask.
2. Keep each one short, with a clear next step and a date.
3. Paste your rewritten emails into a Google Doc and share the link.
""")

# ---------- Business Operations ----------
txt("BOP/w4-manager-week.txt", NOTE + """
WEEK 4 TASK: ORGANISE A MANAGER'S INBOX AND WEEK

Your manager: Mr Kunle Bakare, Head of Partnerships, Brightpath Logistics Ltd (Lagos).
Works 08:30-17:30 WAT. Wants 2 hours of focus time every morning before 11:00.
Travels to Abuja next Thursday (flight 07:15, back Friday evening).

THIS WEEK'S EMAILS (15)
1. Finance: Q3 budget review, needs his approval by Wednesday
2. Client (Harbour Foods): asks to move Tuesday's call to Wednesday 14:00
3. Newsletter: Logistics Weekly
4. HR: reminder to complete his team's appraisals by Friday
5. Partner (Swift Freight, London): proposes a call Monday 10:00 London time
6. IT: password expires in 3 days
7. CEO: wants a 30-minute update on the Harbour Foods deal this week
8. Receipt: airline e-ticket for Abuja trip
9. Vendor: invoice #4471 for warehouse shelving, ₦1,250,000
10. Team member (Bisi): asks for a 1:1 to discuss workload
11. Conference: invitation to speak at a logistics summit in November
12. Newsletter: Business Day morning brief
13. Client (Kano Agro): complaint about a late delivery, wants a call today
14. Admin: office closed Monday for maintenance (work from home)
15. Finance: expense report for last trip is missing two receipts

YOUR TASK
1. Create labels (e.g. To reply, Waiting on, Receipts, Read later) and say which email goes where.
2. Write two filters that would sort future emails automatically.
3. Build his week in a calendar: meetings, focus time, travel, and replies to the meeting requests above (watch the London time difference).
4. Share screenshots or a document showing your labels, filters and calendar.
""")
txt("BOP/w5-meeting-notes.txt", NOTE + """
WEEK 5 TASK: TURN THESE RAW NOTES INTO ONE PAGE OF MINUTES

Meeting: Monthly operations meeting, Brightpath Logistics
Date: Tuesday 10:00-11:05. Attendees: Adaeze N. (chair), Kunle B., Bisi O., Emeka U., Fatima S. Apologies: Segun A.

Raw notes (typed during the meeting):
- adaeze opened, last month minutes ok no changes
- fleet: 3 vans due for servicing, emeka says garage quote ₦840k, kunle wants second quote. agreed emeka gets 2nd quote by friday
- fuel spend up 18% vs last month. fatima thinks it's routes not price. fatima to pull route report for next meeting
- warehouse: shelving delivered but invoice wrong (says 12 units, got 10). bisi to call vendor this week, dont pay until fixed
- new customer Harbour Foods starts 1st of next month, need 2 extra drivers. adaeze approved hiring 2 temp drivers, HR to post ad (bisi to brief HR by wed)
- staff party discussed, no decision, park till next meeting
- AOB: office closed monday for maintenance, everyone WFH
- next meeting same time next month

YOUR TASK
Write minutes in Google Docs or Word: attendees, decisions, and an action table (action, owner, due date). Keep it to one page. Share a link.
""")
items = [("A4 paper (ream)", "Stationery", 18, 20, 4200, 25), ("Printer toner (black)", "Printing", 2, 3, 38000, 2), ("Blue pens (box of 50)", "Stationery", 6, 4, 3500, 1),
         ("Staples (box)", "Stationery", 9, 5, 900, 1), ("Hand sanitiser (5L)", "Cleaning", 1, 2, 12500, 1), ("Tissue (pack of 12)", "Cleaning", 7, 6, 6800, 3),
         ("Bottled water (pack of 12)", "Kitchen", 15, 20, 2600, 30), ("Tea bags (box of 100)", "Kitchen", 3, 2, 4500, 1), ("Sugar (1kg)", "Kitchen", 2, 3, 1900, 2),
         ("Box files", "Filing", 22, 10, 1500, 4), ("Sticky notes (pack)", "Stationery", 4, 6, 1200, 3), ("Printer toner (colour)", "Printing", 1, 2, 52000, 1),
         ("Bin bags (roll)", "Cleaning", 5, 4, 1800, 3), ("Envelopes A4 (pack of 50)", "Stationery", 3, 2, 4800, 1), ("Dishwashing liquid", "Cleaning", 2, 2, 2200, 2)]
table("BOP/w6-office-supplies.csv", ["Item", "Category", "In stock", "Reorder level", "Unit cost (NGN)", "Used per month"], items)
txt("BOP/w7-abuja-trip-brief.txt", NOTE + """
WEEK 7 TASK: PLAN A 2-DAY ABUJA TRIP

Traveller: Mr Kunle Bakare, Head of Partnerships.
Dates: Thursday and Friday next week. Budget: ₦650,000 all in.
Thursday: 11:00 meeting at the client's office in Wuse 2, 15:00 meeting in Maitama. Friday: 09:30 breakfast meeting at the hotel, free afternoon, fly back after 16:00.
Preferences: aisle seat, hotel within 15 minutes of Wuse 2, airport pick-up, receipts for every expense.

Use the hotel quotes in w7-hotel-quotes.csv.

YOUR TASK
1. An itinerary (times, places, transport, contacts).
2. An estimated budget table (flights, hotel, transport, meals, contingency).
3. A comparison of the three hotels with your recommendation and why.
Share a link to your work.
""")
table("BOP/w7-hotel-quotes.csv", ["Hotel (fictional)", "Area", "Rate per night (NGN)", "Breakfast included", "Airport pick-up (NGN)", "Distance to Wuse 2", "Guest rating /10"],
      [("Capital Crest Suites", "Wuse 2", 145000, "Yes", 25000, "5 min", 8.4), ("Maitama Grove Hotel", "Maitama", 120000, "No", 30000, "15 min", 8.9), ("Asokoro Palms Inn", "Asokoro", 98000, "Yes", 35000, "25 min", 7.6)])
txt("BOP/w8-office-relocation-brief.txt", NOTE + """
WEEK 8 TASK: PLAN AN OFFICE RELOCATION

Brightpath Logistics is moving its Lagos head office (35 staff) from Yaba to Lekki Phase 1 in 6 weeks.
Must happen: new lease signed (done), internet installed at the new office, furniture moved, IT equipment moved and tested,
staff informed, clients told about the new address, old office cleaned and handed back. Move weekend: Saturday-Sunday of week 5.
Budget owner: Mrs Adaeze Nwosu. IT lead: Emeka. Facilities: Bisi. HR: Fatima.
Risk: the internet provider says installation can take "2 to 4 weeks".

YOUR TASK
1. A task plan with owners and due dates, and a simple timeline (Trello, Asana or a sheet).
2. A RACI for the 5 biggest tasks.
3. A one-paragraph status report for the end of week 2 that flags the internet risk.
Share a link.
""")
txt("BOP/w9-supplier-onboarding-notes.txt", NOTE + """
WEEK 9 TASK: WRITE AN SOP FROM THESE NOTES

How we add a new supplier today (from a chat with Bisi, Facilities):
"Someone asks for a new supplier, usually by WhatsApp. We ask the supplier for their CAC certificate, bank details on letterhead and two references.
Sometimes we forget the references. Finance needs the bank details form signed before they'll pay. Then I add them to the supplier list in the shared sheet.
If the order is over ₦500,000 Mrs Nwosu has to approve the supplier first. Last month we paid a supplier twice because they were on the list twice."

YOUR TASK
1. A one-page SOP: purpose, owner, steps (short actions), and a checklist of documents.
2. A simple process map (boxes and arrows) including the approval step over ₦500,000.
3. One improvement that stops duplicate suppliers.
Share a link.
""")
txt("BOP/w10-executive-week.txt", NOTE + """
WEEK 10 TASK: BRIEFING PACK FOR AN EXECUTIVE

Your executive: Dr Ronke Ademola, CEO of Brightpath Logistics. Next week:
- Monday: board pre-meeting with the Chairman (10:00), staff town hall (16:00)
- Tuesday: interview final candidate for Finance Manager (11:00); dinner with Harbour Foods MD (19:00)
- Wednesday: board meeting (09:00-13:00), needs the Q3 report printed and the deck approved by Tuesday noon
- Thursday: in Abuja (see the travel team), return Friday morning
- Friday: 1:1s with three direct reports (afternoon)
Open items: approve the Q3 deck; decide on the November logistics summit speaking invite (deadline Wednesday);
sign the warehouse lease renewal (legal says by Friday); reply to a journalist asking for comment on fuel prices (she prefers to decline politely).

YOUR TASK
Prepare a weekly briefing pack: priorities, the week's meetings with what she needs for each, decisions needed (with deadlines), and follow-ups. Share a link.
""")
random.seed(7)
pc = [("2026-11-02", "Opening float", "", 50000, "Bisi O.", "-"), ("2026-11-03", "Taxi to bank", "Transport", -4500, "Tolu", "R-101"),
      ("2026-11-04", "Printer paper (2 reams)", "Stationery", -8400, "Tolu", "R-102"), ("2026-11-05", "Water for meeting", "Kitchen", -5200, "Bisi O.", "R-103"),
      ("2026-11-09", "Courier to Ikeja", "Postage", -6000, "Emeka U.", "R-104"), ("2026-11-10", "Bulbs for store room", "Repairs", -7500, "Bisi O.", ""),
      ("2026-11-12", "Lunch for visiting client", "Hospitality", -12500, "Kunle B.", "R-106"), ("2026-11-16", "Taxi to supplier", "Transport", -3800, "Tolu", "R-107"),
      ("2026-11-18", "Top-up from Finance", "", 30000, "Bisi O.", "-"), ("2026-11-20", "Cleaning supplies", "Cleaning", -9100, "Bisi O.", "R-109"),
      ("2026-11-24", "Stamp duty for documents", "Admin", -2500, "Tolu", "R-110"), ("2026-11-27", "Snacks for team meeting", "Kitchen", -6700, "Fatima S.", "R-111")]
table("BOP/w11-petty-cash.csv", ["Date", "Description", "Category", "Amount (NGN)", "Received by", "Receipt no."], pc)
txt("BOP/w11-petty-cash-note.txt", NOTE + """
WEEK 11 TASK: RECORDS AND PETTY CASH

1. Set up a records folder structure for a small office (finance, HR, suppliers, contracts, operations) with a naming rule.
2. Use w11-petty-cash.csv to build a petty cash log with a running balance.
3. Cash counted in the box on 30 November: ₦14,800. Reconcile: does it match? Note anything missing (look at the receipts column).
Share a link.
""")

# ---------- People & Talent ----------
txt("PTA/w4-role-brief-junior-accountant.txt", NOTE + """
WEEK 4 TASK: MAP THE RECRUITMENT LIFECYCLE

Company: Okoye & Partners, a 40-person accounting and advisory firm in Ikeja, Lagos.
Role: Junior Accountant (1 hire), reporting to the Finance Manager, Mrs Grace Okoye.
Why: one accountant resigned; month-end close is starting to slip. Target start: within 8 weeks.
The Finance Manager wants to see 5 strong candidates. HR is one person (you support her).

YOUR TASK
Draw the full lifecycle for this role: need, job description, sourcing, screening, interviews, offer, onboarding.
For each stage give the owner and a target time, so the whole process fits in 8 weeks. Share a link.
""")
txt("PTA/w5-role-brief-customer-service-officer.txt", NOTE + """
WEEK 5 TASK: JOB DESCRIPTION AND JOB AD

Company: Paylane, a fictional fintech with 120 staff in Lagos, offering a mobile payments app for small shops.
Role: Customer Service Officer (3 hires), reporting to the Customer Experience Lead.
Hybrid: 3 days in the Victoria Island office. Shifts between 08:00 and 20:00, one Saturday a month.
Day to day: answer customers on chat, email and phone; resolve payment issues; escalate fraud reports; log every ticket in Freshdesk.
Must-haves: excellent written English, calm under pressure, comfortable with apps and spreadsheets.
Nice to have: Yoruba, Igbo or Hausa; previous support or banking experience.
Salary band: ₦250,000-₦320,000 a month plus HMO.

YOUR TASK
1. A full job description (purpose, responsibilities, requirements, reporting line, location).
2. A short job ad (under 200 words) that would make the right people apply. Share a link.
""")
txt("PTA/w6-sourcing-brief.txt", NOTE + """
WEEK 6 TASK: SOURCE CANDIDATES

Role: Recruitment Coordinator at Okoye & Partners (Lagos, on-site).
Looking for: 1-3 years in recruitment, HR or admin; experience scheduling interviews; strong communication; based in Lagos.
Not suitable: interns, or people only in sales roles.

YOUR TASK
1. Write a Boolean search string for LinkedIn using AND, OR, NOT and quotes.
2. Build a sourcing sheet with 15 suitable profiles you find: name, current title, profile link, why they fit, status, next follow-up date.
   Record names and public profile links only. Do not collect phone numbers or personal emails.
3. Write one short outreach message. Share a link.
""")
cvs = [
 ("Chiamaka Obi", "B.Sc Accounting, UNN (2:1)", "ICAN student (Skills level)", "2 yrs Accounts Assistant, a Lagos FMCG distributor: bank reconciliations, payables, month-end support", "Excel (pivot tables, VLOOKUP), QuickBooks", "Lagos"),
 ("Ibrahim Danladi", "HND Accountancy, Kaduna Polytechnic", "None yet", "1 yr NYSC at a state ministry: filing vouchers, data entry", "Excel (basic)", "Abuja, open to relocate"),
 ("Funmilayo Ajayi", "B.Sc Economics, UNILAG (2:1)", "ACCA (3 papers passed)", "18 months Finance Intern then Junior Analyst at a fintech: reconciliations, reporting", "Excel (advanced), Power BI", "Lagos"),
 ("Peter Eze", "B.Sc Accounting, UNIBEN (3rd class)", "ICAN (Professional level)", "4 yrs Accountant at a hotel: full bookkeeping, payroll, tax filings", "Sage, Excel", "Lagos"),
 ("Aisha Bello", "B.Sc Business Admin, BUK (2:2)", "None", "2 yrs Customer Service at a bank", "Excel (basic), CRM", "Kano"),
 ("Tunde Fasanmi", "B.Sc Accounting, OAU (2:1)", "ICAN student", "1 yr Audit Trainee at a mid-size audit firm: vouching, working papers", "Excel, CaseWare", "Lagos"),
 ("Ngozi Nnamdi", "B.Sc Accounting, ABSU (2:1)", "None", "Career break 2023-2024 (caring for a family member). Before that 1 yr Accounts Clerk at a school", "Excel, QuickBooks", "Lagos"),
 ("David Okon", "M.Sc Finance, UK university", "CFA Level 1", "3 yrs Investment Analyst; wants a career change", "Excel, Bloomberg", "Lagos"),
]
txt("PTA/w7-sample-cvs.txt", NOTE + "WEEK 7 TASK: SCREEN THESE 8 CVs\n\nRole: Junior Accountant, Okoye & Partners (Ikeja, on-site).\nMust-haves: accounting degree or HND, at least 1 year of accounts or audit work, good Excel, based in or able to work in Lagos.\nNice to have: ICAN or ACCA progress, QuickBooks or Sage.\n\n"
    + "\n\n".join(f"CV {i}: {n}\n- Education: {e}\n- Professional exams: {x}\n- Experience: {w}\n- Tools: {t}\n- Location: {l}" for i, (n, e, x, w, t, l) in enumerate(cvs, 1))
    + "\n\nYOUR TASK\n1. Build a scorecard from the must-haves and nice-to-haves and score every CV.\n2. Write a shortlist summary of your top 3 for the hiring manager (strengths, gaps, questions to ask).\n3. Note anything you would ask about neutrally, without assuming (e.g. a career break). Share a link.\n")
table("PTA/w8-interview-availability.csv", ["Person", "Role in process", "Mon", "Tue", "Wed", "Thu", "Fri"],
      [("Grace Okoye", "Interviewer (Finance Manager)", "14:00-17:00", "Busy", "09:00-12:00", "Busy", "10:00-13:00"),
       ("Samuel Adeyemi", "Interviewer (Senior Accountant)", "09:00-12:00", "10:00-15:00", "Busy", "13:00-17:00", "Busy"),
       ("Halima Yusuf", "Interviewer (HR)", "All day", "All day", "09:00-11:00", "All day", "All day"),
       ("Chiamaka Obi", "Candidate", "After 15:00", "Any time", "Morning only", "Any time", "Not available"),
       ("Funmilayo Ajayi", "Candidate", "Not available", "10:00-14:00", "Any time", "Any time", "Morning only"),
       ("Tunde Fasanmi", "Candidate", "Morning only", "Afternoon only", "Any time", "Not available", "Any time"),
       ("Peter Eze", "Candidate", "Any time", "Any time", "Not available", "After 14:00", "Any time")])
txt("PTA/w8-interview-brief.txt", NOTE + """
WEEK 8 TASK: SCHEDULE INTERVIEWS

Each candidate has one 45-minute panel interview with all 3 interviewers, in person at the Ikeja office, this week.
Use w8-interview-availability.csv.

YOUR TASK
1. An interview schedule that works for everyone (leave 15 minutes between interviews).
2. An invitation email for one candidate (date, time, place, panel, what to bring).
3. A kind, clear rejection email for a candidate who wasn't selected after interview. Share a link.
""")
txt("PTA/w9-new-hire-details.txt", NOTE + """
WEEK 9 TASK: OFFER AND ONBOARDING

New hire: Chiamaka Obi, Junior Accountant, Okoye & Partners. Reports to Grace Okoye (Finance Manager).
Agreed: ₦380,000 a month gross, HMO from day one, 6-month probation, start date the first Monday of next month, 08:30-17:00 Mon-Fri, Ikeja office.
Needs: laptop, email account, QuickBooks login, building access card, a buddy (Samuel Adeyemi).

YOUR TASK
1. A draft offer letter template using these details (leave clear placeholders like [Name]).
2. An onboarding checklist for before day one, day one, week one and week two, with owners.
3. A reminder plan for the probation review. Share a link.
""")
txt("PTA/w10-sample-leave-policy.txt", NOTE + """
OKOYE & PARTNERS: LEAVE POLICY (SAMPLE, FICTIONAL)

1. Annual leave. Full-time staff get 15 working days of annual leave a year after 12 months of continuous service. Staff in their first year earn leave pro rata after probation. Leave must be requested in the HR system at least 2 weeks ahead and approved by your line manager. Up to 5 unused days can be carried into the next year and must be used by 31 March.
2. Sick leave. Tell your manager before 09:00 on the first day. A doctor's note is needed for more than 2 days in a row. Paid sick leave is up to 12 working days a year.
3. Maternity leave. 16 weeks, paid in full. Please tell HR at least 8 weeks before you plan to start.
4. Paternity leave. 10 working days, to be taken within 3 months of the birth.
5. Compassionate leave. Up to 5 working days for the death of a close family member.
6. Public holidays. All gazetted Nigerian public holidays are paid days off.
7. Unauthorised absence may lead to disciplinary action under the Code of Conduct.

WEEK 10 TASK
1. Turn this policy into a one-page FAQ for staff (questions people really ask).
2. List 5 rules for handling employee data safely, in line with the Nigeria Data Protection Act (NDPA).
Note: this policy is fictional. Real entitlements depend on the employer's contract and Nigerian law. Check with HR leadership or a legal adviser. Share a link.
""")
random.seed(11)
hd = []
roles = [("Junior Accountant", "Finance"), ("Customer Service Officer", "Customer Experience"), ("Sales Executive", "Sales"), ("HR Assistant", "HR"), ("Driver", "Operations"), ("Data Analyst", "Finance")]
sources = ["Job board", "LinkedIn", "Referral", "Agency", "Careers page"]
for i in range(1, 25):
    r, d = random.choice(roles); src = random.choice(sources)
    opened = f"2026-{random.choice(['07','08','09','10'])}-{random.randint(1,28):02d}"
    days = random.randint(18, 70); cost = {"Agency": random.randint(250, 450) * 1000, "Job board": random.randint(30, 80) * 1000, "LinkedIn": random.randint(40, 120) * 1000, "Referral": 50000, "Careers page": 10000}[src]
    acc = "Yes" if random.random() > 0.2 else "No"; left = "Yes" if acc == "Yes" and random.random() < 0.12 else ("No" if acc == "Yes" else "")
    hd.append((f"REQ-{100+i}", r, d, opened, src, days, cost, acc, left))
table("PTA/w11-hiring-data.csv", ["Requisition", "Role", "Department", "Opened", "Source of hire", "Days to fill", "Cost (NGN)", "Offer accepted", "Left within 90 days"], hd)

# ---------- Customer Success & Growth ----------
txt("CSG/w4-angry-customer-replies.txt", NOTE + """
WEEK 4 TASK: REWRITE THESE 3 REPLIES

1. Customer: "I ordered a blender 9 days ago, you said 3-5 days. Where is it??? Worst service ever."
   Agent reply: "Dear customer, delays happen. Please be patient. Regards."
2. Customer: "You charged my card twice for the same order. I want my money back today."
   Agent reply: "We are very very sorry!!! So sorry for this. We apologise. Please send your account number, BVN and card PIN so we can check."
3. Customer: "The shoes I got are the wrong size. Your return page doesn't load."
   Agent reply: "Return policy is on the website."

YOUR TASK
Rewrite each reply so it is empathetic (without over-apologising), clear, safe (never ask for a PIN), and gives the next step with a timeline. Share a link.
""")
txt("CSG/w5-store-brief.txt", NOTE + """
WEEK 5 TASK: SET UP A HELP DESK

Store: Kora Home, a fictional online homeware store in Lagos (about 400 orders a week).
Most common contacts last month: where is my order (41%), returns and refunds (22%), wrong or damaged item (14%), payment problems (11%), product questions (8%), other (4%).
Promise to customers: first reply within 4 working hours on email, 2 minutes on chat.

YOUR TASK
1. Ticket categories and tags.
2. 5 macros (saved replies) for the most common contacts.
3. A priority guide (what is urgent, high, normal, low) with target response times. Share a link or screenshots.
""")
txt("CSG/w6-delayed-delivery-scenario.txt", NOTE + """
WEEK 6 TASK: LIVE CHAT SCRIPT

Scenario: Mrs Amaka Udeh ordered a standing fan (order KH-20931) for delivery yesterday. The courier's system shows "failed delivery, customer unavailable", but she says she was home all day. She is upset because she is hosting guests tomorrow.
What you can offer: rebook delivery for tomorrow 09:00-13:00, or a full refund. You can also offer free delivery on her next order.

YOUR TASK
Write the full chat from greeting to close: acknowledge, check details safely, offer options, confirm, and close cleanly. Share a link.
""")
table("CSG/w7-weekly-support-report.csv", ["Day", "Tickets received", "Tickets solved", "First response time (mins)", "CSAT (%)", "Reopened tickets", "Top reason"],
      [("Mon", 182, 160, 38, 86, 6, "Where is my order"), ("Tue", 175, 171, 31, 88, 4, "Where is my order"), ("Wed", 240, 190, 95, 71, 15, "Payment failed"),
       ("Thu", 228, 205, 82, 74, 12, "Payment failed"), ("Fri", 196, 199, 40, 85, 5, "Returns"), ("Sat", 98, 90, 52, 83, 3, "Where is my order"), ("Sun", 61, 40, 140, 69, 2, "Where is my order")])
txt("CSG/w8-payroll-app-customer.txt", NOTE + """
WEEK 8 TASK: 30-DAY ONBOARDING PLAN

Product: Paydesk, a fictional payroll app for Nigerian SMEs.
New customer: Greenfield Schools Ltd, 3 schools, 140 staff, currently pays salaries from spreadsheets.
Their goals: run their first payroll in Paydesk by the 25th of next month, file PAYE correctly, give staff digital payslips.
Contacts: Mr Obinna (Bursar, main user), Mrs Folake (Proprietor, decision-maker).
Risks: staff data is in 3 different spreadsheets; the Bursar is not confident with new software.

YOUR TASK
Design a 30-day onboarding plan: kickoff, data setup, training, a test payroll, go-live, and check-in points, with what success looks like at each step. Share a link.
""")
contacts = [("Adebayo Ogun", "Brightpath Logistics", "adebayo@brightpath.example", "08031234567", "Ikeja", "Lead"),
            ("adebayo ogun", "Brightpath Logistics Ltd", "Adebayo@Brightpath.example", "+2348031234567", "ikeja", "Lead"),
            ("Ifeoma Chukwu", "Kora Home", "ifeoma@korahome.example", "0802 555 0101", "Lekki", "Customer"),
            ("Musa Abdullahi", "Sahel Agro", "", "08065550199", "Kano", "Prospect"),
            ("Ifeoma Chukwu", "Kora Home", "ifeoma@korahome.example", "", "Lekki", "Customer"),
            ("Yemisi Adebayo", "Harbour Foods", "yemisi.a@harbourfoods.example", "0909 555 0122", "Apapa", ""),
            ("Grace Okoye", "Okoye & Partners", "grace@okoyepartners.example", "234-803-555-0144", "Ikeja", "Customer"),
            ("Chidi Nwankwo", "", "chidi.n@gmail.example", "07035550177", "Enugu", "Lead"),
            ("Fatima Sule", "Swift Freight", "fatima@swiftfreight.example", "08125550188", "Abuja", "Prospect"),
            ("FATIMA SULE", "Swift Freight", "fatima@swiftfreight.example", "0812 555 0188", "ABUJA", "prospect"),
            ("Kelechi Obi", "Greenfield Schools", "bursar@greenfield.example", "08095550111", "Owerri", "Customer"),
            ("Bola Adeyemi", "Lagoon Motors", "bola@lagoonmotors", "0816 555 0133", "Victoria Island", "Lead")]
table("CSG/w9-contact-list.csv", ["Name", "Company", "Email", "Phone", "City", "Lifecycle stage"], contacts)
txt("CSG/w10-logistics-app-brief.txt", NOTE + """
WEEK 10 TASK: PROSPECTING

Product: Routely, a fictional B2B app that plans delivery routes and tracks drivers for businesses with 5-100 vehicles.
Best customers so far: distributors and e-commerce companies in Lagos, Abuja and Port Harcourt with 10-50 vans, an operations manager, and fuel costs rising.
Price: from ₦150,000 a month. Free 14-day pilot.

YOUR TASK
1. Write an ideal customer profile (ICP).
2. Build a list of 15 target companies that fit (company, city, why they fit, who to contact by job title, source).
3. Write a 3-step cold email sequence (first email, follow-up after 3 days, final follow-up). Share a link.
""")
random.seed(5)
acct = []
for i, name in enumerate(["Kora Home", "Harbour Foods", "Okoye & Partners", "Greenfield Schools", "Sahel Agro", "Lagoon Motors", "Swift Freight", "Brightpath Logistics", "Delta Pharmacy", "Eko Bakes",
                          "Niger Bridge Builders", "Oasis Clinics", "Unity Microfinance", "Coral Fashion", "Benue Rice Mills", "Peak Gyms", "Atlas Courier", "Zenith Prints", "Sunrise Hotels", "Mainland Motors"], 1):
    plan = random.choice(["Starter", "Growth", "Business"]); mrr = {"Starter": 45000, "Growth": 120000, "Business": 300000}[plan]
    logins = random.randint(0, 60); tickets = random.randint(0, 9); nps = random.choice([10, 9, 9, 8, 7, 6, 5, 3, 2, ""])
    status = "Cancelled" if i in (6, 13) else "Active"; seats = random.randint(3, 25); limit = {"Starter": 5, "Growth": 15, "Business": 50}[plan]
    acct.append((name, plan, mrr, seats, limit, logins, tickets, nps, f"2027-{random.randint(1,6):02d}-{random.randint(1,28):02d}", status))
table("CSG/w11-account-data.csv", ["Account (fictional)", "Plan", "Monthly revenue (NGN)", "Users", "Plan user limit", "Logins last 30 days", "Open tickets", "Last NPS score", "Renewal date", "Status"], acct)

if __name__ == "__main__":
    for p, body in F.items():
        f = root / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(body, encoding="utf-8")
    print(len(F), "sample files written to", root)
