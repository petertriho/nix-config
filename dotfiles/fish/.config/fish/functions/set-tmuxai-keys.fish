function set-tmuxai-keys --description "Set TMUXAI API keys from opencode auth"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l config_file "$HOME/.config/tmuxai/config.yaml"

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    if not test -f "$config_file"
        echo "Error: $config_file not found" >&2
        return 1
    end

    set -l models (yq '.models | keys | .[]' "$config_file")
    set -l set_keys
    set -l missing_models

    for model in $models
        set -l key (jq -r --arg m "$model" '.[$m].key // empty' "$auth_file")

        if test -n "$key"
            set -l env_name (string upper -- $model | string replace -a -- - _)
            set -Ux "TMUXAI_$env_name"_API_KEY "$key"
            echo "✓ TMUXAI_$env_name"_API_KEY" set from auth.json"
            set -a set_keys $model
        else
            set -a missing_models $model
        end
    end

    if test (count $set_keys) -gt 0
        echo ""
        echo "Set these model IDs manually:"
        for model in $set_keys
            set -l env_name (string upper -- $model | string replace -a -- - _)
            echo "  set -Ux TMUXAI_$env_name"_MODEL" <model>"
        end
    end

    if test (count $missing_models) -gt 0
        echo ""
        echo "⚠ No keys found for: "(string join ', ' $missing_models) >&2
    end
end
