#!/bin/bash
# SQL-level test of the student portal. Run after dev/test_sql.sh and dev/test_pay.sh.
P="psql -h /var/tmp/jnpg -p 5433 -U postgres -d jn -v ON_ERROR_STOP=1 -qAt"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
srv() { $P -c "set role service_role;" -c "$1"; }
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
ADA=gep-27a-001@students.jobnestcareers.com; BEN=gep-27a-002@students.jobnestcareers.com
$P -c "update applications set track_code='CSP' where email='ben@test.ng'"
$P -c "update cohorts set start_date = current_date - 10"   # we're in week 2
as owner@test.ng "select super_save_staff('fola@test.ng','Fola Facil','facilitator',true,'DAT') is not null" >/dev/null
as owner@test.ng "select super_save_staff('cm@test.ng','Chi Manager','cohort_manager',true,null) is not null" >/dev/null
as owner@test.ng "select super_save_staff('tobi@test.ng','Tobi CSP','facilitator',true,'CSP') is not null" >/dev/null
echo "student login reserved: $(as owner@test.ng "select super_save_staff('x@students.jobnestcareers.com','X','facilitator')" 2>&1 | grep -o 'reserved.*')"
echo "anon campus: $(anon "select student_campus()" 2>&1 | grep -o 'permission denied.*')"
echo "staff as student: $(as fola@test.ng "select student_campus()" 2>&1 | grep -o 'Please sign in.*')"
echo "fola all-track lesson: $(as fola@test.ng "select acad_save_lesson('{\"week\":1,\"title\":\"Welcome\"}')" 2>&1 | grep -o 'only add.*')"
as fola@test.ng "select acad_save_lesson('{\"week\":1,\"track_code\":\"DAT\",\"kind\":\"video\",\"title\":\"Intro to spreadsheets\",\"url\":\"https://youtu.be/x\"}')" >/dev/null
as cm@test.ng "select acad_save_lesson('{\"week\":1,\"title\":\"Welcome to GEP\",\"body\":\"Read this first.\"}')" >/dev/null
as cm@test.ng "select acad_save_lesson('{\"week\":5,\"title\":\"Future week\"}')" >/dev/null
echo "bad url: $(as cm@test.ng "select acad_save_lesson('{\"week\":1,\"title\":\"x\",\"url\":\"javascript:alert(1)\"}')" 2>&1 | grep -o 'Links must.*')"
TID=$(as fola@test.ng "select acad_save_task('{\"week\":2,\"track_code\":\"DAT\",\"title\":\"Clean a dataset\",\"brief\":\"Share a Google Sheet\",\"due_at\":\"$(date -u -d '+2 days' +%FT%TZ)\"}')->>'id'" | tail -1)
as cm@test.ng "select acad_save_session('{\"title\":\"Week 2 live class\",\"starts_at\":\"$(date -u -d '+10 minutes' +%FT%TZ)\",\"minutes\":60,\"link\":\"https://meet.google.com/abc\"}')" >/dev/null
SID=$($P -c "select id from sessions limit 1")
C=$(as $ADA "select student_campus()" | tail -1)
echo "ada campus: $(echo $C | python3 -c 'import json,sys;c=json.load(sys.stdin);print(c["me"]["matric"],"week",c["week"],"open",c["open_weeks"],"lessons",[l["title"] for l in c["lessons"]],"tasks",len(c["tasks"]),"sessions",len(c["sessions"]))')"
C=$(as $BEN "select student_campus()" | tail -1)
echo "ben (CSP) campus: $(echo $C | python3 -c 'import json,sys;c=json.load(sys.stdin);print("lessons",[l["title"] for l in c["lessons"]],"tasks",len(c["tasks"]))')"
echo "ben submits DAT task: $(as $BEN "select student_submit($TID,'https://docs.google.com/x')" 2>&1 | grep -o 'not open.*')"
echo "ada bad link: $(as $ADA "select student_submit($TID,'my work')" 2>&1 | grep -o 'Links must.*')"
echo "ada submits: $(as $ADA "select student_submit($TID,'https://docs.google.com/sheet1','Done')->>'status'" | tail -1)"
XID=$($P -c "select id from submissions limit 1")
echo "tobi (CSP) cannot see: $(as tobi@test.ng "select jsonb_array_length(acad_submissions())" | tail -1)"
echo "tobi cannot grade: $(as tobi@test.ng "select acad_grade($XID,'passed',80,'Nice')" 2>&1 | grep -o "can't grade.*")"
echo "redo needs feedback: $(as fola@test.ng "select acad_grade($XID,'redo',null,'')" 2>&1 | grep -o 'Tell them.*')"
echo "fola grades redo: $(as fola@test.ng "select acad_grade($XID,'redo',40,'Remove the duplicate rows')->>'status'" | tail -1)"
echo "ada resubmits: $(as $ADA "select student_submit($TID,'https://docs.google.com/sheet2')->>'status'" | tail -1)"
echo "fola passes: $(as fola@test.ng "select acad_grade($XID,'passed',85,'Great')->>'status'" | tail -1)"
echo "ada cannot resubmit after pass: $(as $ADA "select student_submit($TID,'https://docs.google.com/sheet3')" 2>&1 | grep -o 'already passed.*')"
echo "ada joins: $(as $ADA "select student_join($SID)" | tail -1)"
echo "attendance list: $(as fola@test.ng "select jsonb_path_query_array(acad_attendance($SID)->'students','\$[*].joined_at != null')" | tail -1) (fola sees DAT only)"
MARKS=$($P -c "select jsonb_agg(jsonb_build_object('id',id,'status','present')) from applications where status='Admitted'")
echo "cm marks: $(as cm@test.ng "select acad_mark_attendance($SID, '$MARKS')" | tail -1)"
echo "announce emailed: $(as cm@test.ng "select acad_announce('Welcome to Week 2','Live class today at 10.',null,true)" | tail -1)"
echo "fola announce to CSP: $(as fola@test.ng "select acad_announce('x','y','CSP',false)" 2>&1 | grep -o 'only post.*')"
echo "students page: $(as cm@test.ng "select jsonb_path_query_array(acad_students()->'students','\$[*].matric')" | tail -1)"
echo "ada progress: $(as cm@test.ng "select jsonb_build_object('passed',s->'tasks_passed','attended',s->'sessions_attended','account',s->'account') from jsonb_array_elements(acad_students()->'students') s where s->>'matric'='GEP/27A/001'" | tail -1)"
echo "invite: $(as cm@test.ng "select acad_invite()" | tail -1) then again: $(as cm@test.ng "select acad_invite()" | tail -1)"
echo "officer blocked: $(as kemi@test.ng "select acad_students()" 2>&1 | grep -o 'Your role.*')"
REF=$($P -c "select ref from applications where email='ada@test.ng'"); TOK=$($P -c "select token from applications where email='ada@test.ng'")
echo "prepare (anon blocked): $(anon "select student_account_prepare('$REF','$TOK')" 2>&1 | grep -o 'permission denied.*')"
echo "prepare: $(srv "select student_account_prepare('$REF','$TOK')" | tail -1)"
srv "select student_account_saved('$REF','$TOK','11111111-1111-1111-1111-111111111111')" >/dev/null
echo "account set: $(anon "select applicant_view('$REF','$TOK')->>'account_set'" | tail -1)"
anon "select student_reset_request('gep/27a/001')" >/dev/null; anon "select student_reset_request('gep/27a/001')" >/dev/null; anon "select student_reset_request('NOPE')" >/dev/null
echo "reset emails: $($P -c "select count(*) from outbox where template='student_reset'") · link: $($P -c "select link from outbox where template='student_reset'")"
echo "templates queued: $($P -c "select string_agg(template||':'||n, ', ') from (select template, count(*) n from outbox where template in ('graded','announcement','portal_invite') group by 1) x")"
echo "graded email: $($P -c "select subject||' | '||replace(body,E'\n',' / ') from outbox where template='graded' order by id desc limit 1")"
