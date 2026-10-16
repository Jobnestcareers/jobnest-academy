#!/bin/bash
# SQL-level test of payments. Run after dev/test_sql.sh (which leaves Ada with an offer).
P="psql -h /var/tmp/jnpg -p 5433 -U postgres -d jn -v ON_ERROR_STOP=1 -qAt"
anon() { $P -c "set role anon; select set_config('request.jwt.claims','{}',false);" -c "$1"; }
srv() { $P -c "set role service_role;" -c "$1"; }
as() { $P -c "set role authenticated; select set_config('request.jwt.claims','{\"email\":\"$1\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}',false);" -c "$2"; }
REF=$($P -c "select ref from applications where email='ada@test.ng'"); TOK=$($P -c "select token from applications where email='ada@test.ng'")
echo "anon cannot prepare: $(anon "select pay_prepare('$REF','$TOK','full')" 2>&1 | tail -1)"
echo "anon cannot fake result: $(anon "select pay_result('x','success',99999999)" 2>&1 | tail -1)"
echo "staff cannot fake result: $(as bayo@test.ng "select pay_result('x','success',99999999)" 2>&1 | tail -1)"
echo "fees: $(anon "select applicant_view('$REF','$TOK')->'fees'" | tail -1)"
P1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1); echo "prepare part1: $P1"
R1=$(echo $P1 | python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])")
echo "abandoned: $(srv "select pay_result('$R1','abandoned',0)" | tail -1 | cut -c1-40)"
P1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1); R1=$(echo $P1 | python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])")
echo "underpaid: $(srv "select pay_result('$R1','success',100000)->>'outcome'" | tail -1)"
P1=$(srv "select pay_prepare('$REF','$TOK','two')" | tail -1); R1=$(echo $P1 | python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])")
P1B=$(srv "select pay_prepare('$REF','$TOK','full')" | tail -1); R1B=$(echo $P1B | python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])")
echo "paid part1: $(srv "select pay_result('$R1','success',4500000,'card','123')->>'outcome'" | tail -1)"
echo "again (webhook+return): $(srv "select pay_result('$R1','success',4500000,'card','123')->>'outcome'" | tail -1)"
echo "app: $($P -c "select status, plan, paid_total, matric from applications where ref='$REF'")"
echo "second tab paid too: $(srv "select pay_result('$R1B','success',8500000,'card','124')->>'outcome'" | tail -1) · $($P -c "select text from audit_log order by id desc limit 1")"
$P -c "update applications set paid_total = 45000 where ref='$REF'"
echo "view: $(anon "select jsonb_build_object('s',v->'status','m',v->'matric','p',jsonb_array_length(v->'payments'),'signer',v->'signer_title') from applicant_view('$REF','$TOK') v" | tail -1)"
echo "cannot pay full again: $(srv "select pay_prepare('$REF','$TOK','full')->>'part'" | tail -1)"
P2=$(srv "select pay_prepare('$REF','$TOK',null)" | tail -1); echo "part2: $P2"
R2=$(echo $P2 | python3 -c "import json,sys;print(json.load(sys.stdin)['reference'])")
echo "paid part2: $(srv "select pay_result('$R2','success',4500000,'bank_transfer','125')->>'outcome'" | tail -1)"
echo "nothing left: $(srv "select pay_prepare('$REF','$TOK',null)" 2>&1 | tail -1)"
echo "emails: $($P -c "select string_agg(template, ', ' order by id) from outbox where to_email='ada@test.ng'")"
echo "admitted email: $($P -c "select subject || ' | ' || replace(body, E'\n', ' / ') || ' | ' || link from outbox where template='admitted'")"
# second applicant: manual payment, extend, expiry, reminders, decline
for E in ben cyn dan; do
  R=$(anon "select submit_application('{\"first_name\":\"$E\",\"surname\":\"Test\",\"email\":\"$E@test.ng\",\"phone\":\"0803\",\"city\":\"Lagos\",\"edu\":\"HND\",\"nysc\":\"Completed\",\"situation\":\"x\",\"hours\":\"Yes\",\"laptop\":\"Yes\",\"internet\":\"Yes\",\"motivation\":\"x\"}')" | tail -1)
  $P -c "update applications set status='Offer sent', track_code='DAT', decision='offer', decided_at=now()-interval '3 days', offer_deadline=now()+interval '1 day' where email='$E@test.ng'"
done
BID=$($P -c "select id from applications where email='ben@test.ng'")
echo "manual too small: $(as bayo@test.ng "select admin_record_payment('$BID',1000,'transfer')" 2>&1 | tail -1)"
echo "officer cannot record: $(as kemi@test.ng "select admin_record_payment('$BID',85000,'transfer')" 2>&1 | tail -1)"
echo "manual full: $(as bayo@test.ng "select admin_record_payment('$BID',85000,'GTB transfer 0091')->>'matric'" | tail -1)"
$P -c "update applications set offer_deadline=now()-interval '1 hour' where email='cyn@test.ng'"
echo "tick: $(srv "select jobs_tick()" | tail -1)"
echo "tick again: $(srv "select jobs_tick()" | tail -1)"
echo "statuses: $($P -c "select string_agg(first_name||'='||status, ', ' order by first_name) from applications")"
CID=$($P -c "select id from applications where email='cyn@test.ng'")
echo "extend: $(as bayo@test.ng "select admin_extend_offer('$CID',3)->>'status'" | tail -1)"
DT=$($P -c "select token from applications where email='dan@test.ng'"); DR=$($P -c "select ref from applications where email='dan@test.ng'")
echo "decline: $(anon "select applicant_decline('$DR','$DT')->>'status'" | tail -1)"
echo "reminder email: $($P -c "select subject || ' | ' || replace(body, E'\n', ' / ') from outbox where template='reminder' limit 1")"
$P -c "update cohorts set start_date = current_date - 30"   # part 2 due within a week
$P -c "update applications set paid_total = 45000, plan='two' where email='ben@test.ng'"
echo "balance tick: $(srv "select jobs_tick()" | tail -1) · $($P -c "select subject from outbox where template='balance_due'")"
echo "payments page: $(as bayo@test.ng "select jsonb_build_object('people', jsonb_array_length(adm_payments()->'people'), 'payments', jsonb_array_length(adm_payments()->'payments'))" | tail -1)"
echo "matrics: $($P -c "select string_agg(matric, ', ' order by matric) from applications where matric is not null")"
echo "settings signer: $(as bayo@test.ng "select admin_save_settings('{\"site\":{\"signer_name\":\"Tolu Bello\",\"signer_title\":\"Programme Director\"}}')->'site'->>'signer_name'" | tail -1)"
