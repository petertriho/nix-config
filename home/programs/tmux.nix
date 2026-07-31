{
  pkgs,
  config,
  lib,
  ...
}:
let
  colors = config.lib.stylix.colors.withHashtag;
in
{
  home = {
    packages = with pkgs; [
      gitmux
      sesh
    ];
    file = {
      ".tmux/stylix.tmux".text = ''
        stylix_none="NONE"
        stylix_bg="${colors.base10}"
        stylix_status_bg="${colors.base01}"
        stylix_highlight_bg="${colors.base02}"
        stylix_secondary_fg="${colors.base05}"
        stylix_accent="${colors.base0D}"
        stylix_mode="${colors.base0E}"
        stylix_prefix="${colors.base0A}"

        ${builtins.readFile ../../dotfiles/tmux/.tmux/stylix.tmux}
      '';
      ".tmux/copy-mode-vi.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/copy-mode-vi.tmux";
      ".gitmux.conf".source = config.lib.meta.mkDotfilesSymlink "tmux/.gitmux.conf";
    };
  };
  programs.agent-indicator.enable = true;

  xdg.configFile."sesh".source = config.lib.meta.mkDotfilesSymlink "sesh/.config/sesh";

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
            source-file "~/.tmux/stylix.tmux"

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
            wrapper_programs = mkStringList "'" [ "iris" ];
            substitute_sets = mkStringList "" [
              "(r'^/etc/profiles/per-user/(.+)/bin/(.+)', r'\\\\g<2>')"
              "(r'^(/usr)?/bin/(.+)', r'\\\\g<2>')"
              "(r'/nix/store/\\\\S+/bin/(n?vim?).*', r'\\\\g<1>')"
              "(r'/nix/store/\\\\S+/bin/(.+)', r'\\\\g<1>')"
              "(r'/nix/store/\\\\S+/libexec/\\\\S+/(.+)', r'\\\\g<1>')"
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
            set -g @tmux_window_name_wrapper_programs "${wrapper_programs}"
            set -g @tmux_window_name_custom_icons '{"claude":"✻","codex":"","opencode":"󰚩","pi":"󰏬"}'
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
            set -g @agent-indicator-icons 'claude=✻,codex=,opencode=󰚩,pi=󰏬,default=󰆍'
            set -g @agent-indicator-notification-enabled 'off'
          '';
      }
    ];
    extraConfig = builtins.readFile ../../dotfiles/tmux/.tmux.conf;
  };
}
