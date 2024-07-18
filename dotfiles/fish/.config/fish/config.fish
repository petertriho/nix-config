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

delta_side_by_side

set -g sponge_delay 10
set -g sponge_purge_only_on_exit true

if type --query zoxide
    zoxide init fish | source
end
