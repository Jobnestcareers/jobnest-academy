#!/bin/bash
# SQL-level test of the applicant and staff flow against the local Postgres.
. "$(dirname "$0")/checks.sh"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
check "info" "Cohort 1 · Jan 2027" "$(anon "select academy_info()->'cohort'->>'name'" | tail -1)"
R=$(anon "select submit_application('{\"first_name\":\"Ada\",\"surname\":\"Obi\",\"email\":\"ada@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"Recent graduate\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"Not sure yet\"}')" | tail -1)
echo "submitted: $R"
REF=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
has "dup check" "already have an application" "$(anon "select submit_application('{\"first_name\":\"Ada\",\"surname\":\"Obi\",\"email\":\"ADA@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"x\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"x\"}')" 2>&1 | grep ERROR)"
has "table blocked" "permission denied for table applications" "$(anon "select count(*) from applications" 2>&1 | tail -1)"
check "find" "$REF" "$(anon "select applicant_continue('$REF','Obi')->>'ref'" | tail -1)"
Q=$(anon "select assessment_start('$REF','$TOK')" | tail -1)
check "questions" "10 keys ['o', 'q'] minutes 5" "$(echo $Q | python3 -c 'import json,sys;q=json.load(sys.stdin);qs=q["questions"];print(len(qs),"keys",sorted(qs[0].keys()),"minutes",q["minutes"])')"
# answer correctly using the stored key (test only)
ANS=$($P -c "select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='$REF'")
check "submit" '{"score": 100, "passed": true, "timed_out": false}' "$(anon "select assessment_submit('$REF','$TOK','$ANS')" | tail -1)"
check "officer missing" "t" "$(as owner@test.ng "select super_save_staff('kemi@test.ng','Kemi A','adm_officer',true) is not null" | tail -1)"
as owner@test.ng "select super_save_staff('bayo@test.ng','Bayo Admin','adm_admin',true) is not null" >/dev/null
check "officer slots added" "2" "$(as kemi@test.ng "select officer_add_slots(array[now()+interval '2 days', now()+interval '2 days 1 hour'])" | tail -1)"
has "anon cannot add" "Please sign in with a staff account" "$(anon "select officer_add_slots(array[now()+interval '2 days'])" 2>&1 | grep ERROR)"
V=$(anon "select applicant_view('$REF','$TOK')" | tail -1)
check "view status" "Call to book 2" "$(echo $V | python3 -c 'import json,sys;v=json.load(sys.stdin);print(v["status"],len(v["slots"]))')"
SID=$(echo $V | python3 -c 'import json,sys;print(json.load(sys.stdin)["slots"][0]["id"])')
check "book" "Call booked" "$(anon "select book_call('$REF','$TOK',$SID)->>'status'" | tail -1)"
AID=$($P -c "select id from applications where ref='$REF'")
check "complete" "Under review" "$(as kemi@test.ng "select officer_complete_call('$AID','Good call','DAT',null,'offer','Strong')->>'status'" | tail -1)"
has "officer cannot decide" "Your role cannot do this" "$(as kemi@test.ng "select admin_decide('$AID','offer')" 2>&1 | grep ERROR)"
check "decide" "Offer sent" "$(as bayo@test.ng "select admin_decide('$AID','offer')->>'status'" | tail -1)"
check "applicant sees" "Offer sent" "$(anon "select applicant_view('$REF','$TOK')->>'status'" | tail -1)"
has "wrong token" "could not find that application" "$(anon "select applicant_view('$REF','00000000-0000-0000-0000-000000000000')" 2>&1 | grep ERROR)"
check "outbox" "received, passed, booked, callthanks, offer" "$($P -c "select string_agg(template, ', ' order by id) from outbox")"
has "email sample" "Your Discovery Call is booked" "$($P -c "select subject || ' | ' || left(replace(body, E'\n', ' '), 140) || ' | ' || link from outbox where template='booked'")"
check "me" '{"name": "Kemi A", "role": "adm_officer", "email": "kemi@test.ng"}' "$(as kemi@test.ng "select me()" | tail -1)"
check "settings" "70" "$(as bayo@test.ng "select admin_save_settings('{\"cohort\":{\"pass_mark\":70},\"tracks\":[{\"code\":\"DAT\",\"seats\":1}]}')->'cohort'->>'pass_mark'" | tail -1)"
check "overview" '{"code": "DAT", "name": "Data Analysis", "used": 1, "seats": 1, "paused": false}' "$(as bayo@test.ng "select adm_overview()->'tracks'->2" | tail -1)"
finish
