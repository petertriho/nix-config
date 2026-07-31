function set-iris-keys --description "Set IRIS API keys from opencode auth"
    set -l auth_file "$HOME/.local/share/opencode/auth.json"
    set -l config_file "$HOME/.config/iris/config.toml"

    if not test -f "$auth_file"
        echo "Error: $auth_file not found" >&2
        return 1
    end

    if not test -f "$config_file"
        echo "Error: $config_file not found" >&2
        return 1
    end

    set -l providers (yq -r '.ai.providers | keys | .[]' "$config_file")
    set -l set_keys
    set -l missing_providers

    for provider in $providers
        set -l key (jq -r --arg provider "$provider" '.[$provider].key // empty' "$auth_file")
        set -l api_key_env (yq -r ".ai.providers.\"$provider\".api_key_env // \"\"" "$config_file")

        if test -n "$key" -a -n "$api_key_env"
            set -Ux "$api_key_env" "$key"
            echo "$api_key_env set from auth.json"
            set -a set_keys $provider
        else
            set -a missing_providers $provider
        end
    end

    if test (count $set_keys) -gt 0
        echo ""
        echo "Set these model IDs manually:"
        for provider in $set_keys
            set -l model_env (yq -r ".ai.providers.\"$provider\".model_env // \"\"" "$config_file")
            if test -n "$model_env"
                echo "  set -Ux $model_env <model>"
            end
        end
    end

    if test (count $missing_providers) -gt 0
        echo ""
        echo "No keys found for: "(string join ', ' $missing_providers) >&2
    end
end
