#!/usr/bin/env bash
set -euo pipefail

helper=${1:?helper path is required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mock_bin="$work/bin"
mkdir -p "$mock_bin"
export MOCK_LOG="$work/commands.log"
export MOCK_READY_FILE="$work/docker-ready"
: >"$MOCK_LOG"

cat >"$mock_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >>"$MOCK_LOG"
case "${1:-}" in
  info)
    [[ -f $MOCK_READY_FILE ]]
    ;;
  context)
    case "${2:-}" in
      show) printf '%s\n' "${MOCK_CONTEXT:-default}" ;;
      inspect) printf '%s\n' "${MOCK_ENDPOINT:-unix:///var/run/docker.sock}" ;;
      *) exit 1 ;;
    esac
    ;;
  compose)
    if [[ ${2:-} == version ]]; then
      [[ ${MOCK_COMPOSE:-plugin} == plugin ]]
    fi
    ;;
  volume)
    exit 1
    ;;
esac
EOF

cat >"$mock_bin/docker-compose" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker-compose %s\n' "$*" >>"$MOCK_LOG"
if [[ ${1:-} == version ]]; then
  [[ ${MOCK_COMPOSE:-plugin} == standalone ]]
fi
EOF

cat >"$mock_bin/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\n' "$*" >>"$MOCK_LOG"
if [[ $* == "start docker.service" && ${MOCK_SYSTEMCTL_STARTS_ENGINE:-1} == 1 ]]; then
  : >"$MOCK_READY_FILE"
fi
EOF

cat >"$mock_bin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'sudo %s\n' "$*" >>"$MOCK_LOG"
"$@"
EOF

cat >"$mock_bin/orb" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'orb %s\n' "$*" >>"$MOCK_LOG"
if [[ ${1:-} == start ]]; then
  : >"$MOCK_READY_FILE"
fi
EOF

cat >"$mock_bin/multica" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'multica %s\n' "$*" >>"$MOCK_LOG"
case "$*" in
  version) printf '%s\n' 'multica 0.4.24 (test)' ;;
  *) exit 1 ;;
esac
EOF

cat >"$mock_bin/curl" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$mock_bin/sleep" <<'EOF'
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
)

reset_state() {
	rm -f "$MOCK_READY_FILE"
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
env "${common_env[@]}" "$helper" version >"$work/version.out"
grep -F 'Desired Multica version: v0.4.24' "$work/version.out" >/dev/null
grep -F 'Native CLI: multica 0.4.24 (test)' "$work/version.out" >/dev/null
refute_log 'docker '

reset_state
env "${common_env[@]}" MULTICA_SELFHOST_OS=Linux HOME="$work/home" \
	"$helper" status >"$work/status.out"
grep -F 'Docker engine: stopped or unavailable' "$work/status.out" >/dev/null
grep -F 'Compose project: stopped' "$work/status.out" >/dev/null
refute_log 'systemctl start docker.service'
refute_log 'orb start'

reset_state
env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MULTICA_SELFHOST_OS=Linux \
	bash -c "source \"$helper\"; ensure_engine"
expect_log 'sudo '
expect_log 'systemctl start docker.service'

reset_state
: >"$MOCK_READY_FILE"
env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MULTICA_SELFHOST_OS=Linux \
	bash -c "source \"$helper\"; ensure_engine"
refute_log 'systemctl start docker.service'

reset_state
env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MULTICA_SELFHOST_OS=Darwin \
	bash -c "source \"$helper\"; ensure_engine"
expect_log 'orb start'
refute_log 'systemctl start docker.service'

reset_state
if env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MULTICA_SELFHOST_OS=Linux \
	MULTICA_SELFHOST_WAIT_SECONDS=2 MOCK_SYSTEMCTL_STARTS_ENGINE=0 \
	bash -c "source \"$helper\"; ensure_engine" >"$work/timeout.out" 2>&1; then
	fail 'engine timeout unexpectedly succeeded'
fi
if ! grep -F 'Docker did not become ready within 2s' "$work/timeout.out" >/dev/null; then
	cat "$work/timeout.out" >&2
	fail 'engine timeout did not report an actionable error'
fi

reset_state
: >"$MOCK_READY_FILE"
env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MOCK_COMPOSE=plugin \
	bash -c "source \"$helper\"; detect_compose; compose ps"
expect_log "docker compose --project-name multica --file"
expect_log ' ps'

reset_state
: >"$MOCK_READY_FILE"
env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 MOCK_COMPOSE=standalone \
	bash -c "source \"$helper\"; detect_compose; compose ps"
expect_log "docker-compose --project-name multica --file"
expect_log ' ps'

reset_state
if env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 \
	MOCK_CONTEXT=remote MOCK_ENDPOINT=tcp://example.invalid:2376 \
	bash -c "source \"$helper\"; require_safe_local_context" \
	>"$work/context.out" 2>&1; then
	fail 'unsafe Docker context unexpectedly succeeded'
fi
grep -F "Docker context 'remote'" "$work/context.out" >/dev/null

printf '%s\n' 'foundation tests: OK'
