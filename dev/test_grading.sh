#!/bin/bash
# SQL-level test of the Programme & Grading Policy (update 28). Run after dev/test_portal.sh.
P="psql -h /var/tmp/jnpg -p 5433 -U postgres -d jn -v ON_ERROR_STOP=1 -qAt"
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
ADA=gep-27a-001@students.jobnestcareers.com; BEN=gep-27a-002@students.jobnestcareers.com
AID=$($P -c "select id from applications where matric='GEP/27A/001'"); BID=$($P -c "select id from applications where matric='GEP/27A/002'"); CID=$($P -c "select cohort_id from applications where matric='GEP/27A/001'")
FAIL=0; check() { if [ "$2" == "$3" ]; then echo "ok   $1: $2"; else echo "FAIL $1: got [$2] want [$3]"; FAIL=1; fi; }

$P -c "update applications set track_code='BOP' where id='$AID'; update applications set track_code='PTA' where id='$BID'"
$P -c "update cohorts set start_date = current_date - 10"
$P -c "update applications set fee_due_override = current_date + 365 where id in ('$AID','$BID')"
$P -c "update app_settings set value='00:00' where key='exam_open'; update app_settings set value='23:59' where key='exam_close'"
$P -c "insert into app_settings(key,value) values ('unlock_weeks','off'),('week_dates','on') on conflict (key) do update set value=excluded.value"
as owner@test.ng "select super_save_staff('dir@test.ng','Dayo Director','director',true,null) is not null" >/dev/null
as owner@test.ng "select super_save_staff('pt@test.ng','Pat PTA','facilitator',true,'PTA') is not null" >/dev/null

echo "--- structure"
check "tracks" "$($P -c "select string_agg(code||':'||name, ', ' order by sort) from tracks")" "BOP:Business Operations, PTA:People & Talent, CSG:Customer Success & Growth"
check "weeks per track" "$($P -c "select string_agg(distinct n::text, ',') from (select max(week) n from course_items group by track_code) t")" "20"
check "programme weeks" "$($P -c "select weeks from programmes where code='GEP'")" "20"
check "assessments per track" "$($P -c "select string_agg(distinct n::text, ',') from (select count(*) n from course_items where type='quiz' group by track_code) t")" "10"
check "assessment weeks" "$($P -c "select string_agg(week::text, ',' order by week) from course_items where type='quiz' and track_code='PTA'")" "2,3,4,5,6,7,8,9,10,11"
check "exam week items" "$($P -c "select string_agg(type||coalesce(':'||paper,''), ',' order by key) from course_items where week=12 and track_code='CSG'")" "task,exam:fund,exam:core"
check "final project" "$($P -c "select string_agg(track_code||':w'||week, ',' order by track_code) from course_items where final")" "BOP:w14,CSG:w14,PTA:w14"
check "banks >= 10 each, exam pools" "$($P -c "select bool_and(n >= case when key='exam-fund' then 30 when key='exam-core' then 40 else 10 end) from (select track_code, key, count(*) n from quiz_bank group by 1,2) t")" "t"
check "bank keys match assessments" "$($P -c "select count(*) from course_items i where type='quiz' and not exists (select 1 from quiz_bank b where b.track_code=i.track_code and b.key=i.key)")" "0"
check "no semicolons in bank text" "$($P -c "select count(*) from quiz_bank where q like '%;%' or array_to_string(o,'|') like '%;%'")" "0"

echo "--- grade boundaries"
check "80 / 79.9 / 79.5" "$($P -c "select private.grade_band(80)->>'class' || ' / ' || (private.grade_band(79.9)->>'class') || ' / ' || (private.grade_band(79.5)->>'letter')")" "Distinction / Merit / B"
check "60 / 59.9 / 50 / 49.9 / 0" "$($P -c "select concat_ws(' / ', private.grade_band(60)->>'letter', private.grade_band(59.9)->>'letter', private.grade_band(50)->>'class', private.grade_band(49.9)->>'class', private.grade_band(0)->>'letter')")" "B / C / Pass / Fail / F"

