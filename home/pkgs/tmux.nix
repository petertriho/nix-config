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
      # tmuxPlugins.intray
    ];
    file = {
      ".tmux/tokyonight.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/tokyonight.tmux";
      ".tmux/copy-mode-vi.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/copy-mode-vi.tmux";
      ".gitmux.conf".source = config.lib.meta.mkDotfilesSymlink "tmux/.gitmux.conf";
    };
  };
  programs.agent-indicator.enable = true;

  xdg.configFile."sesh".source = config.lib.meta.mkDotfilesSymlink "sesh/.config/sesh";
  # xdg.configFile."opencode/plugins/opencode-tmux-intray.js".source =
  #   "${pkgs.tmuxPlugins.intray}/share/intray/opencode/plugins/opencode-tmux-intray.js";
  # xdg.configFile."opencode/plugins/opencode-tmux-intray".source =
  #   "${pkgs.tmuxPlugins.intray}/share/intray/opencode/plugins/opencode-tmux-intray";

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
            bind-key -N "Explorer" "e" run-shell "tmux-popup-file-picker"
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
            set -g @tmux_window_name_custom_icons '{"claude":"✻","codex":"","opencode":"󰚩"}'
            set -g @tmux_window_name_show_program_args "False"
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
      # TODO: investigate why this needs to be put after sensible (cannot put in the hm module)
      {
        plugin = agent-indicator;
        extraConfig =
          # tmux
          ''
            set -g @agent-indicator-icons 'claude=✻,codex=,opencode=󰚩,default=󰆍'
            set -g @agent-indicator-notification-enabled 'off'
          '';
      }
      # {
      #   plugin = intray;
      #   extraConfig =
      #     # tmux
      #     "";
      # }
    ];
    extraConfig = builtins.readFile ../../dotfiles/tmux/.tmux.conf;
  };
}
