#!/usr/bin/env bash
# The jq programs in this script use jq variables, not shell interpolation.
# shellcheck disable=SC2016
set -euo pipefail

# Sync dotfiles/multica/{skills,agents} into the configured Multica workspace.
# Idempotent: matches skills and agents by name, creates or updates as needed,
# and never touches workspace objects it does not manage (e.g. built-in agents).

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
readonly SCRIPT_DIR
readonly SKILLS_DIR="$SCRIPT_DIR/skills"
readonly AGENTS_DIR="$SCRIPT_DIR/agents"
readonly MULTICA_BIN="${MULTICA_SYNC_MULTICA:-multica}"
readonly JQ_BIN="${MULTICA_SYNC_JQ:-jq}"

readonly SKILL_FRONTMATTER_KEYS="name description"
readonly AGENT_FRONTMATTER_KEYS="description runtime model thinking-level skills max-concurrent-tasks"

DRY_RUN=false
SUMMARY=()

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: sync.sh [--dry-run]

Sync local Multica skills and agents into the configured workspace.

  --dry-run   Show the create/update calls without executing them
EOF
}

command_available() {
  command -v "$1" >/dev/null 2>&1
}

run_mutation() {
  if [[ $DRY_RUN == true ]]; then
    log "DRY-RUN: $*"
    return 0
  fi
  "$@"
}

record() {
  SUMMARY+=("$1")
}

# --- frontmatter -------------------------------------------------------------

frontmatter() {
  awk 'NR==1 { if ($0 != "---") exit 1; next } /^---$/ { exit } { print }' "$1"
}

file_body() {
  awk 'NR==1 && $0=="---" { fm=1; next }
       fm && /^---$/ { fm=0; body=1; next }
       body { print }' "$1"
}

frontmatter_value() {
  local text="$1" key="$2"
  awk -v k="$key" '
    index($0, k ": ") == 1 { sub("^" k ": ", ""); print; exit }
  ' <<<"$text"
}

frontmatter_list() {
  local text="$1" key="$2"
  awk -v k="$key" '
    $0 == k ":" { in_list = 1; next }
    in_list && /^  - / { sub(/^  - /, ""); print; next }
    in_list { exit }
  ' <<<"$text"
}

validate_frontmatter_keys() {
  local text="$1" allowed="$2" origin="$3" key
  while IFS= read -r key; do
    [[ " $allowed " == *" $key "* ]] || die "$origin: unknown frontmatter key: $key"
  done < <(awk -F: '/^[a-z][a-z-]*:/ { print $1 }' <<<"$text")
}

# --- preflight ---------------------------------------------------------------

preflight() {
  command_available "$MULTICA_BIN" || die "multica CLI not found: $MULTICA_BIN"
  command_available "$JQ_BIN" || die "jq not found: $JQ_BIN"
  [[ -d $SKILLS_DIR ]] || die "skills directory not found: $SKILLS_DIR"
  [[ -d $AGENTS_DIR ]] || die "agents directory not found: $AGENTS_DIR"
  "$MULTICA_BIN" auth status >/dev/null 2>&1 ||
    die "multica CLI is not authenticated; run 'multica-selfhost login' or 'multica setup'"
  RUNTIMES_JSON=$("$MULTICA_BIN" runtime list --output json)
}

resolve_runtime_id() {
  local provider="$1" runtime_id
  runtime_id=$("$JQ_BIN" -r --arg p "$provider" \
    '[.[] | select(.provider == $p and .status == "online")][0].id // empty' <<<"$RUNTIMES_JSON")
  [[ -n $runtime_id ]] ||
    die "no online runtime with provider '$provider'; run 'multica daemon start' and retry"
  printf '%s\n' "$runtime_id"
}

# --- skills ------------------------------------------------------------------

skill_id_by_name() {
  "$JQ_BIN" -r --arg n "$1" '.[] | select(.name == $n) | .id' <<<"$SKILLS_JSON"
}

