set -gx DIRENV_LOG_FORMAT ""

set -gx FZF_DEFAULT_OPTS \
    --ansi \
    --exact \
    --border \
    --cycle \
    --reverse \
    "--height '80%'" \
    "--bind 'ctrl-space:toggle-preview'" \
    "--bind 'ctrl-d:preview-half-page-down,ctrl-u:preview-half-page-up'" \
    "--bind 'alt-a:select-all,alt-d:deselect-all'" \
    "--color=dark" \
    "--color=border:7,fg:-1,bg:-1,hl:5,fg+:7,bg+:8,hl+:5" \
    "--color=info:6,prompt:2,pointer:2,marker:3,spinner:1,header:4"

set -gx FORGIT_FZF_DEFAULT_OPTS "$FZF_DEFAULT_OPTS"
set -gx FORGIT_LOG_GRAPH_ENABLE true

if type --query fzf_configure_bindings
    set -g fzf_fd_opts --hidden --exclude .git
    fzf_configure_bindings \
        --directory=\e\cf \
        --git_log=\e\cl \
        --git_status=\e\cs \
        --history=\e\cr \
        --variable=\e\ce
end

delta_side_by_side

set -g sponge_delay 10
set -g sponge_purge_only_on_exit true

if command -v zoxide &>/dev/null
    zoxide init fish | source
    set -gx _ZO_FZF_OPTS "$FZF_DEFAULT_OPTS --keep-right --exit-0 --select-1 --preview='command eza {2..}' --preview-window=bottom"
end
