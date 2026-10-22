"""Local test data for the staff portal: ~60 admitted students mid-programme, applicants,
payments, help requests and staff. Local database only. Never run against production."""
import random, subprocess, json, datetime as dt
random.seed(7)
PSQL = ["psql", "-h", "/var/tmp/jnpg", "-p", "5433", "-U", "postgres", "-d", "jn", "-qAt", "-v", "ON_ERROR_STOP=1"]
def sql(q): r = subprocess.run(PSQL + ["-c", q], capture_output=True, text=True); assert r.returncode == 0, r.stderr; return r.stdout.strip()
def lit(s): return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

FIRST = ["Chiamaka", "Emeka", "Halima", "Tobi", "Grace", "Seun", "Zainab", "David", "Amaka", "Ibrahim", "Funmi", "Kelechi", "Aisha", "Tunde", "Ngozi", "Yusuf", "Blessing", "Femi",
         "Chidinma", "Musa", "Adaeze", "Bola", "Hauwa", "Ikenna", "Folake", "Sani", "Uche", "Temi", "Rukayat", "Obinna", "Esther", "Kunle", "Fatima", "Chuka", "Lola", "Bashir"]
LAST = ["Obi", "Nwosu", "Bello", "Adeleke", "Etim", "Afolabi", "Musa", "Okon", "Eze", "Lawal", "Adeyemi", "Okafor", "Danjuma", "Ogunleye", "Uche", "Abubakar", "Nnaji", "Balogun", "Ibe", "Yakubu"]
CITIES = ["Ikeja", "Yaba", "Surulere", "Lekki", "Ibadan", "Abeokuta", "Enugu", "Port Harcourt", "Abuja Municipal", "Kano", "Benin City", "Owerri"]

c = sql("select id from cohorts where is_current order by id desc limit 1")
start = (dt.date.today() - dt.timedelta(days=37))
sql(f"update cohorts set start_date = '{start}' where id = {c}")
tracks = ["BOP", "PTA", "CSG"]
items = {t: json.loads(sql(f"select coalesce(json_agg(json_build_object('k',key,'w',week,'t',type,'p',proj,'o',opt) order by week, key),'[]') from course_items where track_code='{t}'")) for t in tracks}

staff = [("tunde@test.ng", "Tunde Adewale", "facilitator", "BOP"), ("ngozi.f@test.ng", "Ngozi Eze", "facilitator", "CSG"), ("chidi@test.ng", "Chidi Uche", "facilitator", "PTA"),
         ("aisha@test.ng", "Aisha Lawal", "coach", None), ("ifeoma@test.ng", "Ifeoma Nnaji", "cohort_manager", None), ("folake@test.ng", "Folake Adeyemi", "director", None),
         ("sola@test.ng", "Sola Ibe", "academy_admin", None)]
for e, n, r, t in staff:
    sql(f"insert into staff(email, full_name, role, active, track_code, last_seen_at) values ({lit(e)}, {lit(n)}, '{r}', true, {lit(t)}, now() - interval '{random.randint(1, 3000)} minutes') on conflict (email) do nothing")

