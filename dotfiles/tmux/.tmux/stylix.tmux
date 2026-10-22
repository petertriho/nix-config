# ============================================================================
# Stylix Theme for tmux
# ============================================================================
# The stylix_* colour variables come from home/programs/tmux.nix.

# Theme Colours
# ----------------------------------------------------------------------------
# Resolve tmux's built-in theme colours (themeblue, themedarkgrey, ...) to the
# terminal ANSI palette, which Stylix also sets, instead of fixed RGB values.
set -s theme terminal

# Yellow while the prefix is active, magenta in copy mode and other modes,
# blue otherwise.
%hidden mode_colour="#{?client_prefix,${stylix_yellow},#{?pane_in_mode,${stylix_magenta},${stylix_blue}}}"
%hidden mode_symbol="#{?client_prefix,●,#{?pane_in_mode,◆,○}}"

# Status Bar
# ----------------------------------------------------------------------------
set -g status "on"
set -g status-justify "left"
set -g status-style "fg=${stylix_fg},bg=${stylix_bg_alt}"
set -g status-left-length "200"
set -g status-right-length "200"
set -g status-left-style "default"
set -g status-right-style "default"

set -g status-left "#[fg=${stylix_bg_darker},bg=${mode_colour},bold] ${mode_symbol} #S #[fg=${mode_colour},bg=${stylix_bg_alt},nobold]"

# The date hides below 140 columns and the time below 110. Styles stay outside
# #{?} branches, because the commas in #[fg=...,bg=...] separate branches.
%hidden datetime_visible="#{e|>=:#{client_width},110}"
%hidden status_datetime="#[fg=${stylix_selection},bg=${stylix_bg_alt}]#{?${datetime_visible},,}"\
"#[fg=${stylix_fg},bg=${stylix_selection}]"\
"#{?#{e|>=:#{client_width},140}, 󰃭 %Y-%m-%d,}"\
"#{?${datetime_visible}, 󰥔 %I:%M %p ,}"
%hidden hostname_cap_bg="#{?${datetime_visible},${stylix_selection},${stylix_bg_alt}}"

set -g status-right "#{agent_session_dots} #{agent_indicator} "\
"#(gitmux -cfg $HOME/.gitmux.conf '#{pane_current_path}') "\
"${status_datetime}"\
"#[fg=${mode_colour},bg=${hostname_cap_bg}]#[fg=${stylix_bg_darker},bg=${mode_colour},bold] #h "

# Window List
# ----------------------------------------------------------------------------
# Inactive windows keep #[default] so per-window window-status-style overrides
# (set by agent-indicator) still colour them. * marks the current window and -
# the last window, as in tmux's own #F flags.
%hidden window_flags="#{?window_active, *,}"\
"#{?window_last_flag, -,}"\
"#{?window_zoomed_flag, 󰊓,}"\
"#{?window_bell_flag, 󰂞,}"\
"#{?window_activity_flag, 󰐰,}"\
"#{?window_silence_flag, 󰒲,}"\
"#{?window_marked_flag, 󰃀,}"\
"#{?pane_synchronized, 󰓦,}"\
"#{?@workmux_status, #{@workmux_status},}"

setw -g window-status-separator ""
setw -g window-status-style "fg=${stylix_fg},bg=${stylix_bg_alt}"
setw -g window-status-current-style "default"
setw -g window-status-last-style "default"
setw -g window-status-activity-style "fg=${stylix_fg_light}"
setw -g window-status-bell-style "fg=${stylix_red}"

setw -g window-status-format "#[default]  #I #W${window_flags}  "
setw -g window-status-current-format "#[fg=${stylix_selection},bg=${stylix_bg_alt}]"\
"#[fg=${mode_colour},bg=${stylix_selection},bold] #I #W${window_flags} "\
"#[fg=${stylix_selection},bg=${stylix_bg_alt},nobold]"

# Panes
# ----------------------------------------------------------------------------
set -g pane-border-lines "single"
set -g pane-border-indicators "colour"
set -g pane-border-style "fg=${stylix_selection}"
set -g pane-active-border-style "fg=#{?client_prefix,${stylix_yellow},#{?pane_in_mode,${stylix_magenta},#{?synchronize-panes,${stylix_red},${stylix_blue}}}}"
set -g display-panes-colour "${stylix_comment}"
set -g display-panes-active-colour "${stylix_blue}"
set -g display-panes-border-style "fg=${stylix_comment}"
set -g fill-character "#{?is_inside, ,#[fg=${stylix_selection}]#[acs]~}"
setw -g clock-mode-colour "${stylix_blue}"

# Messages and Prompts
# ----------------------------------------------------------------------------
# fill= makes a message or prompt cover the whole status line. It is skipped
# for prompts drawn inside a pane or mode, as in the tmux default.
%hidden message_fill="#{?#{m/r:(^|#,)IS(PANE|MODE)($|#,),#{prompt_flags}},,fill=${stylix_selection}}"
set -g message-style "fg=${stylix_fg_light},bg=${stylix_selection},${message_fill}"
set -g message-command-style "fg=${stylix_blue},bg=${stylix_selection},${message_fill}"

# Modes
# ----------------------------------------------------------------------------
set -g mode-style "fg=${stylix_blue},bg=${stylix_selection},bold"
set -g copy-mode-selection-style "fg=${stylix_fg_light},bg=${stylix_selection}"
set -g copy-mode-match-style "fg=${stylix_bg_darker},bg=${stylix_cyan}"
set -g copy-mode-current-match-style "fg=${stylix_bg_darker},bg=${stylix_orange},bold"
set -g copy-mode-mark-style "fg=${stylix_bg_darker},bg=${stylix_magenta}"
set -g copy-mode-position-style "fg=${stylix_bg_darker},bg=${stylix_magenta}"
set -g copy-mode-line-number-style "fg=${stylix_comment}"
set -g copy-mode-current-line-number-style "fg=${stylix_yellow}"
set -g tree-mode-border-style "fg=${stylix_comment}"
set -g tree-mode-preview-style "fg=#{?#{||:#{&&:#{pane_format},#{pane_active}},#{&&:#{window_format},#{window_active}}},${stylix_blue},${stylix_comment}}"

# Popups and Menus
# ----------------------------------------------------------------------------
set -g popup-style "default"
set -g popup-border-style "fg=${stylix_blue}"
set -g popup-border-lines "rounded"
set -g menu-style "fg=${stylix_fg},bg=${stylix_bg_alt}"
set -g menu-selected-style "fg=${stylix_blue},bg=${stylix_selection},bold"
set -g menu-border-style "fg=${stylix_blue},bg=${stylix_bg_alt}"
set -g menu-border-lines "rounded"

# agent-indicator
# ----------------------------------------------------------------------------
set -g @agent-indicator-needs-input-window-title-bg "${stylix_bg_alt}"
set -g @agent-indicator-needs-input-window-title-fg "${stylix_yellow}"
set -g @agent-indicator-needs-input-border "${stylix_yellow}"
set -g @agent-indicator-done-window-title-bg "${stylix_bg_alt}"
set -g @agent-indicator-done-window-title-fg "${stylix_green}"
set -g @agent-indicator-done-border "${stylix_green}"
set -g @agent-indicator-session-dots-color "${stylix_comment}"
set -g @agent-indicator-session-dots-active-color "${stylix_blue}"
set -g @agent-indicator-session-dots-attention-color "${stylix_yellow}"
