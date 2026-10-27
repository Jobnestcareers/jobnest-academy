#!/bin/bash
# SQL-level test of update 30: live classes, class code, catch-up, attendance marks, question approval.
# Run after dev/test_portal.sh (it needs the two admitted students GEP/27A/001 and 002).
P="psql -h /var/tmp/jnpg -p 5433 -U postgres -d jn -v ON_ERROR_STOP=1 -qAt"
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2" | tail -n +2; }
ADA=gep-27a-001@students.jobnestcareers.com; BEN=gep-27a-002@students.jobnestcareers.com
AID=$($P -c "select id from applications where matric='GEP/27A/001'"); BID=$($P -c "select id from applications where matric='GEP/27A/002'"); CID=$($P -c "select cohort_id from applications where matric='GEP/27A/001'")
FAIL=0; check() { if [ "$2" == "$3" ]; then echo "ok   $1: $2"; else echo "FAIL $1: got [$2] want [$3]"; FAIL=1; fi; }

$P -c "update applications set track_code='BOP' where id='$AID'; update applications set track_code='PTA' where id='$BID'"
$P -c "update applications set fee_due_override = current_date + 365 where id in ('$AID','$BID')"
$P -c "update cohorts set start_date = date_trunc('week', current_date)::date - 21 where id = $CID"   # this week is week 4
$P -c "insert into app_settings(key,value) values ('unlock_weeks','on'),('week_dates','off') on conflict (key) do update set value=excluded.value"
$P -c "delete from sessions; delete from quiz_draws; delete from learn_progress where key like 'w%-%'"
as owner@test.ng "select super_save_staff('bo@test.ng','Bola BOP','facilitator',true,'BOP') is not null" >/dev/null
as owner@test.ng "select super_save_staff('pt@test.ng','Pat PTA','facilitator',true,'PTA') is not null" >/dev/null
as owner@test.ng "select super_save_staff('cm@test.ng','Chi Manager','cohort_manager',true,null) is not null" >/dev/null
as owner@test.ng "select super_save_staff('dir@test.ng','Dayo Director','director',true,null) is not null" >/dev/null
# Test mode lets the code and join work at any time; switch it off for the timing rules below.
$P -c "insert into app_settings(key,value) values ('unlock_weeks','off'),('week_dates','on') on conflict (key) do update set value=excluded.value"

echo "--- setting up classes"
mk() { as "$1" "select (acad_save_session('$2'::jsonb))->>'id'"; }
C1=$(mk bo@test.ng "{\"title\":\"Calendar basics\",\"kind\":\"class\",\"track_code\":\"BOP\",\"starts_at\":\"$($P -c "select now() - interval '10 minutes'")\",\"minutes\":60,\"link\":\"https://meet.example.com/a\",\"summary\":\"Book meetings\",\"notes\":\"Notes here\",\"notes_early\":false,\"slides\":{\"name\":\"Slides\",\"url\":\"https://files.example.com/s.pdf\",\"kind\":\"pdf\"},\"resources\":[{\"name\":\"Template\",\"url\":\"https://files.example.com/t.xlsx\",\"kind\":\"xlsx\"},{\"name\":\"bad\",\"url\":\"\"}]}")
check "facilitator creates own-track class" "$([ -n "$C1" ] && echo yes)" "yes"
check "facilitator can't create for another track" "$(as pt@test.ng "select acad_save_session('{\"title\":\"x\",\"track_code\":\"BOP\",\"starts_at\":\"2027-01-01T12:00:00Z\"}')" 2>&1 | grep -o 'your own track')" "your own track"
check "facilitator can't create a class for everyone" "$(as bo@test.ng "select acad_save_session('{\"title\":\"x\",\"starts_at\":\"2027-01-01T12:00:00Z\"}')" 2>&1 | grep -o 'Cohort Manager')" "Cohort Manager"
CS=$(mk cm@test.ng "{\"title\":\"Shared class\",\"kind\":\"class\",\"starts_at\":\"$($P -c "select now() + interval '2 days'")\",\"minutes\":60,\"link\":\"https://meet.example.com/s\",\"notes\":\"Early notes\"}")
check "cohort manager creates a class for everyone" "$([ -n "$CS" ] && echo yes)" "yes"
check "empty resources dropped, files kept" "$($P -c "select jsonb_array_length(resources) || ' ' || (slides->>'kind') from sessions where id=$C1")" "1 PDF"
check "week worked out from the date" "$(as $ADA "select x->>'week' from jsonb_array_elements(student_campus()->'sessions') x where (x->>'id')::int=$C1")" "4"
check "BOP class hidden from PTA learner" "$(as $BEN "select count(*) from jsonb_array_elements(student_campus()->'sessions') x where (x->>'id')::int=$C1")" "0"
check "shared class seen by PTA learner" "$(as $BEN "select count(*) from jsonb_array_elements(student_campus()->'sessions') x where (x->>'id')::int=$CS")" "1"
check "early notes shown when allowed" "$(as $BEN "select x->>'notes' from jsonb_array_elements(student_campus()->'sessions') x where (x->>'id')::int=$CS")" "Early notes"
$P -c "update sessions set starts_at = now() + interval '1 hour' where id=$C1"
check "notes hidden before class when not allowed" "$(as $ADA "select coalesce(x->>'notes','hidden') || ' ' || (x->>'early_hidden') from jsonb_array_elements(student_campus()->'sessions') x where (x->>'id')::int=$C1")" "hidden true"
check "join locked until 20 min before" "$(as $ADA "select student_join($C1)" 2>&1 | grep -o '20 minutes before')" "20 minutes before"
check "code not shown outside class time" "$(as bo@test.ng "select acad_class_code($C1)" 2>&1 | grep -o 'from 20 minutes before')" "from 20 minutes before"
$P -c "update sessions set starts_at = now() - interval '10 minutes' where id=$C1"

