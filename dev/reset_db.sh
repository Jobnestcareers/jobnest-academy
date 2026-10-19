#!/bin/bash
set -eo pipefail
P="psql -h ${PGHOST:-/var/tmp/jnpg} -p ${PGPORT:-5433} -U ${PGUSER:-postgres}"
$P -qc "drop database if exists jn" && $P -qc "create database jn"
sed "s/CHANGE-ME@example.com/owner@test.ng/; s/'CHANGE ME'/'Owner Test'/" supabase/setup.sql > /var/tmp/setup_test.sql
$P -d jn -q -v ON_ERROR_STOP=1 -f dev/supabase_shim.sql -f /var/tmp/setup_test.sql