sync_skill() {
  local dir="$1" name description body skill_file skill_id remote extra
  name=$(basename "$dir")
  skill_file="$dir/SKILL.md"
  [[ -f $skill_file ]] || die "skill '$name' is missing SKILL.md"

  local fm
  fm=$(frontmatter "$skill_file") || die "skill '$name': SKILL.md has no frontmatter"
  validate_frontmatter_keys "$fm" "$SKILL_FRONTMATTER_KEYS" "skill '$name'"
  [[ $(frontmatter_value "$fm" name) == "$name" ]] ||
    die "skill '$name': frontmatter name must match directory name"
  description=$(frontmatter_value "$fm" description)
  [[ -n $description ]] || die "skill '$name': frontmatter description is required"
  body=$(file_body "$skill_file")
  [[ -n $body ]] || die "skill '$name': SKILL.md body is empty"

  skill_id=$(skill_id_by_name "$name")
  if [[ -z $skill_id ]]; then
    if [[ $DRY_RUN == true ]]; then
      log "DRY-RUN: multica skill create --name $name --description ... --content-stdin"
      record "skill $name: would create"
    else
      skill_id=$(printf '%s\n' "$body" |
        "$MULTICA_BIN" skill create --name "$name" --description "$description" \
          --content-stdin --output json | "$JQ_BIN" -r '.id')
      record "skill $name: created"
    fi
  else
    remote=$("$MULTICA_BIN" skill get "$skill_id" --output json)
    if [[ $("$JQ_BIN" -r '.description // ""' <<<"$remote") == "$description" &&
    $("$JQ_BIN" -r '.content // ""' <<<"$remote") == "$body" ]]; then
      record "skill $name: unchanged"
    else
      printf '%s\n' "$body" | run_mutation "$MULTICA_BIN" skill update "$skill_id" \
        --description "$description" --content-stdin --output json >/dev/null
      record "skill $name: updated"
    fi
  fi

  # Extra files bundled with the skill (anything beyond SKILL.md).
  while IFS= read -r extra; do
    [[ -n $extra ]] || continue
    if [[ -z $skill_id ]]; then
      log "DRY-RUN: multica skill files upsert <new:$name> --path $extra --content-stdin"
      continue
    fi
    run_mutation "$MULTICA_BIN" skill files upsert "$skill_id" \
      --path "$extra" --content-file "$dir/$extra" --output json >/dev/null
  done < <(cd "$dir" && find . -type f ! -name SKILL.md | sed 's|^\./||')

  # Remove remote skill files that no longer exist locally.
  if [[ -n $skill_id && $DRY_RUN == false ]]; then
    while IFS= read -r extra; do
      [[ -n $extra && ! -f $dir/$extra ]] || continue
      run_mutation "$MULTICA_BIN" skill files delete "$skill_id" --path "$extra" >/dev/null
    done < <("$MULTICA_BIN" skill get "$skill_id" --output json |
      "$JQ_BIN" -r '.files[]?.path // empty')
  fi
}