echo "--- during class: join and code"
check "join returns the link" "$(as $ADA "select student_join($C1)")" "https://meet.example.com/a"
check "join recorded" "$($P -c "select joined_at is not null from attendance where session_id=$C1 and application_id='$AID'")" "t"
check "PTA facilitator can't show BOP code" "$(as pt@test.ng "select acad_class_code($C1)" 2>&1 | grep -o "can't run this class")" "can't run this class"
CODE=$(as bo@test.ng "select acad_class_code($C1)->>'code'")
check "code is 4 digits" "$(echo "$CODE" | grep -Ec '^[0-9]{4}$')" "1"
check "wrong code refused" "$(as $ADA "select learn_class_code($C1, '0000')->>'error'" | grep -o "isn't right")" "isn't right"
check "wrong tries counted" "$($P -c "select code_tries from attendance where session_id=$C1 and application_id='$AID'")" "1"
check "right code marks present" "$(as $ADA "select (learn_class_code($C1, '$CODE')->'class'->>'att')")" "present"
check "assessment waits for the week's last class" "$(as $ADA "select learn_quiz_start('w4-2')" 2>&1 | grep -o "opens after the week's last live class")" "opens after the week's last live class"
for i in 1 2 3 4 5 6; do as $BEN "select learn_class_code($CS, '1111')" >/dev/null 2>&1; done
$P -c "update attendance set code_tries = 6 where session_id=$C1 and application_id='$AID'; update attendance set code_at = null where session_id=$C1 and application_id='$AID'"
check "too many tries blocked" "$(as $ADA "select learn_class_code($C1, '$CODE')->>'error'" | grep -o 'Too many wrong codes')" "Too many wrong codes"
$P -c "update attendance set code_at = now(), code_tries = 1 where session_id=$C1 and application_id='$AID'"
$P -c "update sessions set code_until = now() - interval '1 minute' where id=$C1"
check "expired code refused" "$(as $ADA "select learn_class_code($C1, '$CODE')->>'ok'")" "true"

