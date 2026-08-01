function zai --description "Run Claude Code with Z.ai credentials from OpenCode auth"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l provider "zai-coding-plan"

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    set -l key (jq -r --arg provider "$provider" '.[$provider].key // empty' "$auth_file")
    if test $status -ne 0 -o -z "$key"
        echo "Error: No key found for provider '$provider'" >&2
        return 1
    end

    set -lx ANTHROPIC_AUTH_TOKEN "$key"
    command claude $argv
end