sync_skills() {
  local dir
  SKILLS_JSON=$("$MULTICA_BIN" skill list --output json)
  for dir in "$SKILLS_DIR"/*/; do
    [[ -d $dir ]] || continue
    sync_skill "${dir%/}"
  done
  # Refresh so agents can resolve ids of freshly created skills.
  SKILLS_JSON=$("$MULTICA_BIN" skill list --output json)
}

# --- agents ------------------------------------------------------------------

agent_json_by_name() {
  "$JQ_BIN" -c --arg n "$1" \
    '[.[] | select(.name == $n and .archived_at == null)][0] // empty' <<<"$AGENTS_JSON"
}

sync_agent() {
  local file="$1" name fm description runtime model thinking instructions
  local max_tasks agent agent_id runtime_id
  name=$(basename "$file" .md)

  fm=$(frontmatter "$file") || die "agent '$name': missing frontmatter"
  validate_frontmatter_keys "$fm" "$AGENT_FRONTMATTER_KEYS" "agent '$name'"
  description=$(frontmatter_value "$fm" description)
  runtime=$(frontmatter_value "$fm" runtime)
  model=$(frontmatter_value "$fm" model)
  thinking=$(frontmatter_value "$fm" thinking-level)
  max_tasks=$(frontmatter_value "$fm" max-concurrent-tasks)
  instructions=$(file_body "$file")
  for required in description runtime model thinking instructions; do
    [[ -n ${!required} ]] || die "agent '$name': frontmatter/body field is required: $required"
  done

  runtime_id=$(resolve_runtime_id "$runtime")

  local create_args=(
    --description "$description"
    --runtime-id "$runtime_id"
    --model "$model"
    --thinking-level "$thinking"
    --instructions "$instructions"
  )
  [[ -n $max_tasks ]] && create_args+=(--max-concurrent-tasks "$max_tasks")

  agent=$(agent_json_by_name "$name")
  if [[ -z $agent ]]; then
    if [[ $DRY_RUN == true ]]; then
      log "DRY-RUN: multica agent create --name $name --model $model --thinking-level $thinking --runtime-id $runtime_id ..."
      record "agent $name: would create"
      agent_id=""
    else
      agent_id=$("$MULTICA_BIN" agent create --name "$name" "${create_args[@]}" \
        --output json | "$JQ_BIN" -r '.id')
      record "agent $name: created"
    fi
  else
    agent_id=$("$JQ_BIN" -r '.id' <<<"$agent")
    local desired current
    desired=$("$JQ_BIN" -n \
      --arg d "$description" --arg m "$model" --arg t "$thinking" \
      --arg i "$instructions" --arg r "$runtime_id" \
      '{description: $d, model: $m, thinking_level: $t, instructions: $i, runtime_id: $r}')
    current=$("$JQ_BIN" -c \
      '{description, model, thinking_level, instructions, runtime_id}' <<<"$agent")
    if [[ $("$JQ_BIN" -cS . <<<"$desired") == "$("$JQ_BIN" -cS . <<<"$current")" ]]; then
      record "agent $name: unchanged"
    else
      run_mutation "$MULTICA_BIN" agent update "$agent_id" \
        "${create_args[@]}" --output json >/dev/null
      record "agent $name: updated"
    fi
  fi

  sync_agent_skills "$name" "$agent_id" "$fm"
}

sync_agent_skills() {
  local name="$1" agent_id="$2" fm="$3"
  local skill_name skill_id desired_ids=() current_ids desired_csv

  while IFS= read -r skill_name; do
    [[ -n $skill_name ]] || continue
    skill_id=$(skill_id_by_name "$skill_name")
    if [[ -z $skill_id ]]; then
      if [[ $DRY_RUN == true ]]; then
        log "DRY-RUN: agent $name: would assign skill '$skill_name' (not created yet)"
        continue
      fi
      die "agent '$name': skill '$skill_name' does not exist in the workspace"
    fi
    desired_ids+=("$skill_id")
  done < <(frontmatter_list "$fm" skills)

  if [[ -z $agent_id ]]; then
    return 0
  fi

  desired_csv=$(
    IFS=,
    printf '%s' "${desired_ids[*]-}"
  )
  current_ids=$("$MULTICA_BIN" agent skills list "$agent_id" --output json |
    "$JQ_BIN" -r '[.[] | .id] | sort | join(",")')
  if [[ $("$JQ_BIN" -rn --arg s "$desired_csv" '$s | split(",") | sort | join(",")') == "$current_ids" ]]; then
    return 0
  fi
  run_mutation "$MULTICA_BIN" agent skills set "$agent_id" \
    --skill-ids "$desired_csv" --output json >/dev/null
  record "agent $name: skills set (${#desired_ids[@]})"
}

sync_agents() {
  local file
  AGENTS_JSON=$("$MULTICA_BIN" agent list --output json)
  for file in "$AGENTS_DIR"/*.md; do
    [[ -f $file ]] || continue
    sync_agent "$file"
  done
}

# --- main --------------------------------------------------------------------

main() {
  case "${1:-}" in
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      usage
      return 0
      ;;
    "") ;;
    *) die "unknown argument: $1" ;;
  esac

  preflight
  sync_skills
  sync_agents

  log ""
  log "Summary:"
  local line
  for line in "${SUMMARY[@]-}"; do
    log "  $line"
  done
}

main "$@"
