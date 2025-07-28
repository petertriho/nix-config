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
      tmuxPlugins.session-wizard
    ];
    file = {
      ".tmux/tokyonight.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/tokyonight.tmux";
      ".tmux/copy-mode-vi.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/copy-mode-vi.tmux";
      ".gitmux.conf".source = config.lib.meta.mkDotfilesSymlink "tmux/.gitmux.conf";
    };
    sessionVariables = {
      # TINTED_TMUX_OPTION_ACTIVE = 1;
      # TINTED_TMUX_OPTION_STATUSBAR = 1;
    };
  };

  programs.tmux = {
    enable = true;
    sensibleOnTop = false;
    terminal = if pkgs.stdenv.isLinux then "screen-256color" else "tmux-256color";
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
          '';
      }
      pain-control
      sessionist-fork
      yank
      # {
      #   plugin = tokyo-night;
      #   extraConfig =
      #     # tmux
      #     ''
      #       set -g @tokyo-night-tmux_window_id_style "none"
      #       set -g @tokyo-night-tmux_show_git 0
      #       set -g @tokyo-night-tmux_show_wbg 0
      #     '';
      # }
      # {
      #   plugin = tinted;
      #   extraConfig =
      #     # tmux
      #     ''
      #       # set -g @tinted-color "base16-tokyo-night-dark"
      #     '';
      # }
      session-wizard
      {
        plugin = easy-motion;
        extraConfig =
          # tmux
          ''
            set -g @easy-motion-verbose "true"
            set -g @easy-motion-default-motion "bd-f"
          '';
      }
      # {
      #   plugin = tmux-thumbs;
      #   extraConfig =
      #     # tmux
      #     ''
      #       set -g @thumbs-key "F"
      #     '';
      # }
      {
        plugin = fingers;
        extraConfig =
          # tmux
          ''
            set -g @fingers-key "F"
            set -g @fingers-jump-key "J"
          '';
      }
      # {
      #   plugin = extrakto;
      #   extraConfig =
      #     # tmux
      #     ''
      #       set -g @extrakto_copy_key "tab"
      #       set -g @extrakto_insert_key "enter"
      #       set -g @extrakto_fzf_layout "reverse"
      #       set -g @extrakto_popup_size "50%,50%"
      #       set -g @extrakto_split_direction "p"
      #       set -g @extrakto_popup_position "200,100"
      #     '';
      # }
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
            ];
            ignored_programs = mkStringList "'" [
              "kubie"
            ];
          in
          # tmux
          ''
            set -g @tmux_window_name_shells "${name_shells}"
            set -g @tmux_window_name_substitute_sets "${substitute_sets}"
            set -g @tmux_window_name_dir_programs "${dir_programs}"
            set -g @tmux_window_name_ignored_programs "${ignored_programs}"
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
    ];
    extraConfig = builtins.readFile ../../dotfiles/tmux/.tmux.conf;
  };
}
