#!/bin/bash
# SQL-level test of payments. Run after dev/test_sql.sh (which leaves Ada with an offer).
. "$(dirname "$0")/checks.sh"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
srv() { $P -c "set role service_role;" -c "$1"; }
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
ref() { python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])"; }
REF=$($P -c "select ref from applications where email='ada@test.ng'"); TOK=$($P -c "select token from applications where email='ada@test.ng'")
has "anon cannot prepare" "permission denied for function pay_prepare" "$(anon "select pay_prepare('$REF','$TOK','full')" 2>&1 | tail -1)"
has "anon cannot fake result" "permission denied for function pay_result" "$(anon "select pay_result('x','success',99999999)" 2>&1 | tail -1)"
has "staff cannot fake result" "permission denied for function pay_result" "$(as bayo@test.ng "select pay_result('x','success',99999999)" 2>&1 | tail -1)"
check "fees" '{"fee": 85000, "part1": 45000, "part2": 45000, "due_date": "2027-02-14", "two_total": 90000, "plan_total": null}' "$(anon "select applicant_view('$REF','$TOK')->'fees'" | tail -1)"
P1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1)
check "prepare part1" "part1 45000" "$(echo $P1 | python3 -c 'import json,sys;p=json.load(sys.stdin);print(p["part"],p["amount"])')"
R1=$(echo $P1 | ref)
check "abandoned" "$REF" "$(srv "select pay_result('$R1','abandoned',0)->>'ref'" | tail -1)"
R1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1 | ref)
check "underpaid" "mismatch" "$(srv "select pay_result('$R1','success',100000)->>'outcome'" | tail -1)"
R1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1 | ref)
R1B=$(srv "select pay_prepare('$REF','$TOK','full')" | tail -1 | ref)
check "paid part1" "success" "$(srv "select pay_result('$R1','success',4500000,'card','123')->>'outcome'" | tail -1)"
check "again (webhook+return)" "success" "$(srv "select pay_result('$R1','success',4500000,'card','123')->>'outcome'" | tail -1)"
check "app" "Admitted|two|45000|GEP/27A/001" "$($P -c "select status, plan, paid_total, matric from applications where ref='$REF'")"
check "second tab paid too" "success" "$(srv "select pay_result('$R1B','success',8500000,'card','124')->>'outcome'" | tail -1)"
has "second tab flagged" "paid ₦85,000 while \"Admitted\": check it and refund if needed" "$($P -c "select text from audit_log order by id desc limit 1")"
$P -c "update applications set paid_total = 45000 where ref='$REF'"
check "view" '{"m": "GEP/27A/001", "p": 2, "s": "Admitted", "signer": "Programme Director"}' "$(anon "select jsonb_build_object('s',v->'status','m',v->'matric','p',jsonb_array_length(v->'payments'),'signer',v->'signer_title') from applicant_view('$REF','$TOK') v" | tail -1)"
check "cannot pay full again" "part2" "$(srv "select pay_prepare('$REF','$TOK','full')->>'part'" | tail -1)"
P2=$(srv "select pay_prepare('$REF','$TOK',null)" | tail -1)
check "part2" "part2 45000" "$(echo $P2 | python3 -c 'import json,sys;p=json.load(sys.stdin);print(p["part"],p["amount"])')"
R2=$(echo $P2 | ref)
check "paid part2" "success" "$(srv "select pay_result('$R2','success',4500000,'bank_transfer','125')->>'outcome'" | tail -1)"
has "nothing left" "nothing to pay on this application" "$(srv "select pay_prepare('$REF','$TOK',null)" 2>&1 | grep ERROR)"
check "emails" "received, passed, booked, callthanks, offer, admitted, paid_full" "$($P -c "select string_agg(template, ', ' order by id) from outbox where to_email='ada@test.ng'")"
has "admitted email" "Your matric number is GEP/27A/001" "$($P -c "select subject || ' | ' || replace(body, E'\n', ' / ') || ' | ' || link from outbox where template='admitted'")"
# second applicant: manual payment, extend, expiry, reminders, decline
for E in ben cyn dan; do
  anon "select submit_application('{\"first_name\":\"$E\",\"surname\":\"Test\",\"email\":\"$E@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"x\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"x\"}')" >/dev/null
  $P -c "update applications set status='Offer sent', track_code='DAT', decision='offer', decided_at=now()-interval '3 days', offer_deadline=now()+interval '1 day' where email='$E@test.ng'"
done
BID=$($P -c "select id from applications where email='ben@test.ng'")
has "manual too small" "less than the first instalment" "$(as bayo@test.ng "select admin_record_payment('$BID',1000,'transfer')" 2>&1 | grep ERROR)"
has "officer cannot record" "Your role cannot do this" "$(as kemi@test.ng "select admin_record_payment('$BID',85000,'transfer')" 2>&1 | grep ERROR)"
check "manual full" "GEP/27A/002" "$(as bayo@test.ng "select admin_record_payment('$BID',85000,'GTB transfer 0091')->>'matric'" | tail -1)"
$P -c "update applications set offer_deadline=now()-interval '1 hour' where email='cyn@test.ng'"
check "tick" '{"balance": 0, "expired": 1, "reminded": 1, "assessments": 0}' "$(srv "select jobs_tick()" | tail -1)"
check "tick again" '{"balance": 0, "expired": 0, "reminded": 0, "assessments": 0}' "$(srv "select jobs_tick()" | tail -1)"
check "statuses" "Ada=Admitted, Ben=Admitted, Cyn=Offer expired, Dan=Offer sent" "$($P -c "select string_agg(first_name||'='||status, ', ' order by first_name) from applications")"
CID=$($P -c "select id from applications where email='cyn@test.ng'")
check "extend" "Offer sent" "$(as bayo@test.ng "select admin_extend_offer('$CID',3)->>'status'" | tail -1)"
DT=$($P -c "select token from applications where email='dan@test.ng'"); DR=$($P -c "select ref from applications where email='dan@test.ng'")
check "decline" "Offer declined" "$(anon "select applicant_decline('$DR','$DT')->>'status'" | tail -1)"
has "reminder email" "Reminder: your offer expires in" "$($P -c "select subject || ' | ' || replace(body, E'\n', ' / ') from outbox where template='reminder' limit 1")"
$P -c "update cohorts set start_date = current_date - 30"   # part 2 due within a week
$P -c "update applications set paid_total = 45000, plan='two' where email='ben@test.ng'"
check "balance tick" '{"balance": 1, "expired": 0, "reminded": 0, "assessments": 0}' "$(srv "select jobs_tick()" | tail -1)"
has "balance email" "Your second instalment is due by" "$($P -c "select subject from outbox where template='balance_due'")"
check "payments page" '{"people": 3, "payments": 7}' "$(as bayo@test.ng "select jsonb_build_object('people', jsonb_array_length(adm_payments()->'people'), 'payments', jsonb_array_length(adm_payments()->'payments'))" | tail -1)"
check "matrics" "GEP/27A/001, GEP/27A/002" "$($P -c "select string_agg(matric, ', ' order by matric) from applications where matric is not null")"
check "settings signer" "Tolu Bello" "$(as bayo@test.ng "select admin_save_settings('{\"site\":{\"signer_name\":\"Tolu Bello\",\"signer_title\":\"Programme Director\"}}')->'site'->>'signer_name'" | tail -1)"
finish
