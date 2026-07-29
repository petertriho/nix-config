# ============================================================================
# Stylix Theme for tmux
# ============================================================================

# Dynamic Colors
# ----------------------------------------------------------------------------
mode_aware_bg="#{?client_prefix,${stylix_prefix},#{?pane_in_mode,${stylix_mode},${stylix_accent}}}"
mode_aware_fg="#{?client_prefix,${stylix_prefix},#{?pane_in_mode,${stylix_mode},${stylix_accent}}}"

# Copy Mode Styling
# ----------------------------------------------------------------------------
set -g mode-style "fg=${stylix_accent},bg=${stylix_highlight_bg}"

# Message Styling
# ----------------------------------------------------------------------------
set -g message-style "fg=${stylix_accent},bg=${stylix_highlight_bg}"
set -g message-command-style "fg=${stylix_accent},bg=${stylix_highlight_bg}"

# Pane Border Styling
# ----------------------------------------------------------------------------
set -g pane-border-style "fg=${stylix_highlight_bg}"
set -g pane-active-border-style "fg=${stylix_accent}"

# Status Bar Configuration
# ----------------------------------------------------------------------------
set -g status "on"
set -g status-justify "left"
set -g status-style "fg=${stylix_accent},bg=${stylix_status_bg}"
set -g status-left-length "200"
set -g status-right-length "100"
set -g status-left-style ${stylix_none}
set -g status-right-style ${stylix_none}

# Status Bar Content
# ----------------------------------------------------------------------------
status_left_content="#[fg=${stylix_bg},bg=${mode_aware_bg},bold] #{?client_prefix,●,○} #S "

# Date/time is lowest priority: hide the date below 140 columns, the time below 110.
# The style must stay outside the #{?} branches: unescaped commas (as in
# #[fg=...,bg=...]) act as branch separators inside conditionals.
datetime_style="#[fg=${stylix_secondary_fg},bg=${stylix_highlight_bg}]"
status_datetime="${datetime_style}#{?#{e|>=:#{client_width},140}, %Y-%m-%d ❬ %I:%M %p ,#{?#{e|>=:#{client_width},110}, %I:%M %p ,}}"

status_right_content="#[fg=${stylix_accent},bg=${stylix_status_bg}] #{prefix_highlight} "\
"#{agent_session_dots} #{agent_indicator} "\
"#(gitmux -cfg $HOME/.gitmux.conf '#{pane_current_path}') "\
"${status_datetime}"\
"#[fg=${stylix_bg},bg=${mode_aware_bg},bold] #h "

set -g status-left "${status_left_content}"
set -g status-right "${status_right_content}"

# Window Status Styling
# ----------------------------------------------------------------------------
setw -g window-status-activity-style "underscore,fg=${stylix_secondary_fg},bg=${stylix_status_bg}"
setw -g window-status-separator ""
setw -g window-status-style "${stylix_none},fg=${stylix_secondary_fg},bg=${stylix_status_bg}"

# Window Status Content
# ----------------------------------------------------------------------------
window_status_format="#[default] #I: #W "\
"#[fg=${stylix_prefix}]#F "

window_status_current_format="#[fg=${mode_aware_fg},bg=${stylix_highlight_bg},bold] #I: #W #F "

setw -g window-status-format "${window_status_format}"
setw -g window-status-current-format "${window_status_current_format}"
