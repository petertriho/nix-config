function nono-agent-run --description "Run an agent with a guarded nono profile"
    if test (count $argv) -lt 2
        echo "Usage: nono-agent-run <profile> <agent> [arguments...]" >&2
        return 2
    end

    set -l profile $argv[1]
    set -l agent $argv[2]
    set -l agent_args $argv[3..-1]
    set -l physical_cwd (pwd -P)
    or begin
        echo "Error: Cannot resolve the current directory" >&2
        return 1
    end

    set -l physical_home (path resolve -- "$HOME")
    or set physical_home "$HOME"

    if test "$physical_cwd" = / -o "$physical_cwd" = "$physical_home"
        echo "Error: Refusing to grant nono access to '$physical_cwd'" >&2
        echo "Run from a project directory, or use the full nono command for a deliberate exception." >&2
        return 1
    end

    command nono run --profile "$profile" --allow-cwd -- "$agent" $agent_args
end