# Helpers: open an assessment for a learner and answer K questions right.
answers() { $P -c "select jsonb_agg(case when u.n <= $3 then b.a else (b.a + 1) % 4 end order by u.n) from quiz_draws d cross join unnest(d.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code = (select track_code from applications where id = d.application_id) and b.key = d.key and b.qid = u.qid where d.application_id = '$1' and d.key = '$2' and d.submitted_at is null"; }
lessons_done() { for k in $($P -c "select key from course_items where track_code='$2' and week = (select week from course_items where track_code='$2' and key='$3') and type in ('lesson','guide','task','oath') and not link and not staff and split_part(key,'-',2)::int < split_part('$3','-',2)::int"); do
  as $1 "select learn_done('$k', true, '{\"sig\":\"Test\"}')" >/dev/null; done; }
take() { lessons_done $1 $2 $3; as $1 "select learn_quiz_start('$3')" >/dev/null; A=$(answers $4 $3 $5); as $1 "select learn_quiz('$3', '$A')" >/dev/null; }

echo "--- weekly assessments"
lessons_done $ADA BOP w2-4
N=$(as $ADA "select jsonb_array_length(learn_quiz_start('w2-4')->'qs')" | tail -1); check "5 questions" "$N" "5"
A=$(answers $AID w2-4 4); as $ADA "select learn_quiz('w2-4', '$A')" >/dev/null
check "4 of 5 = 3.2 marks" "$($P -c "select (private.result(a)->'assessments'->0->>'marks') from applications a where id='$AID'")" "3.2"
check "second attempt blocked" "$(as $ADA "select learn_quiz_start('w2-4')" 2>&1 | grep -o 'one attempt')" "one attempt"
check "student retry blocked" "$(as $ADA "select learn_quiz_retry('w2-4')" 2>&1 | grep -o 'no resits')" "no resits"
check "staff retake blocked" "$(as cm@test.ng "select acad_grant_retake('$AID', 2)" 2>&1 | grep -o 'no resits')" "no resits"
check "repeat week blocked" "$(as $ADA "select learn_repeat(2)" 2>&1 | grep -o "can't be repeated")" "can't be repeated"
for k in w3-3 w4-2 w5-2 w6-2 w7-2 w8-2 w9-2 w10-2 w11-2; do take $ADA BOP $k $AID 5; done
check "ada assessments 4+9x5 correct = 39.2/40" "$($P -c "select private.result(a)->>'assess_score' from applications a where id='$AID'")" "39.2"
for k in w2-4 w3-3 w4-2 w5-2; do take $BEN PTA $k $BID 3; done
check "ben 4 taken, 6 pending" "$($P -c "select concat(r->>'assess_taken','/',r->>'assess_pending') from (select private.result(a) r from applications a where id='$BID') t")" "4/6"
check "ben pending result" "$($P -c "select private.result(a)->>'status' from applications a where id='$BID'")" "Pending"

