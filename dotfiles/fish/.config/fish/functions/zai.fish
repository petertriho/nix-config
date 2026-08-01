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
    set -lx ANTHROPIC_BASE_URL "https://api.z.ai/api/anthropic"
    set -lx API_TIMEOUT_MS "3000000"
    set -lx ANTHROPIC_DEFAULT_HAIKU_MODEL "glm-4.7"
    set -lx ANTHROPIC_DEFAULT_SONNET_MODEL "glm-5-turbo"
    set -lx ANTHROPIC_DEFAULT_OPUS_MODEL "glm-5.2[1m]"
    command claude $argv
end