echo "--- attendance marks"
$P -c "update sessions set starts_at = now() - interval '3 hours' where id=$C1; update sessions set starts_at = now() + interval '8 days' where id=$CS"   # the shared class moves to next week
check "one class held, present = 10" "$($P -c "select private.attendance(a)->>'score' from applications a where id='$AID'")" "10.00"
check "assessment opens after the last class" "$(as $ADA "select jsonb_array_length(learn_quiz_start('w4-2')->'qs')")" "5"
C2=$(mk bo@test.ng "{\"title\":\"Inbox rules\",\"kind\":\"class\",\"track_code\":\"BOP\",\"starts_at\":\"$($P -c "select now() - interval '5 hours'")\",\"minutes\":60,\"link\":\"https://meet.example.com/b\"}")
check "missed one: 1 of 2 = 5" "$($P -c "select private.attendance(a)->>'score' from applications a where id='$AID'")" "5.00"
check "catch-up needs the recording" "$(as $ADA "select learn_catchup_start($C2)" 2>&1 | grep -o "recording isn't up")" "recording isn't up"
as bo@test.ng "select acad_save_session('{\"id\":$C2,\"title\":\"Inbox rules\",\"kind\":\"class\",\"track_code\":\"BOP\",\"starts_at\":\"$($P -c "select now() - interval '5 hours'")\",\"minutes\":60,\"link\":\"https://meet.example.com/b\",\"recording_url\":\"https://drive.example.com/rec\"}')" >/dev/null
check "no practice questions: confirm mode" "$(as $ADA "select learn_catchup_start($C2)->>'mode'")" "confirm"
check "confirm gives half" "$(as $ADA "select learn_catchup_submit($C2, '[]')->'class'->'me'->>'credit'")" "0.5"
check "score with catch-up: 1.5 of 2 = 7.5" "$($P -c "select private.attendance(a)->>'score' from applications a where id='$AID'")" "7.50"
check "present learner can't catch up" "$(as $ADA "select learn_catchup_start($C1)" 2>&1 | grep -o 'already marked present')" "already marked present"
$P -c "update quiz_bank set practice = true where track_code='BOP' and key='w4-2' and qid in (select qid from quiz_bank where track_code='BOP' and key='w4-2' order by qid desc limit 3)"
C3=$(mk bo@test.ng "{\"title\":\"Lab\",\"kind\":\"class\",\"track_code\":\"BOP\",\"starts_at\":\"$($P -c "select now() - interval '4 hours'")\",\"minutes\":60,\"link\":\"https://meet.example.com/c\",\"recording_url\":\"https://drive.example.com/rec3\"}")
check "practice questions: quiz mode with 3" "$(as $ADA "select (learn_catchup_start($C3)->>'mode') || ' ' || jsonb_array_length(learn_catchup_start($C3)->'qs')")" "quiz 3"
check "wrong answers: try again" "$(as $ADA "select learn_catchup_submit($C3, '[9,9,9]')->>'ok'")" "false"
as $ADA "select learn_catchup_start($C3)" >/dev/null
RIGHT=$($P -c "select jsonb_agg(b.a order by u.n) from attendance at cross join unnest(at.catchup_qids) with ordinality u(qid,n) join quiz_bank b on b.track_code='BOP' and b.key=at.catchup_key and b.qid=u.qid where at.session_id=$C3 and at.application_id='$AID'")
check "right answers: half attendance" "$(as $ADA "select learn_catchup_submit($C3, '$RIGHT')->>'ok'")" "true"
$P -c "update sessions set starts_at = now() - interval '60 hours' where id=$C3; update attendance set catchup_at = null, catchup_qids = null where session_id=$C3"
check "catch-up window closes after 48 h" "$(as $ADA "select learn_catchup_start($C3)" 2>&1 | grep -o 'closed 48 hours')" "closed 48 hours"
$P -c "delete from quiz_draws where application_id='$AID' and key='w4-2'; delete from learn_progress where application_id='$AID' and key='w4-2'"
as $ADA "select learn_quiz_start('w4-2')" >/dev/null
check "practice questions kept out of the graded draw" "$($P -c "select count(*) from quiz_draws d, quiz_bank b where d.application_id='$AID' and d.key='w4-2' and b.track_code='BOP' and b.key='w4-2' and b.qid = any(d.qids) and b.practice")" "0"
check "learner sees practice questions with answers" "$(as $ADA "select jsonb_array_length(learn_practice('w4-2')) || ' ' || (learn_practice('w4-2')->0 ? 'a')")" "3 true"

echo "--- register"
check "register suggests late (joined after 15 min, as the class was moved)" "$(as bo@test.ng "select string_agg(x->>'suggest', ',' order by x->>'matric') from jsonb_array_elements(acad_attendance($C1)->'students') x")" "late"
as bo@test.ng "select acad_mark_attendance($C3, '[{\"id\":\"$AID\",\"status\":\"excused\"}]')" >/dev/null
check "excused not counted: 1.5 of 2" "$($P -c "select concat(r->>'counted','/',r->>'held',' ',r->>'score') from (select private.attendance(a) r from applications a where id='$AID') t")" "2/3 7.50"
$P -c "update attendance set catchup_at = null where session_id=$C2 and application_id='$AID'; update attendance set code_at = null, status = 'absent' where session_id=$C1 and application_id='$AID'"
check "two missed in a row flagged" "$($P -c "select private.missed_two(a) from applications a where id='$AID'")" "t"
check "shows as a reason to call" "$($P -c "select 'Missed the last 2 live classes' = any(reasons) from private.student_status($CID) where application_id='$AID'")" "t"
check "facilitator confirms present" "$(as bo@test.ng "select acad_mark_attendance($C2, '[{\"id\":\"$AID\",\"status\":\"late\"}]')")" "1"
check "late counts as present" "$($P -c "select private.attendance(a)->>'present' from applications a where id='$AID'")" "1"
check "attendance in the final result" "$($P -c "select concat(r->'attendance'->>'score','/',r->>'attendance_max') from (select private.result(a) r from applications a where id='$AID') t")" "5.0/10"
check "guest sessions don't count" "$(mk cm@test.ng "{\"title\":\"Guest talk\",\"kind\":\"guest\",\"starts_at\":\"$($P -c "select now() - interval '6 hours'")\",\"minutes\":60}" >/dev/null; $P -c "select private.attendance(a)->>'held' from applications a where id='$AID'")" "3"

