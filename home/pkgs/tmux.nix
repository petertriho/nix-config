{
  pkgs,
  config,
  lib,
  ...
}:
{
  home = {
    packages = with pkgs; [
      gitmux
      sesh
      tmuxPlugins.session-wizard
      tmuxPlugins.intray
    ];
    file = {
      ".tmux/tokyonight.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/tokyonight.tmux";
      ".tmux/copy-mode-vi.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/copy-mode-vi.tmux";
      ".gitmux.conf".source = config.lib.meta.mkDotfilesSymlink "tmux/.gitmux.conf";
    };
  };

  xdg.configFile."sesh".source = config.lib.meta.mkDotfilesSymlink "sesh/.config/sesh";
  xdg.configFile."opencode/plugins/opencode-tmux-agent-indicator.js".source =
    "${pkgs.tmuxPlugins.agent-indicator}/share/agent-indicator/opencode/plugins/opencode-tmux-agent-indicator.js";

  programs.tmux = {
    enable = true;
    sensibleOnTop = false;
    terminal = "tmux-256color";
    plugins = with pkgs.tmuxPlugins; [
      {
        plugin = sensible;
        extraConfig =
          # tmux
          ''
            # TODO: remove when https://github.com/nix-community/home-manager/pull/4670 is added
            set -g prefix C-a

            # Theme
            source-file "~/.tmux/tokyonight.tmux"

            # Sesh
            bind-key -N "Sesh" "g" run-shell "sesh-connect-fzf"

            # Explorer
            bind-key -N "Explorer" "e" run-shell '
              pane_id="#{pane_id}"
              output_file="$(mktemp)"
              wait_channel="tmux-popup-file-picker-#{session_id}-#{window_id}-#{pane_id}"
              if tmux display-popup -E -w "80%" -h "80%" -d "#{pane_current_path}" "\
                [ -x \"$HOME/.local/bin/tmux-popup-file-picker\" ] || { tmux wait-for -S \"$wait_channel\"; exit 1; }; \
                \"$HOME/.local/bin/tmux-popup-file-picker\" \"$output_file\" \"$wait_channel\"\
              "; then
                tmux wait-for "$wait_channel"
              fi
              if [ -s "$output_file" ]; then
                selected="$(cat "$output_file")"
                tmux send-keys -t "$pane_id" -l -- "$selected"
              fi
              rm -f "$output_file"
            '
          '';
      }
      pain-control
      {
        plugin = sessionist-fork;
        extraConfig =
          # tmux
          ''
            set -g @sessionist-goto "G"
          '';
      }
      yank
      {
        plugin = session-wizard;
        extraConfig =
          # tmux
          ''
            set -g @session-wizard 'W'
          '';
      }
      {
        plugin = easy-motion;
        extraConfig =
          # tmux
          ''
            set -g @easy-motion-prefix "Space"
            set -g @easy-motion-verbose "true"
            set -g @easy-motion-default-motion "bd-f"
          '';
      }
      {
        plugin = fingers;
        extraConfig =
          # tmux
          ''
            set -g @fingers-key "F"
            set -g @fingers-jump-key "J"
            set -g @fingers-pattern-0 '(sha256|sha384|sha512)-[A-Za-z0-9\+/]+={0,2}( +[!-~]*)?'
          '';
      }
      {
        plugin = window-name;
        extraConfig =
          let
            surround = srd: str: srd + str + srd;
            mkStringList = srd: lst: "[" + (lib.concatMapStringsSep ", " (surround srd) lst) + "]";
            name_shells = mkStringList "'" [
              "bash"
              "fish"
              "sh"
              "zsh"
            ];
            substitute_sets = mkStringList "" [
              "(r'^/etc/profiles/per-user/(.+)/bin/(.+)', r'\\\\g<2>')"
              "(r'^(/usr)?/bin/(.+)', r'\\\\g<2>')"
              "(r'/nix/store/\\\\S+/bin/(n?vim?).*', r'\\\\g<1>')"
              "(r'/nix/store/\\\\S+/bin/(.+)', r'\\\\g<1>')"
            ];
            dir_programs = mkStringList "'" [
              "git"
              "nvim"
              "vi"
              "vim"
            ];
            ignored_programs = mkStringList "'" [
              "kubie"
            ];
          in
          # tmux
          ''
            set -g @tmux_window_name_dir_programs "${dir_programs}"
            set -g @tmux_window_name_icon_style "'name_and_icon'"
            set -g @tmux_window_name_ignored_programs "${ignored_programs}"
            set -g @tmux_window_name_shells "${name_shells}"
            set -g @tmux_window_name_substitute_sets "${substitute_sets}"
            set -g @tmux_window_name_custom_icons '{"opencode":"󱜚"}'
          '';
      }
      {
        plugin = fuzzback;
        extraConfig =
          # tmux
          ''
            set -g @fuzzback-bind "/"
            set -g @fuzzback-popup 1
            set -g @fuzzback-popup-size "80%"
          '';
      }
      {
        plugin = agent-indicator;
        extraConfig =
          # tmux
          ''
            set -g @agent-indicator-icons 'claude=󰢚,codex=,opencode=󱙺,default='
            set -g @agent-indicator-animation-enabled 'on'
            set -g @agent-indicator-animation-speed '300'
          '';
      }
      {
        plugin = intray;
        extraConfig =
          # tmux
          "";
      }
    ];
    extraConfig = builtins.readFile ../../dotfiles/tmux/.tmux.conf;
  };
}