now = dt.datetime.now(dt.timezone.utc)
cur_cal = 6
n = 0
for t in tracks:
    for i in range({"BOP": 18, "PTA": 16, "CSG": 14}[t]):
        n += 1
        fn, ln = random.choice(FIRST), random.choice(LAST)
        matric = f"GEP/27A/{100 + n:03d}"
        plan = "two" if random.random() < 0.42 else "full"
        overdue = plan == "two" and random.random() < 0.25
        paid = 85000 if plan == "full" else (45000 if overdue else 90000)
        aid = sql(f"""insert into applications(ref, cohort_id, first_name, surname, email, phone, city, edu, nysc, situation, hours, laptop, internet, motivation, status,
            score, score_digital, score_comms, track_code, matric, plan, paid_total, admitted_at, created_at, dc1_at, dc1_note, account_set_at)
            values ('JNA-27-{random.randint(100000, 999999)}', {c}, {lit(fn)}, {lit(ln)}, '{fn.lower()}.{ln.lower()}{n}@example.com', '+23480{random.randint(10000000, 99999999)}', {lit(random.choice(CITIES))},
            'BSc', 'Completed', 'Graduate looking for work', 'Yes', 'Yes', 'Yes', 'I want a job in this field.', 'Admitted', {random.randint(62, 96)}, {random.randint(60, 100)}, {random.randint(60, 100)},
            '{t}', '{matric}', '{plan}', {paid}, now() - interval '{random.randint(60, 80)} days', now() - interval '{random.randint(80, 110)} days', now() - interval '70 days', 'Clear goals. Evenings are best.', now() - interval '40 days')
            returning id""").splitlines()[0]
        sql(f"insert into payments(application_id, reference, part, amount, amount_paid, status, channel, created_at) values ('{aid}', 'PSK-{n:04d}A', '{'full' if plan == 'full' else 'part1'}', {85000 if plan == 'full' else 45000}, {85000 if plan == 'full' else 45000}, 'success', 'card', now() - interval '{random.randint(60, 80)} days')")
        if plan == "two" and not overdue:
            sql(f"insert into payments(application_id, reference, part, amount, amount_paid, status, channel, created_at) values ('{aid}', 'PSK-{n:04d}B', 'part2', 45000, 45000, 'success', 'card', now() - interval '{random.randint(0, 12)} days')")
        # how far they got
        r = random.random()
        cur = cur_cal + (1 if r < .1 else 0) - (1 if r > .7 else 0) - (1 if r > .9 else 0)
        weak = random.random() < .15
        rows = []
        for it in items[t]:
            w = it["w"]
            if w > cur: continue
            if w == cur and random.random() < .45: continue
            when = now - dt.timedelta(days=(cur_cal - w) * 7 + random.randint(0, 4), hours=random.randint(0, 20))
            if it["t"] == "quiz":
                sc = random.randint(48, 75) if weak and w >= 4 else random.randint(68, 100)
                att = 2 if sc < 70 and w < cur else 1
                rows.append(f"('{aid}', '{it['k']}', {w}, 'done', {sc}, 1, '{json.dumps({'attempt': att})}'::jsonb, '{when.isoformat()}', null)")
            elif it["p"]:
                if w == cur and random.random() < .6:
                    rows.append(f"('{aid}', '{it['k']}', {w}, 'submitted', null, 1, null, '{when.isoformat()}', 'https://docs.example.com/x')")
                else:
                    sc = random.randint(45, 72) if weak and w >= 4 else random.randint(66, 98)
                    rows.append(f"('{aid}', '{it['k']}', {w}, 'graded', {sc}, 1, null, '{when.isoformat()}', 'https://docs.example.com/x')")
            else:
                rows.append(f"('{aid}', '{it['k']}', {w}, 'done', null, null, null, '{when.isoformat()}', null)")
        if rows:
            sql("insert into learn_progress(application_id, key, week, status, score, cap, data, done_at, link) values " + ",".join(rows) + " on conflict do nothing")
        for w in range(1, cur + 1):
            conf = max(1, min(5, (2 if weak else 4) + random.randint(-1, 1) - (1 if weak and w > 3 else 0)))
            sql(f"insert into learn_checkins(application_id, week, conf, at) values ('{aid}', {w}, {conf}, now() - interval '{(cur_cal - w) * 7} days') on conflict do nothing")
        if random.random() < .12:
            sql(f"insert into support_requests(application_id, category, subject, message, created_at) values ('{aid}', 'Course content', {lit(random.choice(['I cannot submit my project link', 'Question about the Week 5 assessment', 'Live class link not working', 'Can I get an extension?']))}, 'Please help.', now() - interval '{random.randint(2, 50)} hours')")

for k in range(14):
    fn, ln = random.choice(FIRST), random.choice(LAST)
    st = random.choice(["Under review", "Under review", "Call to book", "Call to book", "Offer sent", "Assessment pending", "Call booked"])
    sql(f"""insert into applications(ref, cohort_id, first_name, surname, email, phone, city, edu, nysc, situation, hours, laptop, internet, motivation, status, score, created_at, updated_at, track_code)
        values ('JNA-27-{random.randint(100000, 999999)}', {c}, {lit(fn)}, {lit(ln)}, '{fn.lower()}{k}@applicant.example.com', '+23481{random.randint(10000000, 99999999)}', 'Ikeja', 'BSc', 'Completed', 'Graduate looking for work', 'Yes', 'Yes', 'Yes', 'Keen to learn.', '{st}',
        {random.randint(60, 95)}, now() - interval '{random.randint(0, 11)} days' - interval '{random.randint(0, 20)} hours', now() - interval '{random.randint(1, 60)} hours', '{random.choice(tracks)}')""")
sql("insert into outbox(to_email, template, subject, body, error, created_at) values ('bad@@example', 'offer', 'Your offer', 'x', 'Invalid email address', now() - interval '5 hours')")
sql("insert into audit_log(actor, text, at) values ('ngozi.f@test.ng', 'graded 4 Customer Support projects', now() - interval '40 minutes'), ('bayo@test.ng', 'sent 3 admission offers', now() - interval '2 hours')")
print("seeded", n, "students")
