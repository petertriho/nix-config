#!/usr/bin/env bash

none="NONE"
black="#15161e"
blue="#7aa2f7"
bg_statusline="#16161e"
bg_highlight="#292e42"
fg_sidebar="#a9b1d6"

set -g mode-style "fg=${blue},bg=${bg_highlight}"

set -g message-style "fg=${blue},bg=${bg_highlight}"
set -g message-command-style "fg=${blue},bg=${bg_highlight}"

set -g pane-border-style "fg=${bg_highlight}"
set -g pane-active-border-style "fg=${blue}"

set -g status "on"
set -g status-justify "left"

set -g status-style "fg=${blue},bg=${bg_statusline}"

set -g status-left-length "200"
set -g status-right-length "100"

set -g status-left-style ${none}
set -g status-right-style ${none}

set -g status-left "#[fg=${black},bg=${blue},bold] #S "
set -g status-right "#[fg=${blue},bg=${bg_statusline}] #{prefix_highlight} #[fg=${fg_sidebar},bg=${bg_highlight}] %Y-%m-%d ❬ %I:%M %p #[fg=${black},bg=${blue},bold] #h "

setw -g window-status-activity-style "underscore,fg=${fg_sidebar},bg=${bg_statusline}"
setw -g window-status-separator ""
setw -g window-status-style "${none},fg=${fg_sidebar},bg=${bg_statusline}"
setw -g window-status-format "#[default] #I: #W #F "
setw -g window-status-current-format "#[fg=${blue},bg=${bg_highlight},bold] #I: #W #F "