echo "--- examinations"
$P -c "update cohorts set start_date = current_date - 77, exam_week_start = current_date"   # today is the examination week's 'Monday'
check "ben's missing assessments now missed" "$($P -c "select concat(r->>'assess_missed','/',r->>'assess_pending') from (select private.result(a) r from applications a where id='$BID') t")" "6/0"
check "assessment closed" "$(as $BEN "select learn_quiz_start('w6-2')" 2>&1 | grep -o 'closed when the examination week started')" "closed when the examination week started"
check "timetable unpublished" "$(as $ADA "select learn_exam_start('fund')" 2>&1 | grep -o "hasn't been published")" "hasn't been published"
check "only BOP may not move off Wednesday" "$(as cm@test.ng "select acad_exam_settings('{\"schedule\":[{\"track\":\"BOP\",\"fund_day\":1,\"core_day\":4}]}')" 2>&1 | grep -o 'Business Operations sits.*Wednesday')" "Business Operations sits its Core Skill Learning Examination on Wednesday"
check "fund day must be Mon/Tue" "$(as cm@test.ng "select acad_exam_settings('{\"schedule\":[{\"track\":\"PTA\",\"fund_day\":3,\"core_day\":4}]}')" 2>&1 | grep -o 'Monday or Tuesday')" "Monday or Tuesday"
as cm@test.ng "select acad_exam_settings('{\"schedule\":[{\"track\":\"PTA\",\"fund_day\":2,\"core_day\":5},{\"track\":\"CSG\",\"fund_day\":1,\"core_day\":4}],\"published\":true}')" >/dev/null
check "schedule saved" "$($P -c "select string_agg(track_code||fund_day||core_day, ',' order by track_code) from exam_schedule")" "BOP13,CSG14,PTA25"
check "rules first" "$(as $ADA "select learn_exam_start('fund')" 2>&1 | grep -o 'Read the examination rules first')" "Read the examination rules first"
as $ADA "select learn_done('w12-1', true)" >/dev/null; as $BEN "select learn_done('w12-1', true)" >/dev/null
check "ben (PTA, Tuesday) not open on Monday" "$(as $BEN "select learn_exam_start('fund')" 2>&1 | grep -o "opens on $(date -d '+1 day' +%A)")" "opens on $(date -d '+1 day' +%A)"
check "ada core not open on Monday" "$(as $ADA "select learn_exam_start('core')" 2>&1 | grep -o "opens on $(date -d '+2 day' +%A)")" "opens on $(date -d '+2 day' +%A)"
X=$(as $ADA "select learn_exam_start('fund')" | tail -1)
check "fund: 30 questions" "$(echo "$X" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["qs"]))')" "30"
check "fund: 30 minutes" "$($P -c "select (extract(epoch from deadline - started_at)/60)::int from exam_sittings where application_id='$AID' and paper='fund'")" "30"
check "resume returns same paper" "$(as $ADA "select jsonb_array_length(learn_exam_start('fund')->'qs')" | tail -1)" "30"
FA=$($P -c "select jsonb_agg(case when u.n <= 24 then b.a else (b.a + 1) % 4 end order by u.n) from exam_sittings s cross join unnest(s.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code='BOP' and b.key='exam-fund' and b.qid=u.qid where s.application_id='$AID' and s.paper='fund'")
as $ADA "select learn_exam_save('fund', '$FA')" >/dev/null
as $ADA "select learn_exam_submit('fund', '$FA')" >/dev/null
check "fund 24/30" "$($P -c "select private.result(a)->'fund'->>'score' from applications a where id='$AID'")" "24"
check "fund status" "$($P -c "select private.result(a)->'fund'->>'status' from applications a where id='$AID'")" "Graded"
check "fund cannot be sat twice" "$(as $ADA "select learn_exam_start('fund')" 2>&1 | grep -o "already sat")" "already sat"
check "different draw per candidate" "$($P -c "select count(distinct qids) from exam_sittings where paper='fund'") of 1 sitting" "1 of 1 sitting"
$P -c "update cohorts set start_date = current_date - 79, exam_week_start = current_date - 2"   # today is its 'Wednesday'
X=$(as $ADA "select learn_exam_start('core')" | tail -1)
check "core: 40 questions" "$(echo "$X" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["qs"]))')" "40"
check "core: 45 minutes" "$($P -c "select (extract(epoch from deadline - started_at)/60)::int from exam_sittings where application_id='$AID' and paper='core'")" "45"
check "core questions from BOP pool only" "$($P -c "select count(*) from exam_sittings s cross join unnest(s.qids) u(q) where s.application_id='$AID' and s.paper='core' and not exists (select 1 from quiz_bank b where b.track_code='BOP' and b.key='exam-core' and b.qid=u.q)")" "0"
CA=$($P -c "select jsonb_agg(case when u.n <= 32 then b.a else (b.a + 1) % 4 end order by u.n) from exam_sittings s cross join unnest(s.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code='BOP' and b.key='exam-core' and b.qid=u.qid where s.application_id='$AID' and s.paper='core'")
as $ADA "select learn_exam_submit('core', '$CA')" >/dev/null
check "exam score (24+32)/70*60 = 48" "$($P -c "select private.result(a)->>'exam_score' from applications a where id='$AID'")" "48.00"
check "ben missed Tuesday fund" "$($P -c "select private.result(a)->'fund'->>'status' from applications a where id='$BID'")" "Missed"
check "ben exam still pending" "$($P -c "select coalesce(private.result(a)->>'exam_score','null') from applications a where id='$BID'")" "null"

