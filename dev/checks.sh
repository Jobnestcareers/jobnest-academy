# Shared by dev/test_*.sh: pass/fail checks, and the exit code CI looks at.
# Point at another server with PGHOST/PGPORT/PGUSER (defaults match dev/reset_db.sh).
PSQL="psql -h ${PGHOST:-/var/tmp/jnpg} -p ${PGPORT:-5433} -U ${PGUSER:-postgres}"
P="$PSQL -d jn -v ON_ERROR_STOP=1 -qAt"
set -eo pipefail
trap 'echo "FAIL ${BASH_SOURCE[0]##*/}:$LINENO: command failed: $BASH_COMMAND"' ERR
FAILS=0
# check LABEL EXPECTED ACTUAL: the value must match exactly.
check() { if [ "$3" = "$2" ]; then echo "ok   $1: $3"; else echo "FAIL $1: expected [$2], got [$3]"; FAILS=$((FAILS + 1)); fi; }
# has LABEL TEXT ACTUAL: the value must contain TEXT.
has() { case "$3" in *"$2"*) echo "ok   $1: $3" ;; *) echo "FAIL $1: expected to contain [$2], got [$3]"; FAILS=$((FAILS + 1)) ;; esac; }
# Call last: exits non-zero when any check failed.
finish() { if [ "$FAILS" -gt 0 ]; then echo "$FAILS check(s) failed in ${0##*/}"; exit 1; fi; echo "all checks passed in ${0##*/}"; }
