function set-grip-key --description "Set Grip env vars from tmuxai config"
    set -l config_file "$HOME/.config/tmuxai/config.yaml"
    set -l provider $argv[1]

    if not test -f "$config_file"
        echo "Error: $config_file not found" >&2
        return 1
    end

    set -l available_models (yq '.models | keys | .[]' "$config_file")

    if test -z "$provider"
        echo "Error: Missing model name" >&2
        echo "Available models: "(string join ', ' $available_models) >&2
        return 1
    end

    set -l model_exists (yq ".models | has(\"$provider\")" "$config_file")
    if test "$model_exists" != true
        echo "Error: Unknown model '$provider'" >&2
        echo "Available models: "(string join ', ' $available_models) >&2
        return 1
    end

    set -l grip_model (yq -r ".models.\"$provider\".model // \"\"" "$config_file")
    set -l grip_api_key (yq -r ".models.\"$provider\".api_key // \"\"" "$config_file")
    set -l grip_base_url (yq -r ".models.\"$provider\".base_url // \"\"" "$config_file")

    for field in grip_model grip_api_key grip_base_url
        if test -z "$$field"
            echo "Error: Missing required field '(string replace grip_ '' -- $field)' for model '$provider'" >&2
            return 1
        end

        if string match -rq '^\$\{[A-Za-z_][A-Za-z0-9_]*\}$' -- "$$field"
            set -l env_name (string replace -r '^\$\{(.+)\}$' '$1' -- "$$field")

            if not set -q $env_name
                echo "Error: Environment variable '$env_name' is not set" >&2
                return 1
            end

            set $field "$$env_name"
        end
    end

    set -Ux GRIP_MODEL "$grip_model"
    set -Ux GRIP_API_KEY "$grip_api_key"
    set -Ux GRIP_BASE_URL "$grip_base_url"

    echo "Grip variables set from tmuxai model '$provider'"
end
