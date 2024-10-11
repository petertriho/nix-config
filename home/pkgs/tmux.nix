{
  pkgs,
  config,
  ...
}:
{
  home = {
    packages = with pkgs; [ gitmux ];
    file = {
      ".tmux/tokyonight.tmux".source = config.lib.meta.mkDotfilesSymlink "tmux/.tmux/tokyonight.tmux";
      ".gitmux.conf".source = config.lib.meta.mkDotfilesSymlink "tmux/.gitmux.conf";
    };
  };

  programs.tmux = {
    enable = true;
    sensibleOnTop = false;
    plugins = with pkgs.tmuxPlugins; [
      {
        plugin = sensible;
        extraConfig =
          # tmux
          ''
            # TODO: remove when https://github.com/nix-community/home-manager/pull/4670 is added
            set -g prefix C-a
          '';
      }
      pain-control
      tmux-sessionist-fork
      yank
      {
        plugin = prefix-highlight;
        extraConfig =
          # tmux
          ''
            # Theme
            if-shell "test -f ~/.tmux/tokyonight.tmux" "source ~/.tmux/tokyonight.tmux"

            hl_fg="#7aa2f7"
            hl_bg="#16161e"
            set -g @prefix_highlight_fg $hl_fg
            set -g @prefix_highlight_bg $hl_bg
            set -g @prefix_highlight_prefix_prompt 'Wait'
            set -g @prefix_highlight_show_copy_mode "on"
            set -g @prefix_highlight_copy_mode_attr "fg=$hl_fg,bg=$hl_bg"
            set -g @prefix_highlight_show_sync_mode "on"
            set -g @prefix_highlight_sync_mode_attr "fg=$hl_fg,bg=$hl_bg"
          '';
      }
      {
        plugin = easy-motion;
        extraConfig =
          # tmux
          ''
            set -g @easy-motion-verbose "true"
            set -g @easy-motion-default-motion "bd-f"
          '';
      }
      {
        plugin = tmux-thumbs;
        extraConfig =
          # tmux
          "set -g @thumbs-key F";
      }
      {
        plugin = extrakto;
        extraConfig =
          # tmux
          ''
            set -g @extrakto_copy_key "tab"
            set -g @extrakto_insert_key "enter"
            set -g @extrakto_fzf_layout "reverse"
            set -g @extrakto_popup_size "50%,50%"
            set -g @extrakto_split_direction "p"
            set -g @extrakto_popup_position "200,100"
          '';
      }
      {
        plugin = tmux-window-name;
        extraConfig =
          # tmux
          ''
            set -g @tmux_window_name_substitute_sets \
              "[ \
                ('^(/usr)?/bin/(.+)', '\g<2>'), \
                ('/nix/store/[a-z0-9\\.-]+/bin/(.+) -u .*', '\\g<1>'), \
                ('/nix/store/[a-z0-9\\.-]+/bin/(.+) .*', '\\g<1>'), \
                ('/run/current-system/sw/bin/(.+) --.*', '\\g<1>'), \
                ('/home/${config.home.username}/.nix-profile/bin/(.+) --.*', '\\g<1>'), \
                ('/etc/profiles/per-user/${config.home.username}/bin/(.+) --.*', '\\g<1>') \
              ]"
            set -g @tmux_window_name_dir_programs \
              "[ \
                'nvim', 'vim', 'vi', 'git', \
                '/home/${config.home.username}/.nix-profile/bin/nvim', \
                '/etc/profiles/per-user/${config.home.username}/bin/nvim' \
              ]"
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
