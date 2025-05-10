set -gx FORGIT_FZF_DEFAULT_OPTS "$FZF_DEFAULT_OPTS"
set -gx FORGIT_LOG_GRAPH_ENABLE true

if type --query fzf_configure_bindings
    set -g fzf_fd_opts --hidden --exclude .git
    fzf_configure_bindings \
        --directory=\e\cf \
        --git_log=\e\cl \
        --git_status=\e\cs \
        --history=\e\cr \
        --processes=\e\cp \
        --variables=\e\ce
end

set -g sponge_delay 10
set -g sponge_purge_only_on_exit true

if type --query zoxide
    zoxide init fish | source
end

function delta-side-by-side --on-signal WINCH
    set -x COLUMNS $COLUMNS

    if test "$COLUMNS" -ge 180; and ! contains side-by-side "$DELTA_FEATURES"
        set --global --export --append DELTA_FEATURES side-by-side
    else if test "$COLUMNS" -lt 180; and contains side-by-side "$DELTA_FEATURES"
        set --erase DELTA_FEATURES[(contains --index side-by-side "$DELTA_FEATURES")]
    end
end

set -g ls_cmd ls

if type --query eza
    set -g ls_cmd eza
end

function ls-on-cd --on-variable PWD
    $ls_cmd --classify
end
