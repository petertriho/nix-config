#!/usr/bin/env bash
set -euo pipefail

helper=${1:?helper path is required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mock_bin="$work/bin"
mkdir -p "$mock_bin"
export MOCK_LOG="$work/commands.log"
export MOCK_DAEMON_FILE="$work/daemon"
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
  compose)
    if [[ ${2:-} == version ]]; then
      exit 0
    fi
    ;;
  image)
    if [[ ${2:-} == inspect ]]; then
      case "${MOCK_MISSING_IMAGES:-}" in
        all) exit 1 ;;
        backend) [[ ${3:-} == *multica-backend* ]] && exit 1 ;;
        frontend) [[ ${3:-} == *multica-web* ]] && exit 1 ;;
        postgres) [[ ${3:-} == pgvector/* ]] && exit 1 ;;
      esac
      exit 0
    fi
    ;;
  volume) exit 1 ;;
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
    if [[ ${MOCK_AUTH:-0} == 1 ]]; then
      printf '%s\n' 'Server: http://127.0.0.1:8080' 'User: Test User (test@example.com)'
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
  'daemon start --no-auto-update --no-auto-reload') : >"$MOCK_DAEMON_FILE" ;;
  'daemon stop') rm -f "$MOCK_DAEMON_FILE" ;;
  'config set server_url '*|'config set app_url '*|'config set disable_auto_update true'|'config set disable_auto_reload true') ;;
  login) [[ ${MOCK_LOGIN_FAIL:-0} == 0 ]] ;;
  *) exit 0 ;;
esac
EOF

cat >"$mock_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >>"$MOCK_LOG"
[[ ${MOCK_READY:-1} == 1 ]]
EOF

cat >"$mock_bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$mock_bin/sudo" <<'EOF'
#!/usr/bin/env bash
"$@"
EOF

cat >"$mock_bin/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"$mock_bin/orb" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

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
	"MULTICA_SELFHOST_SUDO=$mock_bin/sudo"
	"MULTICA_SELFHOST_SYSTEMCTL=$mock_bin/systemctl"
	"MULTICA_SELFHOST_ORB=$mock_bin/orb"
	"MULTICA_SELFHOST_WAIT_SECONDS=2"
)

reset_state() {
	rm -f "$MOCK_DAEMON_FILE"
	: >"$MOCK_LOG"
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

reset_state
env "${common_env[@]}" MOCK_MISSING_IMAGES=backend MOCK_AUTH=0 MOCK_READY=1 \
	"$helper" start >"$work/start-unauth.out"
expect_log 'pull backend'
refute_log 'pull frontend'
refute_log 'pull postgres'
expect_log 'up -d'
refute_log 'daemon start'
grep -F 'verification code 888888' "$work/start-unauth.out" >/dev/null
grep -F 'multica-selfhost login' "$work/start-unauth.out" >/dev/null

reset_state
env "${common_env[@]}" MOCK_AUTH=1 MOCK_READY=1 "$helper" start >"$work/start-auth.out"
expect_log 'daemon start --no-auto-update --no-auto-reload'
[[ -f $MOCK_DAEMON_FILE ]] || fail 'authenticated start did not create daemon state'

reset_state
: >"$MOCK_DAEMON_FILE"
env "${common_env[@]}" MOCK_AUTH=1 "$helper" stop >"$work/stop.out"
expect_log 'daemon stop'
expect_log ' down'
refute_log 'down --volumes'
refute_log 'systemctl stop'
refute_log 'orb stop'

reset_state
env "${common_env[@]}" "$helper" logs backend >"$work/logs.out"
expect_log 'logs --follow backend'
grep -F 'multica daemon logs' "$work/logs.out" >/dev/null

reset_state
if env "${common_env[@]}" "$helper" logs invalid >"$work/logs-invalid.out" 2>&1; then
	fail 'invalid logs service unexpectedly succeeded'
fi
refute_log 'logs --follow'

reset_state
env "${common_env[@]}" MOCK_AUTH=1 MOCK_READY=1 "$helper" login >"$work/login.out"
expect_log 'config set server_url http://127.0.0.1:8080'
expect_log 'config set app_url http://127.0.0.1:3000'
expect_log 'config set disable_auto_update true'
expect_log 'config set disable_auto_reload true'
expect_log 'multica login'
expect_log 'daemon start --no-auto-update --no-auto-reload'

reset_state
if env "${common_env[@]}" MOCK_AUTH=0 MOCK_READY=1 MOCK_LOGIN_FAIL=1 \
	"$helper" login >"$work/login-fail.out" 2>&1; then
	fail 'failed login unexpectedly succeeded'
fi
refute_log 'daemon start --no-auto-update --no-auto-reload'

reset_state
if env "${common_env[@]}" MOCK_AUTH=0 MOCK_READY=0 \
	"$helper" start >"$work/readiness-fail.out" 2>&1; then
	fail 'readiness failure unexpectedly succeeded'
fi
expect_log ' ps -a'
refute_log 'daemon start --no-auto-update --no-auto-reload'

printf '%s\n' 'lifecycle tests: OK'
