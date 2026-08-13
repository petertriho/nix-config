#!/usr/bin/env bash
set -euo pipefail

helper=${1:?helper path is required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mock_bin="$work/bin"
home="$work/home"
upload_source="$work/uploads"
mkdir -p "$mock_bin" "$home" "$upload_source"
printf '%s\n' data >"$upload_source/file.txt"
export MOCK_LOG="$work/commands.log"
export MOCK_DAEMON_FILE="$work/daemon"
export MOCK_UPLOAD_SOURCE="$upload_source"
MOCK_REAL_SHA256SUM=$(command -v sha256sum)
MOCK_REAL_TAR=$(command -v tar)
export MOCK_REAL_SHA256SUM MOCK_REAL_TAR
: >"$MOCK_LOG"

cat >"$mock_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >>"$MOCK_LOG"
case "${1:-}" in
  info) exit 0 ;;
  context)
    case "${2:-}" in
      show) printf '%s\n' default ;;
      inspect) printf '%s\n' unix:///var/run/docker.sock ;;
    esac
    ;;
  image) exit 0 ;;
  compose)
    [[ ${2:-} == version ]] && exit 0
    args=" $* "
    case "$args" in
      *' ps -aq '*) printf '%s\n' project-container ;;
      *' ps --status running -q postgres '*) printf '%s\n' postgres-container ;;
      *' exec -T postgres pg_isready '*) exit 0 ;;
      *' exec -T postgres pg_dump '*) printf '%s\n' 'database dump' ;;
      *' exec -T postgres pg_restore --list '*) cat >/dev/null ;;
      *' pull postgres backend frontend '*) [[ ${MOCK_PULL_FAIL:-0} == 0 ]] ;;
      *' up -d --force-recreate '*) [[ ${MOCK_UP_FAIL:-0} == 0 ]] ;;
      *' images '*) printf '%s\n' 'v0.4.24 images' ;;
      *) exit 0 ;;
    esac
    ;;
  run) "$MOCK_REAL_TAR" -czf - -C "$MOCK_UPLOAD_SOURCE" . ;;
esac
EOF

cat >"$mock_bin/docker-compose" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$mock_bin/multica" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'multica %s\n' "$*" >>"$MOCK_LOG"
case "$*" in
  version) printf '%s\n' 'multica 0.4.24 (test)' ;;
  'auth status')
    if [[ ${MOCK_AUTH:-1} == 1 ]]; then
      printf '%s\n' 'Server: http://127.0.0.1:28080' 'User: Test User (test@example.com)'
    else
      printf '%s\n' 'Not authenticated.'
    fi
    ;;
  'daemon status --output json')
    if [[ -f $MOCK_DAEMON_FILE ]]; then
      printf '%s\n' '{"status":"running"}'
    else
      printf '%s\n' '{"status":"stopped"}'
    fi
    ;;
  'daemon stop') rm -f "$MOCK_DAEMON_FILE" ;;
  'daemon start --no-auto-update --no-auto-reload') : >"$MOCK_DAEMON_FILE" ;;
  *) exit 0 ;;
esac
EOF

cat >"$mock_bin/curl" <<'EOF'
#!/usr/bin/env bash
[[ ${MOCK_READY:-1} == 1 ]]
EOF

cat >"$mock_bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$mock_bin/date" <<'EOF'
#!/usr/bin/env bash
case "${2:-}" in
  +%Y%m%dT%H%M%SZ) printf '%s\n' 20260813T020304Z ;;
  +%Y-%m-%dT%H:%M:%SZ) printf '%s\n' 2026-08-13T02:03:04Z ;;
esac
EOF

cat >"$mock_bin/hostname" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' restart-host
EOF

cat >"$mock_bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$mock_bin/sha256sum" <<'EOF'
#!/usr/bin/env bash
if [[ ${1:-} == --check && ${MOCK_BACKUP_FAIL:-0} == 1 ]]; then
  exit 1
fi
exec "$MOCK_REAL_SHA256SUM" "$@"
EOF

