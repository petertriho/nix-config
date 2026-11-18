#!/usr/bin/env bash
#
# turn-signal.sh: the hook command of tmux-worker workers.
#
# tmux-worker starts each worker with --settings worker-settings.json, which
# runs this script for the events below. Claude Code passes the hook input as
# JSON on stdin. The script appends one JSON line to
# $TMUX_WORKER_DIR/turns.jsonl:
#
#   {"seq":N,"event":"stop|error|waiting|working|interrupted","text":"...","message":"...",
#    "session_id":"...","ts":EPOCH}
#
# seq is the line number. tmux-worker wait and send read the file.
# "interrupted" comes from tmux-worker interrupt, because Claude Code runs no
# hook when a turn is interrupted. The script always exits 0: a hook failure
# must never block or stop the worker.

event=${1:-}
dir=${TMUX_WORKER_DIR:-}
# Other Claude sessions can load the same settings file by mistake. Without
# the worker variables, do nothing.
[ -n "$event" ] && [ -n "$dir" ] && [ -d "$dir" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat 2>/dev/null) || input=""
[ -n "$input" ] || input='{}'
file="$dir/turns.jsonl"

last_event() {
    [ -s "$file" ] || return 0
    tail -n 1 "$file" | jq -r '.event // empty' 2>/dev/null
}

# The last assistant text in the transcript. Used when the Stop input has no
# last_assistant_message. Only the tail is read, because a transcript can be
# many megabytes.
transcript_text() {
    local path
    path=$(jq -r '.transcript_path // empty' <<<"$input" 2>/dev/null)
    [ -n "$path" ] && [ -f "$path" ] || return 0
    tail -n 400 "$path" | jq -rs '
        [ .[] | select(.type == "assistant")
          | [ .message.content[]? | select(.type == "text") | .text ] | join("\n")
          | select(length > 0) ] | last // empty' 2>/dev/null
}

text=""
message=""
case "$event" in
stop)
    text=$(jq -r '.last_assistant_message // empty' <<<"$input" 2>/dev/null)
    [ -n "$text" ] || text=$(transcript_text)
    ;;
error)
    message=$(jq -r '(.error // .error_message // .message // empty) | if type == "string" then . else tojson end' <<<"$input" 2>/dev/null)
    text=$(jq -r '.last_assistant_message // empty' <<<"$input" 2>/dev/null)
    ;;
waiting)
    message=$(jq -r '.message // empty' <<<"$input" 2>/dev/null)
    ;;
working)
    # UserPromptSubmit: a turn starts. Write only a change of state.
    [ "$(last_event)" = working ] && exit 0
    ;;
tool)
    # PostToolUse runs for each tool call. It only clears a waiting status
    # after an approved dialog. After an interrupt, the tool call of the
    # interrupted turn also returns, and the worker is idle, not working.
    [ "$(last_event)" = waiting ] || exit 0
    event=working
    ;;
interrupted) ;;
*)
    exit 0
    ;;
esac

# mkdir is atomic, so it serializes the writers of one worker.
lock="$dir/.turns.lock"
tries=0
until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    # A stale lock from a killed hook: take it over after about 5 seconds.
    if [ "$tries" -ge 50 ]; then
        break
    fi
    sleep 0.1
done
trap 'rmdir "$lock" 2>/dev/null' EXIT

seq=1
if [ -s "$file" ]; then
    seq=$(($(wc -l <"$file" | tr -d ' ') + 1))
fi
session_id=$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null)
jq -cn --argjson seq "$seq" --arg event "$event" --arg text "$text" \
    --arg message "$message" --arg session_id "$session_id" --argjson ts "$(date +%s)" \
    '{seq: $seq, event: $event, text: $text, message: $message, session_id: $session_id, ts: $ts}' \
    >>"$file" 2>/dev/null
exit 0
