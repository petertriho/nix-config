#!/usr/bin/env bash
set -euo pipefail

helper=${1:?helper path is required}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mock_bin="$work/bin"
home="$work/home"
upload_source="$work/current uploads"
mkdir -p "$mock_bin" "$home" "$upload_source"
printf '%s\n' current >"$upload_source/current.txt"
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
      show) printf '%s\n' "${MOCK_CURRENT_CONTEXT:-default}" ;;
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
      *' exec -T postgres pg_dump '*) printf '%s\n' 'safety database dump' ;;
      *' exec -T postgres dropdb '*) exit 0 ;;
      *' exec -T postgres createdb '*) exit 0 ;;
      *' exec -T postgres pg_restore '*) cat >/dev/null ;;
      *) exit 0 ;;
    esac
    ;;
  run)
    args=" $* "
    case "$args" in
      *' --entrypoint tar '*'-czf - '*) "$MOCK_REAL_TAR" -czf - -C "$MOCK_UPLOAD_SOURCE" . ;;
      *' --entrypoint sh '*) exit 0 ;;
      *' --entrypoint tar '*'-xzf - '*) cat >/dev/null ;;
      *) exit 1 ;;
    esac
    ;;
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
  +%Y%m%dT%H%M%SZ) printf '%s\n' 20260813T030405Z ;;
  +%Y-%m-%dT%H:%M:%SZ) printf '%s\n' 2026-08-13T03:04:05Z ;;
esac
EOF

cat >"$mock_bin/hostname" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' restore-host
EOF

cat >"$mock_bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
[[ ${MOCK_SOURCE_DUMP_INVALID:-0} == 0 ]]
EOF

cat >"$mock_bin/sha256sum" <<'EOF'
#!/usr/bin/env bash
if [[ ${1:-} == --check && ${MOCK_SAFETY_BACKUP_FAIL:-0} == 1 ]]; then
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

reset_state() {
	rm -rf "$home/.local"
	mkdir -p "$home"
	: >"$MOCK_LOG"
	: >"$MOCK_DAEMON_FILE"
}

create_backup() {
	local path="$1"
	local project="${2:-multica}"
	local context="${3:-default}"
	local database_hash uploads_hash
	mkdir -p "$path/source-uploads"
	printf '%s\n' 'source database dump' >"$path/database.dump"
	printf '%s\n' restored >"$path/source-uploads/restored.txt"
	"$MOCK_REAL_TAR" -czf "$path/uploads.tar.gz" -C "$path/source-uploads" .
	rm -rf "$path/source-uploads"
	read -r database_hash _ < <("$MOCK_REAL_SHA256SUM" "$path/database.dump")
	read -r uploads_hash _ < <("$MOCK_REAL_SHA256SUM" "$path/uploads.tar.gz")
	cat >"$path/metadata.json" <<EOF
{
  "version": "v0.4.24",
  "project": "$project",
  "host": "source-host",
  "operatingSystem": "linux",
  "dockerContext": "$context",
  "createdAt": "2026-08-12T00:00:00Z",
  "volumes": {
    "postgres": "multica_pgdata",
    "uploads": "multica_backend_uploads"
  },
  "files": {
    "database.dump": { "sha256": "$database_hash" },
    "uploads.tar.gz": { "sha256": "$uploads_hash" }
  }
}
EOF
	(cd "$path" && "$MOCK_REAL_SHA256SUM" database.dump uploads.tar.gz metadata.json >SHA256SUMS)
}

source_backup="$work/source backup"
mkdir -p "$source_backup"
create_backup "$source_backup"
safety_path="$home/.local/share/multica-selfhost/backups/20260813T030405Z-v0.4.24"

reset_state
incomplete="$work/incomplete"
mkdir -p "$incomplete"
if env "${common_env[@]}" "$helper" restore "$incomplete" --force >"$work/incomplete.out" 2>&1; then
	fail 'incomplete restore unexpectedly succeeded'
fi
refute_log 'docker '

reset_state
checksum_bad="$work/checksum bad"
mkdir -p "$checksum_bad"
create_backup "$checksum_bad"
printf '%s\n' changed >>"$checksum_bad/database.dump"
if env "${common_env[@]}" "$helper" restore "$checksum_bad" --force >"$work/checksum.out" 2>&1; then
	fail 'checksum failure unexpectedly succeeded'
fi
refute_log 'docker '

reset_state
if env "${common_env[@]}" "$helper" restore "$source_backup" >"$work/noninteractive.out" 2>&1; then
	fail 'noninteractive restore without force unexpectedly succeeded'
fi
refute_log ' pg_dump '
refute_log ' stop backend frontend'

reset_state
if printf '%s\n' CANCEL | env "${common_env[@]}" MULTICA_SELFHOST_SOURCE_ONLY=1 \
	bash -c "source \"$helper\"; stdin_is_tty() { return 0; }; confirm_restore" \
	>"$work/refusal.out" 2>&1; then
	fail 'interactive refusal unexpectedly succeeded'
fi

reset_state
wrong_context="$work/wrong context"
mkdir -p "$wrong_context"
create_backup "$wrong_context" multica source-context
if env "${common_env[@]}" MOCK_CURRENT_CONTEXT=target-context \
	"$helper" restore "$wrong_context" >"$work/context.out" 2>&1; then
	fail 'context mismatch without force unexpectedly succeeded'
fi
refute_log ' pg_dump '
refute_log ' stop backend frontend'

reset_state
wrong_project="$work/wrong project"
mkdir -p "$wrong_project"
create_backup "$wrong_project" other-project default
if env "${common_env[@]}" "$helper" restore "$wrong_project" >"$work/project.out" 2>&1; then
	fail 'project mismatch without force unexpectedly succeeded'
fi
refute_log ' pg_dump '
refute_log ' stop backend frontend'

reset_state
if env "${common_env[@]}" MOCK_SAFETY_BACKUP_FAIL=1 \
	"$helper" restore "$source_backup" --force >"$work/safety.out" 2>&1; then
	fail 'safety backup failure unexpectedly succeeded'
fi
refute_log 'stop backend frontend'
refute_log 'dropdb'
refute_log 'createdb'

reset_state
env "${common_env[@]}" "$helper" restore "$source_backup" --force >"$work/success.out"
[[ -d $safety_path ]] || fail 'successful restore did not preserve safety backup'
expect_log 'stop backend frontend'
expect_log 'up -d postgres'
expect_log 'dropdb --if-exists --username multica multica'
expect_log 'createdb --username multica --owner multica multica'
expect_log 'pg_restore --username multica --dbname multica --no-owner --clean --if-exists'
expect_log 'run --rm --volume multica_backend_uploads:/data --entrypoint sh'
expect_log 'run --rm --interactive --volume multica_backend_uploads:/data --entrypoint tar'
expect_log ' up -d'
expect_log 'daemon start --no-auto-update --no-auto-reload'
grep -F "Restore completed from: $source_backup" "$work/success.out" >/dev/null
grep -F "Pre-restore safety backup: $safety_path" "$work/success.out" >/dev/null
refute_log 'down --volumes'

reset_state
env "${common_env[@]}" MOCK_CURRENT_CONTEXT=target-context \
	"$helper" restore "$wrong_context" --force >"$work/forced-context.out"
expect_log 'dropdb --if-exists --username multica multica'

reset_state
env "${common_env[@]}" "$helper" restore "$wrong_project" --force >"$work/forced-project.out"
expect_log 'dropdb --if-exists --username multica multica'

printf '%s\n' 'restore tests: OK'