cat >"$mock_bin/sudo" <<'EOF'
#!/usr/bin/env bash
"$@"
EOF

for name in systemctl orb; do
	cat >"$mock_bin/$name" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
done

for mock in "$mock_bin"/*; do
	sed -i "1c#!$BASH" "$mock"
done
chmod +x "$mock_bin"/*

common_env=(
	"MULTICA_SELFHOST_DOCKER=$mock_bin/docker"
	"MULTICA_SELFHOST_DOCKER_COMPOSE=$mock_bin/docker-compose"
	"MULTICA_SELFHOST_MULTICA=$mock_bin/multica"
	"MULTICA_SELFHOST_CURL=$mock_bin/curl"
	"MULTICA_SELFHOST_SLEEP=$mock_bin/sleep"
	"MULTICA_SELFHOST_DATE=$mock_bin/date"
	"MULTICA_SELFHOST_HOSTNAME=$mock_bin/hostname"
	"MULTICA_SELFHOST_PG_RESTORE=$mock_bin/pg_restore"
	"MULTICA_SELFHOST_SHA256SUM=$mock_bin/sha256sum"
	"MULTICA_SELFHOST_SUDO=$mock_bin/sudo"
	"MULTICA_SELFHOST_SYSTEMCTL=$mock_bin/systemctl"
	"MULTICA_SELFHOST_ORB=$mock_bin/orb"
	"MULTICA_SELFHOST_WAIT_SECONDS=2"
	"MULTICA_SELFHOST_OS=Linux"
	"HOME=$home"
)

reset_state() {
	rm -rf "$home/.local"
	mkdir -p "$home"
	: >"$MOCK_LOG"
	: >"$MOCK_DAEMON_FILE"
}

fail() {
	printf 'FAIL: %s\n' "$*" >&2
	exit 1
}

expect_log() {
	grep -F -- "$1" "$MOCK_LOG" >/dev/null || fail "missing log entry: $1"
}

refute_log() {
	if grep -F -- "$1" "$MOCK_LOG" >/dev/null; then
		fail "unexpected log entry: $1"
	fi
}

backup_path="$home/.local/share/multica-selfhost/backups/20260813T020304Z-v0.4.24"

reset_state
if env "${common_env[@]}" MOCK_BACKUP_FAIL=1 "$helper" restart >"$work/backup-fail.out" 2>&1; then
	fail 'backup failure unexpectedly succeeded'
fi
refute_log 'pull postgres backend frontend'
refute_log 'up -d --force-recreate'

reset_state
if env "${common_env[@]}" MOCK_PULL_FAIL=1 MOCK_READY=1 "$helper" restart >"$work/pull-fail.out" 2>&1; then
	fail 'pull failure unexpectedly succeeded'
fi
[[ -d $backup_path ]] || fail 'pull failure did not preserve backup'
refute_log 'up -d --force-recreate'
refute_log ' down'

reset_state
env "${common_env[@]}" MOCK_READY=1 "$helper" restart >"$work/success.out"
[[ -d $backup_path ]] || fail 'successful restart did not preserve backup'
expect_log 'pull postgres backend frontend'
expect_log 'up -d --force-recreate'
expect_log 'daemon stop'
expect_log 'daemon start --no-auto-update --no-auto-reload'
expect_log ' images'

reset_state
if env "${common_env[@]}" MOCK_READY=0 "$helper" restart >"$work/readiness-fail.out" 2>&1; then
	fail 'readiness failure unexpectedly succeeded'
fi
[[ -d $backup_path ]] || fail 'readiness failure did not preserve backup'
[[ -f $backup_path.restart-failure/status.txt ]] || fail 'missing restart status diagnostics'
[[ -f $backup_path.restart-failure/logs.txt ]] || fail 'missing restart log diagnostics'
expect_log ' ps -a'
expect_log 'logs --no-color --tail 200'
expect_log ' down'
refute_log 'down --volumes'
refute_log 'daemon start --no-auto-update --no-auto-reload'

printf '%s\n' 'restart tests: OK'
