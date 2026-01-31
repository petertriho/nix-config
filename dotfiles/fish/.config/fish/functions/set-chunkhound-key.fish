function set-chunkhound-key --description "Set CHUNKHOUND_EMBEDDING__API_KEY from opencode auth"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l provider (string lower -- $argv[1])

    # Default to openrouter if no argument provided
    if test -z "$provider"
        set provider openrouter
    end

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    set -l key (jq -r --arg p "$provider" '.[$p].key // empty' "$auth_file")

    if test -z "$key"
        echo "Error: No key found for provider '$provider'" >&2
        echo "Available providers:" >&2
        jq -r 'keys[]' "$auth_file" >&2
        return 1
    end

    set -Ux CHUNKHOUND_EMBEDDING__API_KEY "$key"
    echo "CHUNKHOUND_EMBEDDING__API_KEY set from '$provider'"
end
