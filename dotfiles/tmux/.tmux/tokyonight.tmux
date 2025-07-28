# ============================================================================
# Tokyo Night Theme for tmux
# ============================================================================

# Color Palette
# ----------------------------------------------------------------------------
none="NONE"
tokyo_black="#15161e"
tokyo_blue="#7aa2f7"
tokyo_magenta="#bb9af7"
tokyo_yellow="#e0af68"
tokyo_bg_statusline="#16161e"
tokyo_bg_highlight="#292e42"
tokyo_fg_sidebar="#a9b1d6"

# Dynamic Colors
# ----------------------------------------------------------------------------
mode_aware_bg="#{?client_prefix,${tokyo_yellow},#{?pane_in_mode,${tokyo_magenta},${tokyo_blue}}}"
mode_aware_fg="#{?client_prefix,${tokyo_yellow},#{?pane_in_mode,${tokyo_magenta},${tokyo_blue}}}"

# Copy Mode Styling
# ----------------------------------------------------------------------------
set -g mode-style "fg=${tokyo_blue},bg=${tokyo_bg_highlight}"

# Message Styling
# ----------------------------------------------------------------------------
set -g message-style "fg=${tokyo_blue},bg=${tokyo_bg_highlight}"
set -g message-command-style "fg=${tokyo_blue},bg=${tokyo_bg_highlight}"

# Pane Border Styling
# ----------------------------------------------------------------------------
set -g pane-border-style "fg=${tokyo_bg_highlight}"
set -g pane-active-border-style "fg=${tokyo_blue}"

# Status Bar Configuration
# ----------------------------------------------------------------------------
set -g status "on"
set -g status-justify "left"
set -g status-style "fg=${tokyo_blue},bg=${tokyo_bg_statusline}"
set -g status-left-length "200"
set -g status-right-length "100"
set -g status-left-style ${none}
set -g status-right-style ${none}

# Status Bar Content
# ----------------------------------------------------------------------------
status_left_content="#[fg=${tokyo_black},bg=${mode_aware_bg},bold] #{?client_prefix,●,○} #S "

status_right_content="#[fg=${tokyo_blue},bg=${tokyo_bg_statusline}] #{prefix_highlight} "\
"#(gitmux -cfg $HOME/.gitmux.conf '#{pane_current_path}') "\
"#[fg=${tokyo_fg_sidebar},bg=${tokyo_bg_highlight}] %Y-%m-%d ❬ %I:%M %p "\
"#[fg=${tokyo_black},bg=${mode_aware_bg},bold] #h "

set -g status-left "${status_left_content}"
set -g status-right "${status_right_content}"

# Window Status Styling
# ----------------------------------------------------------------------------
setw -g window-status-activity-style "underscore,fg=${tokyo_fg_sidebar},bg=${tokyo_bg_statusline}"
setw -g window-status-separator ""
setw -g window-status-style "${none},fg=${tokyo_fg_sidebar},bg=${tokyo_bg_statusline}"

# Window Status Content
# ----------------------------------------------------------------------------
window_status_format="#[default] #I: #W "\
"#[fg=${tokyo_yellow}]#F "

window_status_current_format="#[fg=${mode_aware_fg},bg=${tokyo_bg_highlight},bold] #I: #W #F "

setw -g window-status-format "${window_status_format}"
setw -g window-status-current-format "${window_status_current_format}"
