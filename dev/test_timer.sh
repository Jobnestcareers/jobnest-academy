#!/bin/bash
# Timed assessment: saving, early submit rules, time-out with saved answers, and the every-minute finisher.
. "$(dirname "$0")/checks.sh"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
srv() { $P -c "set role service_role;" -c "$1"; }
new() { anon "select submit_application('{\"first_name\":\"$1\",\"surname\":\"T\",\"email\":\"$1@t.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"x\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"x\"}')" | tail -1; }
R=$(new tim); REF=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
check "info minutes" "5" "$(anon "select academy_info()->'cohort'->>'assess_minutes'" | tail -1)"
check "info questions" "10" "$(anon "select academy_info()->'cohort'->>'questions'" | tail -1)"
S=$(anon "select assessment_start('$REF','$TOK')" | tail -1)
check "start" "10 q, deadline set: True" "$(echo $S | python3 -c 'import json,sys;s=json.load(sys.stdin);print(len(s["questions"]),"q, deadline set:",bool(s["deadline"]))')"
KEY=$($P -c "select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='$REF'")
HALF=$(echo $KEY | python3 -c "import json,sys;k=json.load(sys.stdin);print(json.dumps(k[:5]+[None]*(len(k)-5)))")
anon "select assessment_save('$REF','$TOK','$HALF')" >/dev/null
check "early incomplete submit" "Answer every question." "$(anon "select assessment_submit('$REF','$TOK','$HALF')" 2>&1 | grep -o 'Answer every.*')"
check "restart keeps answers + clock" "10" "$(anon "select jsonb_array_length(assessment_start('$REF','$TOK')->'answers')" | tail -1)"
$P -c "update applications set assess_started_at = now() - interval '12 minutes' where ref='$REF'"
check "late submit uses saved (ignores full key)" '{"score": 50, "passed": false, "timed_out": true}' "$(anon "select assessment_submit('$REF','$TOK','$KEY')" | tail -1)"
R=$(new una); REF2=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK2=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
anon "select assessment_start('$REF2','$TOK2')" >/dev/null
KEY2=$($P -c "select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='$REF2'")
anon "select assessment_save('$REF2','$TOK2','$KEY2')" >/dev/null
$P -c "update applications set assess_started_at = now() - interval '20 minutes' where ref='$REF2'"
check "left open, job finishes it" "1" "$(srv "select jobs_tick()->>'assessments'" | tail -1)"
check "finished by the job" "Call to book 100" "$($P -c "select status||' '||score from applications where ref='$REF2'")"
R=$(new ret); REF3=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK3=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
anon "select assessment_start('$REF3','$TOK3')" >/dev/null; $P -c "update applications set assess_started_at = now() - interval '15 minutes' where ref='$REF3'"
check "comes back after time" '{"score": 0, "passed": false, "timed_out": true}' "$(anon "select assessment_start('$REF3','$TOK3')->'finished'" | tail -1)"
R=$(new ok); REF4=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['ref'])"); TOK4=$(echo $R | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
anon "select assessment_start('$REF4','$TOK4')" >/dev/null; KEY4=$($P -c "select jsonb_agg((x->>'a')::int) from applications, jsonb_array_elements(qset) x where ref='$REF4'")
check "normal submit" '{"score": 100, "passed": true, "timed_out": false}' "$(anon "select assessment_submit('$REF4','$TOK4','$KEY4')" | tail -1)"
check "log" "Application submitted (no Zuri summary) | Started the readiness assessment (5 minutes) | Readiness assessment: 100% (pass mark 70%) · time ran out" "$($P -c "select string_agg(text, ' | ' order by e.id) from app_events e join applications a on a.id=e.application_id where a.ref='$REF2'")"
finish