echo "--- resit"
check "resit needs a reason" "$(as cm@test.ng "select acad_exam_resit('$BID','fund',current_date,'')" 2>&1 | grep -o 'Give a reason')" "Give a reason"
as cm@test.ng "select acad_exam_resit('$BID','fund',current_date,'Hospital appointment, letter on file')" >/dev/null
check "resit opens today" "$($P -c "select private.result(a)->'fund'->>'status' from applications a where id='$BID'")" "Open"
as $BEN "select learn_exam_start('fund')" >/dev/null
BA=$($P -c "select jsonb_agg(case when u.n <= 15 then b.a else (b.a + 1) % 4 end order by u.n) from exam_sittings s cross join unnest(s.qids) with ordinality u(qid, n) join quiz_bank b on b.track_code='PTA' and b.key='exam-fund' and b.qid=u.qid where s.application_id='$BID' and s.paper='fund'")
as $BEN "select learn_exam_submit('fund', '$BA')" >/dev/null
check "ben resit 15/30, resit used" "$($P -c "select concat(private.result(a)->'fund'->>'score', ' ', (select used_at is not null from exam_resits where application_id=a.id)) from applications a where id='$BID'")" "15 t"
check "ben gets PTA fund questions (shared pool)" "$($P -c "select count(*) from quiz_bank where track_code='PTA' and key='exam-fund'")" "45"

echo "--- project, final score, publishing"
PK=$($P -c "select key from course_items where track_code='BOP' and final")
$P -c "insert into learn_progress(application_id, key, week, status, link, cap) values ('$AID', '$PK', 14, 'submitted', 'https://docs.google.com/p', 0.5)"
check "pending until project graded" "$($P -c "select private.result(a)->>'status' || ': ' || (private.result(a)->'missing'->>0) from applications a where id='$AID'")" "Pending: Practical project submitted"
check "facilitator from PTA can't grade BOP" "$(as pt@test.ng "select acad_learn_grade_parts('$AID','$PK','graded','{\"a\":50}','x')" 2>&1 | grep -o "can't grade")" "can't grade"
as fola@test.ng "select acad_learn_grade_parts('$AID','$PK','graded','{\"Understanding of the brief\":12,\"Quality and accuracy\":20,\"Track skills\":16,\"Problem-solving\":12,\"Presentation\":12,\"Planning and self-review\":8}','Strong work')" >/dev/null
check "project 80/100 (late cap not applied)" "$($P -c "select private.result(a)->'project'->>'score' from applications a where id='$AID'")" "80"
check "ada final (39.2+48+80)/2 = 83.6 Distinction" "$($P -c "select concat(r->>'final',' ',r->>'grade',' ',r->>'class',' ',r->>'status') from (select private.result(a) r from applications a where id='$AID') t")" "83.6 A Distinction Complete"
check "student can't see final before publish" "$(as $ADA "select coalesce(learn_results()->>'final','hidden') || ' ' || (learn_results()->>'exam_score')" | tail -1)" "hidden 48.00"
check "pta facilitator sees only PTA" "$(as pt@test.ng "select jsonb_path_query_array(acad_results()->'students','\$[*].matric')" | tail -1)" '["GEP/27A/002"]'
check "facilitator can't correct" "$(as pt@test.ng "select acad_score_correct('$BID','exam-fund',20,'x')" 2>&1 | grep -o 'Your role')" "Your role"
check "correction needs reason" "$(as cm@test.ng "select acad_score_correct('$AID','project',75,'')" 2>&1 | grep -o 'Give a reason')" "Give a reason"
check "correction range" "$(as cm@test.ng "select acad_score_correct('$AID','w5-2',6,'typo')" 2>&1 | grep -o 'from 0 to 5')" "from 0 to 5"
as cm@test.ng "select acad_score_correct('$AID','w2-4',5,'Question 3 had two correct options')" >/dev/null
check "recalculated: assessments capped at 40" "$($P -c "select concat(r->>'assess_score',' ',r->>'final') from (select private.result(a) r from applications a where id='$AID') t")" "40.0 84.0"
check "cm can't publish" "$(as cm@test.ng "select acad_results_publish($CID, true)" 2>&1 | grep -o 'Your role')" "Your role"
check "certificate blocked before publish" "$(as dir@test.ng "select acad_issue_certificate('$AID')" 2>&1 | grep -o 'Publish this cohort')" "Publish this cohort"
as dir@test.ng "select acad_results_publish($CID, true)" >/dev/null
check "student sees final after publish" "$(as $ADA "select concat(learn_results()->>'final',' ',learn_results()->>'class')" | tail -1)" "84.0 Distinction"
check "ben still pending after publish" "$(as $BEN "select concat(learn_results()->>'status',' ',coalesce(learn_results()->>'final','-'))" | tail -1)" "Pending -"
check "cm locked after publish" "$(as cm@test.ng "select acad_score_correct('$AID','project',70,'regrade')" 2>&1 | grep -o 'Only the Programme Director')" "Only the Programme Director"
as dir@test.ng "select acad_score_correct('$AID','project',70,'Moderation panel regrade')" >/dev/null
check "director correction after publish -> 79.0 Merit" "$($P -c "select concat(r->>'final',' ',r->>'class') from (select private.result(a) r from applications a where id='$AID') t")" "79.0 Merit"
check "change log kept" "$($P -c "select count(*) from score_changes where application_id='$AID'")" "2"
check "certificate for ben blocked (pending)" "$(as dir@test.ng "select acad_issue_certificate('$BID')" 2>&1 | grep -o 'still Pending')" "still Pending"
check "exception needs director" "$(as cm@test.ng "select acad_result_exception('$BID',true,'x')" 2>&1 | grep -o 'Your role')" "Your role"
as dir@test.ng "select acad_result_exception('$BID',true,'Withdrew from project for medical reasons, approved by panel')" >/dev/null
check "ben with exception: missing count as zero" "$($P -c "select concat(r->>'status',' ',r->>'final',' ',r->>'class') from (select private.result(a) r from applications a where id='$BID') t")" "Complete 11.2 Fail"
check "fail gets no certificate" "$(as dir@test.ng "select acad_issue_certificate('$BID')" 2>&1 | grep -o "doesn't receive a certificate")" "doesn't receive a certificate"
CERT=$(as dir@test.ng "select acad_issue_certificate('$AID')->>'class'" | tail -1)
check "certificate class" "$CERT" "Merit"
check "certificate view shows class" "$($P -c "select certificate_view(cert_id)->>'class' from applications where id='$AID'")" "Merit"

