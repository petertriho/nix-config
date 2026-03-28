function set-anthropic-key --description "Set ANTHROPIC_AUTH_TOKEN from opencode auth (zai-coding-plan)"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l provider "zai-coding-plan"

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    set -l key (jq -r --arg p "$provider" '.[$p].key // empty' "$auth_file")

    if test -z "$key"
        echo "Error: No key found for provider '$provider'" >&2
        return 1
    end

    set -Ux ANTHROPIC_AUTH_TOKEN "$key"
    echo "ANTHROPIC_AUTH_TOKEN set from '$provider'"
end
