#!/bin/bash
# SQL-level test of the applicant and staff flow against the local Postgres.
P="psql -h /var/tmp/jnpg -p 5433 -U postgres -d jn -v ON_ERROR_STOP=1 -qAt"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
set -e
echo "info: $(anon "select academy_info()->'cohort'->>'name'")"
R=$(anon "select submit_application('{\"first_name\":\"Ada\",\"surname\":\"Obi\",\"email\":\"ada@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"Recent graduate\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"Not sure yet\"}')" | tail -1)
echo "submitted: $R"
REF=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
echo "dup check: $(anon "select submit_application('{\"first_name\":\"Ada\",\"surname\":\"Obi\",\"email\":\"ADA@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"x\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"x\"}')" 2>&1 | tail -1)"
echo "table blocked: $(anon "select count(*) from applications" 2>&1 | tail -1)"
echo "find: $(anon "select applicant_find('$REF','ada@test.ng')->>'ref'" | tail -1)"
Q=$(anon "select assessment_start('$REF','$TOK')" | tail -1); echo "questions: $(echo $Q | python3 -c 'import json,sys;q=json.load(sys.stdin);qs=q["questions"];print(len(qs),"keys",sorted(qs[0].keys()),"minutes",q["minutes"])')"
# answer correctly using the stored key (test only)
ANS=$($P -c "select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='$REF'")
echo "submit: $(anon "select assessment_submit('$REF','$TOK','$ANS')" | tail -1)"
echo "officer missing: $(as owner@test.ng "select super_save_staff('kemi@test.ng','Kemi A','adm_officer',true) is not null" | tail -1)"
as owner@test.ng "select super_save_staff('bayo@test.ng','Bayo Admin','adm_admin',true) is not null" >/dev/null
echo "officer slots added: $(as kemi@test.ng "select officer_add_slots(array[now()+interval '2 days', now()+interval '2 days 1 hour'])" | tail -1)"
echo "anon cannot add: $(anon "select officer_add_slots(array[now()+interval '2 days'])" 2>&1 | tail -1)"
V=$(anon "select applicant_view('$REF','$TOK')" | tail -1); echo "view status: $(echo $V | python3 -c 'import json,sys;v=json.load(sys.stdin);print(v["status"],len(v["slots"]))')"
SID=$(echo $V | python3 -c 'import json,sys;print(json.load(sys.stdin)["slots"][0]["id"])')
echo "book: $(anon "select book_call('$REF','$TOK',$SID)->>'status'" | tail -1)"
AID=$($P -c "select id from applications where ref='$REF'")
echo "wrong officer: $(as bayo@test.ng "select 1" | tail -1)"
echo "complete: $(as kemi@test.ng "select officer_complete_call('$AID','Good call','DAT',null,'offer','Strong')->>'status'" | tail -1)"
echo "officer cannot decide: $(as kemi@test.ng "select admin_decide('$AID','offer')" 2>&1 | tail -1)"
echo "decide: $(as bayo@test.ng "select admin_decide('$AID','offer')->>'status'" | tail -1)"
echo "applicant sees: $(anon "select applicant_view('$REF','$TOK')->>'status'" | tail -1)"
echo "wrong token: $(anon "select applicant_view('$REF','00000000-0000-0000-0000-000000000000')" 2>&1 | tail -1)"
echo "outbox: $($P -c "select string_agg(template, ', ' order by id) from outbox")"
echo "email sample: $($P -c "select subject || ' | ' || left(replace(body, E'\n', ' '), 140) || ' | ' || link from outbox where template='booked'")"
echo "me: $(as kemi@test.ng "select me()" | tail -1)"
echo "settings: $(as bayo@test.ng "select admin_save_settings('{\"cohort\":{\"pass_mark\":70},\"tracks\":[{\"code\":\"DAT\",\"seats\":1}]}')->'cohort'->>'pass_mark'" | tail -1)"
echo "overview: $(as bayo@test.ng "select adm_overview()->'tracks'->2" | tail -1)"
