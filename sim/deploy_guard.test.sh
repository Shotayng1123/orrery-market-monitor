#!/usr/bin/env bash
# The guard of the server deploy (jobs/tools/deploy_guard.jq), tried on lists in the shape the Supabase CLI
# prints (`supabase migration list --remote --output-format json`, version 3.2.0): it must let a deploy go on
# only when everything waiting is newer than everything applied.   Run: bash sim/deploy_guard.test.sh
set -u
G="$(dirname "$0")/../jobs/tools/deploy_guard.jq"
fail=0; n=0
ck() { n=$((n + 1)); local got; got=$(printf '%s' "$2" | jq -r -f "$G" 2>&1); case "$got" in $3) echo "  ✓ $1";; *) echo "  ✗ $1"; echo "      got: $got"; fail=$((fail + 1));; esac; }
row() { printf '{"local":"%s","remote":"%s","time":"t"}' "$1" "$2"; }
list() { local IFS=,; printf '{"migrations":[%s],"message":"Migrations listed","target":{"kind":"linked"}}' "$*"; }
A=$(row 20261115000001 20261115000001); B=$(row 20261116000001 20261116000001); W1=$(row 20261118000001 ""); W2=$(row 20261118000002 "")

ck "new migrations waiting, all newer than the newest applied: go on, and name them" "$(list "$A" "$B" "$W1" "$W2")" "OK: 2 migration(s) waiting, all newer than 20261116000001: 20261118000001 20261118000002"
ck "nothing waiting: go on" "$(list "$A" "$B")" "OK: nothing waiting; the newest applied is 20261116000001"
ck "an older migration the database has no record of: stop (it may have been applied by hand)" "$(list "$(row 20261115000001 "")" "$B" "$W1")" "STOP: waiting migrations older than the newest applied one (20261116000001): 20261115000001"
ck "a migration on the database's record that the repository does not have: stop" "$(list "$A" "$(row "" 20261117000009)" "$W1")" "STOP: the database has migrations the repository does not: 20261117000009"
ck "no record of any migration at all: stop, never apply everything again" "$(list "$(row 20261115000001 "")" "$W1")" "STOP: the database has no record of any migration, but 2 are in the repository*"
ck "an answer that is not a list of migrations: stop" '{"message":"something else"}' "STOP: could not read the list of migrations*"
ck "an empty list: stop" '{"migrations":[]}' "STOP: could not read the list of migrations*"
ck "an answer that is not JSON at all: not OK" 'Target: local stack' "*"
got=$(printf 'not json' | jq -r -f "$G" 2>/dev/null); n=$((n + 1)); case "$got" in OK*) echo "  ✗ text that is not JSON must never read as OK"; fail=$((fail + 1));; *) echo "  ✓ text that is not JSON never reads as OK";; esac
if [ "$fail" -gt 0 ]; then echo "✗ $fail of $n failed"; exit 1; fi
echo "✓ all $n passed"
