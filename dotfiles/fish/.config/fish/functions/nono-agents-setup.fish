function nono-agents-setup --description "Install nono agent packs and validate custom profiles"
    for dependency in nono jq
        if not type -q $dependency
            echo "Error: '$dependency' is required" >&2
            return 1
        end
    end

    # Keep network downloads and mutable pack wiring out of Home Manager activation.
    command nono setup --check-only
    or return 1

    set -l installed_json (command nono list --installed --json)
    or return 1

    string join \n -- $installed_json | command jq -e '.packages | type == "object"' >/dev/null
    or begin
        echo "Error: nono returned an invalid installed-pack list" >&2
        return 1
    end

    set -l packs \
        nolabs-ai/claude \
        nolabs-ai/pi \
        nolabs-ai/opencode

    for pack in $packs
        if string join \n -- $installed_json | command jq -e --arg pack "$pack" '.packages | has($pack)' >/dev/null
            command nono update "$pack"
        else
            command nono pull "$pack"
        end
        or return 1
    end

    set -l profiles claude-nixcfg pi-nixcfg opencode-nixcfg
    for profile in $profiles
        command nono profile validate "$profile"
        or return 1
    end

    echo
    echo "Sandboxed agent commands:"
    echo "  nono-agent-run claude-nixcfg claude"
    echo "  nono-agent-run pi-nixcfg pi"
    echo "  nono-agent-run opencode-nixcfg opencode"
end
