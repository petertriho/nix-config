function set-minuet-ai-keys --description "Set Minuet OpenAI-compatible env from opencode auth"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l config_file "$HOME/.config/tmuxai/config.yaml"
    set -l provider $argv[1]

    if test -z "$provider"; or test "$provider" = "--help"; or test "$provider" = "-h"
        echo "Usage: set-minuet-ai-keys <opencode-provider>" >&2
        return 1
    end

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    if not test -f "$config_file"
        echo "Error: $config_file not found" >&2
        return 1
    end

    set -l key (jq -r --arg p "$provider" '.[$p].key // empty' "$auth_file")

    if test -z "$key"
        echo "Error: No key found for provider '$provider'" >&2
        return 1
    end

    set -lx tmuxai_model "$provider"
    set -l base_url (yq -r '.models[env(tmuxai_model)].base_url // ""' "$config_file")
    set -l model_value (yq -r '.models[env(tmuxai_model)].model // ""' "$config_file")

    if test -z "$base_url"
        echo "Error: No tmuxai base_url found for '$provider'" >&2
        return 1
    end

    set -l end_point (string replace -r '/+$' '' -- "$base_url")
    if not string match -qr '/chat/completions$' -- "$end_point"
        set end_point "$end_point/chat/completions"
    end

    set -Ux MINUET_OPENAI_COMPATIBLE_API_KEY "$key"
    set -Ux MINUET_OPENAI_COMPATIBLE_END_POINT "$end_point"

    echo "MINUET_OPENAI_COMPATIBLE_API_KEY set from '$provider'"
    echo "MINUET_OPENAI_COMPATIBLE_END_POINT set to '$end_point'"

    if test -n "$model_value"
        set -l tmuxai_model_env (string replace -r '^\$\{([^}]+)\}$' '$1' -- "$model_value")
        echo ""
        echo "Set the Minuet model manually:"
        if test "$tmuxai_model_env" != "$model_value"
            echo "  set -Ux MINUET_OPENAI_COMPATIBLE_MODEL \$$tmuxai_model_env"
        else
            echo "  set -Ux MINUET_OPENAI_COMPATIBLE_MODEL <model>"
        end
    end
end