echo "--- questions: facilitators write, the Programme Director approves"
N0=$($P -c "select count(*) from quiz_bank where track_code='BOP' and key='w5-2'")
Q=$(as bo@test.ng "select jsonb_array_length(acad_bank_save('{\"track\":\"BOP\",\"key\":\"w5-2\",\"q\":\"Which is a budget?\",\"o\":[\"A plan for money\",\"A meeting\",\"A file\"],\"a\":0,\"explain\":\"It plans spending\"}')->'questions')")
check "facilitator adds a question" "$Q" "$((N0+1))"
check "new question is a draft" "$($P -c "select status from quiz_bank where track_code='BOP' and key='w5-2' order by qid desc limit 1")" "draft"
check "drafts not drawn" "$($P -c "select count(*) from quiz_bank where track_code='BOP' and key='w5-2' and status='approved'")" "$N0"
check "PTA facilitator can't edit BOP questions" "$(as pt@test.ng "select acad_bank_save('{\"track\":\"BOP\",\"key\":\"w5-2\",\"q\":\"x\",\"o\":[\"a\",\"b\"],\"a\":0}')" 2>&1 | grep -o 'your own track')" "your own track"
check "facilitator can't edit shared Fundamentals questions" "$(as bo@test.ng "select acad_bank_save('{\"key\":\"w2-4\",\"q\":\"x\",\"o\":[\"a\",\"b\"],\"a\":0}')" 2>&1 | grep -o 'shared by every track')" "shared by every track"
check "answer must be ticked" "$(as bo@test.ng "select acad_bank_save('{\"track\":\"BOP\",\"key\":\"w5-2\",\"q\":\"x\",\"o\":[\"a\",\"b\"],\"a\":5}')" 2>&1 | grep -o 'Tick the correct answer')" "Tick the correct answer"
check "cohort manager edits shared questions for every track" "$(as cm@test.ng "select acad_bank_save('{\"key\":\"w2-4\",\"q\":\"Shared q\",\"o\":[\"a\",\"b\"],\"a\":1}') is not null" >/dev/null; $P -c "select count(distinct track_code) from quiz_bank where key='w2-4' and q='Shared q'")" "3"
check "facilitator sends for approval" "$(as bo@test.ng "select count(*) from jsonb_array_elements(acad_bank_submit('BOP','w5-2')->'questions') x where x->>'status'='pending'")" "1"
check "cohort manager can't approve" "$(as cm@test.ng "select acad_bank_review('BOP','w5-2',true)" 2>&1 | grep -o 'Your role')" "Your role"
check "sending back needs a note" "$(as dir@test.ng "select acad_bank_review('BOP','w5-2',false,'')" 2>&1 | grep -o 'Say what needs changing')" "Say what needs changing"
check "director approves" "$(as dir@test.ng "select count(*) from jsonb_array_elements(acad_bank_review('BOP','w5-2',true)->'questions') x where x->>'status'='approved'")" "$((N0+1))"
LQ=$($P -c "select d.qids[1] from quiz_draws d where d.application_id='$AID' and d.key='w4-2'")
check "question given to a learner is locked" "$(as bo@test.ng "select acad_bank_save('{\"track\":\"BOP\",\"key\":\"w4-2\",\"qid\":$LQ,\"q\":\"x\",\"o\":[\"a\",\"b\"],\"a\":0}')" 2>&1 | grep -o "already been given to learners")" "already been given to learners"
$P -c "delete from quiz_bank where track_code='BOP' and key='exam-core' and qid > 5"
as bo@test.ng "select acad_bank_save('{\"track\":\"BOP\",\"key\":\"exam-core\",\"q\":\"Pool question\",\"o\":[\"a\",\"b\"],\"a\":0}') is not null" >/dev/null
check "too few to send" "$(as bo@test.ng "select acad_bank_submit('BOP','exam-core')" 2>&1 | grep -o 'at least 40')" "at least 40"
check "overview lists banks with counts" "$(as bo@test.ng "select count(*) > 0 from jsonb_array_elements(acad_bank_overview()->'banks') b where b->>'key'='w5-2' and (b->>'approved')::int = $((N0+1))")" "t"

[ $FAIL == 0 ] && echo "ALL LIVE CLASS CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
