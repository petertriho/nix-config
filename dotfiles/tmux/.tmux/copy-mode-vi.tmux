# ==============================================================================
# Vi Copy Mode Configuration
# ==============================================================================

# Basic copy mode setup
bind-key -T copy-mode-vi 'v' send -X begin-selection
unbind -T copy-mode-vi MouseDragEnd1Pane

# Yank with enhanced functionality
bind -T copy-mode-vi y \
    if-shell -F "#{selection_present}" \
    "send-keys -X copy-selection" \
    "switch-client -T copyModeYankKey"

# ==============================================================================
# Copy Mode Yank Key Bindings
# ==============================================================================

# Line operations
bind -T copyModeYankKey '$' \
    send-keys -X clear-selection \; \
    send-keys -X copy-end-of-line

bind -T copyModeYankKey '0' \
    send-keys -X clear-selection \; \
    send-keys -X begin-selection \; \
    send-keys -X start-of-line \; \
    send-keys -X copy-selection

bind -T copyModeYankKey 'y' \
    send-keys -X clear-selection \; \
    send-keys -X copy-line

# Word operations
bind -T copyModeYankKey 'w' \
    send-keys -X clear-selection \; \
    send-keys -X begin-selection \; \
    send-keys -X next-space-end \; \
    send-keys -X copy-selection

# Text object modes
bind -T copyModeYankKey 'i' switch-client -T copyModeYankKey_i
bind -T copyModeYankKey 'a' switch-client -T copyModeYankKey_a

# ==============================================================================
# Text Object Selections (Inner)
# ==============================================================================

# Word selections
bind -T copyModeYankKey_i w \
    send-keys -X select-word \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i W \
    send-keys -X clear-selection \; \
    send-keys -X previous-space \; \
    send-keys -X begin-selection \; \
    send-keys -X next-space-end \; \
    send-keys -X copy-selection

# Bracket pairs
bind -T copyModeYankKey_i b \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '(' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward ')' \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i B \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '{' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '}' \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i [ \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '[' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward ']' \; \
    send-keys -X copy-selection

# Quote pairs
bind -T copyModeYankKey_i \' \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward "'" \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward "'" \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i \" \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '"' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '"' \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i \` \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '`' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '`' \; \
    send-keys -X copy-selection

# Angle brackets
bind -T copyModeYankKey_i \< \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '<' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '>' \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_i \> \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '<' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '>' \; \
    send-keys -X copy-selection

# ==============================================================================
# Text Object Selections (Around)
# ==============================================================================

# Word selections (including surrounding whitespace)
bind -T copyModeYankKey_a w \
    send-keys -X clear-selection \; \
    send-keys -X previous-word \; \
    send-keys -X begin-selection \; \
    send-keys -X next-word-end \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a W \
    send-keys -X clear-selection \; \
    send-keys -X previous-space \; \
    send-keys -X previous-space \; \
    send-keys -X cursor-right \; \
    send-keys -X begin-selection \; \
    send-keys -X next-space-end \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

# Bracket pairs (including brackets)
bind -T copyModeYankKey_a b \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '(' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward ')' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a B \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '{' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '}' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a [ \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '[' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward ']' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

# Quote pairs (including quotes)
bind -T copyModeYankKey_a \' \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward "'" \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward "'" \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a \" \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '"' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '"' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a \` \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '`' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '`' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

# Angle brackets (including brackets)
bind -T copyModeYankKey_a \< \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '<' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '>' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

bind -T copyModeYankKey_a \> \
    send-keys -X clear-selection \; \
    send-keys -X jump-to-backward '<' \; \
    send-keys -X begin-selection \; \
    send-keys -X jump-to-forward '>' \; \
    send-keys -X cursor-right \; \
    send-keys -X copy-selection

# ==============================================================================
# Enhanced Navigation with Scroll Centering
# ==============================================================================

# bind -T copy-mode-vi j \
#     if-shell -F "#{selection_present}" \
#     "send -X cursor-down" \
#     "send -X cursor-down \; send -X scroll-middle"
#
# bind -T copy-mode-vi k \
#     if-shell -F "#{selection_present}" \
#     "send -X cursor-up" \
#     "send -X cursor-up \; send -X scroll-middle"

bind -T copy-mode-vi C-d \
    if-shell -F "#{selection_present}" \
    "send -X halfpage-down" \
    "send -X halfpage-down \; send -X scroll-middle"

bind -T copy-mode-vi C-u \
    if-shell -F "#{selection_present}" \
    "send -X halfpage-up" \
    "send -X halfpage-up \; send -X scroll-middle"
