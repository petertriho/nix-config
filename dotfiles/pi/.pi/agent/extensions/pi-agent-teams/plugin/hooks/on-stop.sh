#!/usr/bin/env bash
# Stop hook for pi-spawned Claude sessions.
# Writes a sentinel file when Claude completes autonomously (no user interjection).

set -euo pipefail

# Read JSON input from stdin
input=$(cat)

# Guard: if stop_hook_active is true, we're in a loop — bail out
stop_hook_active=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stop_hook_active', False))" 2>/dev/null || echo "False")
if [ "$stop_hook_active" = "True" ]; then
  exit 0
fi

# Guard: only act for pi-spawned sessions
if [ -z "${PI_CLAUDE_SENTINEL:-}" ]; then
  exit 0
fi

# Get transcript path
transcript_path=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('transcript_path', ''))" 2>/dev/null || echo "")
if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  exit 0
fi

# Check real human messages in transcript (not tool results). A resumed session
# already contains earlier human turns, so a new launch binds its exact prompt
# hash instead of relying on the single-message legacy heuristic.
# Claude's transcript format:
#   Human message: {"type": "user", "message": {"role": "user", "content": "..."}}
#   Tool result:   {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", ...}]}}
# We only count entries where content is a string (real human input)
is_autonomous=$(python3 - "$transcript_path" <<'EOF'
import sys, json, os, hashlib, re

transcript_path = sys.argv[1]
human = []
invalid = False
with open(transcript_path, 'r') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            if entry.get('type') != 'user':
                continue
            content = entry.get('message', {}).get('content', '')
            # Real human messages have string content
            # Tool results have array content with tool_result blocks
            if isinstance(content, str):
                human.append(content)
        except (json.JSONDecodeError, AttributeError):
            invalid = True
expected = os.environ.get("PI_CLAUDE_PROMPT_HASH")
if invalid:
    print(False)
elif expected:
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        print(False)
    else:
        hashes = [hashlib.sha256(content.encode()).hexdigest() for content in human]
        print(bool(hashes) and hashes[-1] == expected and hashes.count(expected) == 1)
else:
    print(len(human) == 1)
EOF
)

# Always write transcript path so the watcher can copy the session file
if [ -n "$transcript_path" ]; then
  echo "$transcript_path" > "${PI_CLAUDE_SENTINEL}.transcript" 2>/dev/null || true
fi

# Signal completion only when no later human message superseded the launch.
if [ "$is_autonomous" = "True" ]; then
  # Write last_assistant_message to sentinel so the watcher gets a clean result
  echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('last_assistant_message', ''))" > "$PI_CLAUDE_SENTINEL" 2>/dev/null || touch "$PI_CLAUDE_SENTINEL"
fi

exit 0