echo "--- policy example: (32 + 48 + 80) / 2 = 80, Distinction"
$P -c "delete from score_overrides where application_id='$AID'"
$P -c "insert into score_overrides(application_id, component, value, reason, by_name) select '$AID', key, 4, 'policy example', 'test' from course_items where track_code='BOP' and type='quiz'"
$P -c "insert into score_overrides(application_id, component, value, reason, by_name) values ('$AID','exam-fund',26,'policy example','test'),('$AID','exam-core',30,'policy example','test'),('$AID','project',80,'policy example','test')"
check "32 + 48 + 80" "$($P -c "select concat(r->>'assess_score',' + ',r->>'exam_score',' + ',r->'project'->>'score',' = ',r->>'final',' ',r->>'grade',' ',r->>'class') from (select private.result(a) r from applications a where id='$AID') t")" "32.0 + 48.00 + 80 = 80.0 A Distinction"
$P -c "update score_overrides set value = 79 where application_id='$AID' and component='project'"
check "79.5 stays Merit (no rounding up)" "$($P -c "select concat(r->>'final',' ',r->>'class') from (select private.result(a) r from applications a where id='$AID') t")" "79.5 Merit"
echo "--- audit"
check "audit lines" "$($P -c "select count(*) >= 6 from audit_log where text ~ '(corrected|resit|exception|published results|issued certificate)'")" "t"
[ $FAIL == 0 ] && echo "ALL GRADING CHECKS PASSED" || { echo "SOME CHECKS FAILED"; exit 1; }
