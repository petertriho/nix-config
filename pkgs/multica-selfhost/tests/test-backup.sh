#!/usr/bin/env bash
set -euo pipefail

helper=${1:?helper path is required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mock_bin="$work/bin"
upload_source="$work/upload source"
mkdir -p "$mock_bin" "$upload_source"
printf '%s\n' 'known upload content' >"$upload_source/example.txt"
export MOCK_LOG="$work/commands.log"
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
  image)
    [[ ${2:-} == inspect ]] && exit 0
    ;;
  compose)
    if [[ ${2:-} == version ]]; then
      exit 0
    fi
    args=" $* "
    case "$args" in
      *' ps -aq '*)
        [[ ${MOCK_PROJECT_CONTAINERS:-1} == 1 ]] && printf '%s\n' project-container
        ;;
      *' ps --status running -q postgres '*)
        [[ ${MOCK_POSTGRES_RUNNING:-1} == 1 ]] && printf '%s\n' postgres-container
        ;;
      *' exec -T postgres pg_isready '*) exit 0 ;;
      *' exec -T postgres pg_dump '*)
        if [[ ${MOCK_DUMP_COMMAND_FAIL:-0} == 1 ]]; then
          exit 1
        fi
        printf '%s\n' 'custom database dump'
        ;;
      *' exec -T postgres pg_restore --list '*)
        cat >/dev/null
        [[ ${MOCK_DUMP_INVALID:-0} == 0 ]]
        ;;
      *) exit 0 ;;
    esac
    ;;
  run)
    if [[ ${MOCK_ARCHIVE_INVALID:-0} == 1 ]]; then
      printf '%s\n' 'not an archive'
    else
      "$MOCK_REAL_TAR" -czf - -C "$MOCK_UPLOAD_SOURCE" .
    fi
    ;;
esac
EOF

cat >"$mock_bin/docker-compose" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

cat >"$mock_bin/multica" <<'EOF'
#!/usr/bin/env bash
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

cat >"$mock_bin/date" <<'EOF'
#!/usr/bin/env bash
case "${2:-}" in
  +%Y%m%dT%H%M%SZ) printf '%s\n' 20260813T010203Z ;;
  +%Y-%m-%dT%H:%M:%SZ) printf '%s\n' 2026-08-13T01:02:03Z ;;
  *) exit 1 ;;
esac
EOF

cat >"$mock_bin/hostname" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' test-host
EOF

cat >"$mock_bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
[[ ${MOCK_DUMP_INVALID:-0} == 0 ]]
EOF

cat >"$mock_bin/sha256sum" <<'EOF'
#!/usr/bin/env bash
if [[ ${1:-} == --check && ${MOCK_CHECKSUM_FAIL:-0} == 1 ]]; then
  exit 1
fi
exec "$MOCK_REAL_SHA256SUM" "$@"
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
	"MULTICA_SELFHOST_DATE=$mock_bin/date"
	"MULTICA_SELFHOST_HOSTNAME=$mock_bin/hostname"
	"MULTICA_SELFHOST_PG_RESTORE=$mock_bin/pg_restore"
	"MULTICA_SELFHOST_SHA256SUM=$mock_bin/sha256sum"
	"MULTICA_SELFHOST_SUDO=$mock_bin/sudo"
	"MULTICA_SELFHOST_SYSTEMCTL=$mock_bin/systemctl"
	"MULTICA_SELFHOST_ORB=$mock_bin/orb"
	"MULTICA_SELFHOST_WAIT_SECONDS=2"
	"MULTICA_SELFHOST_OS=Linux"
)

reset_state() {
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

assert_backup() {
	local path="$1"
	local expected_os="${2:-linux}"
	local file
	for file in database.dump uploads.tar.gz metadata.json SHA256SUMS; do
		[[ -f $path/$file ]] || fail "missing backup artifact: $file"
	done
	(cd "$path" && "$MOCK_REAL_SHA256SUM" --check SHA256SUMS >/dev/null)
	"$MOCK_REAL_TAR" -tzf "$path/uploads.tar.gz" >/dev/null
	grep -F '"version": "v0.4.24"' "$path/metadata.json" >/dev/null
	grep -F '"host": "test-host"' "$path/metadata.json" >/dev/null
	grep -F "\"operatingSystem\": \"$expected_os\"" "$path/metadata.json" >/dev/null
	grep -F '"dockerContext": "default"' "$path/metadata.json" >/dev/null
	grep -F '"postgres": "multica_pgdata"' "$path/metadata.json" >/dev/null
	grep -F '"uploads": "multica_backend_uploads"' "$path/metadata.json" >/dev/null
}

running_parent="$work/running backups"
reset_state
env "${common_env[@]}" MOCK_PROJECT_CONTAINERS=1 MOCK_POSTGRES_RUNNING=1 \
	"$helper" backup "$running_parent" >"$work/running.out"
running_backup="$running_parent/20260813T010203Z-v0.4.24"
assert_backup "$running_backup"
refute_log 'up -d postgres'
refute_log 'stop postgres'
refute_log ' down'

stopped_parent="$work/macOS path with spaces"
reset_state
env "${common_env[@]}" MOCK_PROJECT_CONTAINERS=0 MOCK_POSTGRES_RUNNING=0 \
	"$helper" backup "$stopped_parent" >"$work/stopped.out"
stopped_backup="$stopped_parent/20260813T010203Z-v0.4.24"
assert_backup "$stopped_backup"
expect_log 'up -d postgres'
expect_log ' down'
refute_log 'down --volumes'

darwin_home="$work/Darwin Home"
reset_state
env "${common_env[@]}" MULTICA_SELFHOST_OS=Darwin HOME="$darwin_home" \
	MOCK_PROJECT_CONTAINERS=0 MOCK_POSTGRES_RUNNING=0 \
	"$helper" backup >"$work/darwin.out"
darwin_backup="$darwin_home/Library/Application Support/Multica Selfhost/backups/20260813T010203Z-v0.4.24"
assert_backup "$darwin_backup" darwin
expect_log 'up -d postgres'
expect_log ' down'

run_failure_case() {
	local name="$1"
	local env_name="$2"
	local parent="$work/$name"
	reset_state
	if env "${common_env[@]}" MOCK_PROJECT_CONTAINERS=0 MOCK_POSTGRES_RUNNING=0 \
		"$env_name=1" "$helper" backup "$parent" >"$work/$name.out" 2>&1; then
		fail "$name failure unexpectedly succeeded"
	fi
	if find "$parent" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | grep -q .; then
		fail "$name left an incomplete backup"
	fi
	expect_log ' down'
}

run_failure_case dump-invalid MOCK_DUMP_INVALID
run_failure_case archive-invalid MOCK_ARCHIVE_INVALID
run_failure_case checksum-invalid MOCK_CHECKSUM_FAIL

printf '%s\n' 'backup tests: OK'
