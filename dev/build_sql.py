"""Builds supabase/03_seed.sql and the one-file supabase/setup.sql from the parts."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
q = lambda s: "'" + str(s).replace("'", "''") + "'"
bank = json.load(open(root / 'dev/readiness_bank.json'))
tpl = json.load(open(root / 'dev/email_templates.json'))
CTA = {'received': 'Take the readiness assessment', 'passed': 'Book your Discovery Call', 'times': 'Book your Discovery Call',
       'offer': 'Accept and pay', 'reminder': 'Accept and pay', 'admitted': 'Set your password', 'invite': 'Apply now',
       'apps_open': 'Apply now'}
out = ["-- Jobnest Academy: starting data",
       "-- BEFORE RUNNING: replace the two values on the next lines with your own email and name.",
       "-- That email becomes the first Super Admin, who can then add every other staff member.",
       "do $$ begin",
       "  insert into staff(email, full_name, role) values (lower('CHANGE-ME@example.com'), 'CHANGE ME', 'super')",
       "  on conflict (email) do update set role = 'super', active = true;",
       "end $$;", "",
       "insert into app_settings(key, value) values",
       "  ('site_url', 'https://academy.jobnestcareers.com'),",
       "  ('website_url', 'https://jobnestcareers.com'),",
       "  ('zuri_url', 'https://claude.ai/artifact/Ag9JUMv7Zs1BLpoSctN15v')",
       "on conflict (key) do nothing;", "",
       "insert into programmes(code, name, weeks, status, tagline, fee, inst_pct, sort) values",
       "  ('GEP', 'Graduate Employability Programme', 17, 'Live', 'From graduate to work-ready: skills, a client project, an internship and coaching.', 85000, 6, 1)",
       "on conflict (code) do nothing;", "",
       "insert into cohorts(programme_code, name, start_date, year2, batch, applications_open, is_current)",
       "select 'GEP', 'Cohort 1 · Jan 2027', date '2027-01-11', '27', 'A', true, true",
       "where not exists (select 1 from cohorts);", "",
       "insert into tracks(code, programme_code, name, seats, sort) values",
       "  ('ADM', 'GEP', 'Administrative Support', 30, 1), ('CSP', 'GEP', 'Customer Support', 30, 2),",
       "  ('DAT', 'GEP', 'Data Analysis', 30, 3), ('DMK', 'GEP', 'Digital Marketing', 30, 4)",
       "on conflict (code) do nothing;", "",
       "insert into readiness_bank(cat, concept, question, options)",
       "select * from (values"]
rows = []
for cat, concepts in bank.items():
    for c in concepts:
        for v in c['v']:
            rows.append(f"  ({q(cat)}, {q(c['c'])}, {q(v[0])}, {q(json.dumps(v[1:], ensure_ascii=False))}::jsonb)")
out.append(",\n".join(rows))
out += [") v where not exists (select 1 from readiness_bank);", "",
        "insert into email_templates(key, subject, body, cta) values"]
trows = []
for k, t in tpl.items():
    if k.startswith('letter_'): continue
    trows.append(f"  ({q(k)}, {q(t['s'])}, {q(t['b'])}, {q(CTA.get(k, 'View your application'))})")
out.append(",\n".join(trows))
out.append("on conflict (key) do nothing;")
(root / 'supabase/03_seed.sql').write_text("\n".join(out) + "\n")
parts = [(root / f'supabase/{n}').read_text() for n in ['01_schema.sql', '02_functions.sql', '03_seed.sql', '04_email_sending.sql', '05_payments.sql', '06_portal.sql', '07_timer_tour.sql', '08_five_minutes.sql', '09_test_unlock.sql', '10_continue.sql', '11_calls.sql', '12_certificates.sql', '13_landing.sql', '14_learning.sql', '15_phase2.sql', '16_jobsearch.sql', '17_graduation.sql', '18_cert_matric.sql', '19_feedback.sql', '19b_quiz_bank.sql', '20_community.sql', '21_updates.sql', '22_platform_links.sql', '23_test_mode.sql', '24_super_admin.sql']]
(root / 'supabase/setup.sql').write_text("-- Jobnest Academy: full database setup. Paste into Supabase → SQL Editor → Run.\n\n" + "\n\n".join(parts))
print('rows', len(rows), 'templates', len(trows))
