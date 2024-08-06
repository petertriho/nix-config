{
  pkgs,
  config,
  lib,
  ...
}:
let
  tmux-sessionist = pkgs.tmuxPlugins.mkTmuxPlugin {
    pluginName = "sessionist";
    version = "unstable-2023-06-14";
    src = pkgs.fetchFromGitHub {
      owner = "petertriho";
      repo = "tmux-sessionist";
      rev = "71267aa8cd625f97772af8ffd8d98efd5aa01736";
      sha256 = "0zq37jwxp9yhlkq7gkfpqwyx00sfb89wpwhrhl3ymirj8bx2wyh6";
    };
  };

  pythonInputs = pkgs.python3.withPackages (
    p: with p; [
      libtmux
      pip
    ]
  );

  easy-motion = pkgs.tmuxPlugins.mkTmuxPlugin {
    pluginName = "easy-motion";
    version = "unstable-2024-04-05";
    src = pkgs.fetchFromGitHub {
      owner = "IngoMeyer441";
      repo = "tmux-easy-motion";
      rev = "3e2edbd0a3d9924cc1df3bd3529edc507bdf5934";
      sha256 = "1yxdz2l34mm49sns5l6cg46y80i6g1dbv7qj255sralfbnmhzqn0";
    };
    nativeBuildInputs = [ pkgs.makeWrapper ];
    rtpFilePath = "easy_motion.tmux";
    postInstall = ''
      for f in easy_motion.tmux scripts/easy_motion.py; do
        wrapProgram $target/$f \
          --prefix PATH : ${lib.makeBinPath [ pythonInputs ]}
      done
    '';
  };

  # https://github.com/NixOS/nixpkgs/pull/296174
  tmux-window-name = pkgs.tmuxPlugins.mkTmuxPlugin {
    pluginName = "tmux-window-name";
    version = "unstable-2024-05-28";
    src = pkgs.fetchFromGitHub {
      owner = "ofirgall";
      repo = "tmux-window-name";
      rev = "28a2d277c8be8656b3c6dd45f79364583ae7c82c";
      sha256 = "18fxqb94799nmlnjlv47zr6gh3ma6389s7dabb86yc2xda3b3kw5";
    };
    nativeBuildInputs = [ pkgs.makeWrapper ];
    rtpFilePath = "tmux_window_name.tmux";
    postInstall = ''
      NIX_BIN_PATH="${builtins.getEnv "HOME"}/.nix-profile/bin"
      # Update USR_BIN_REMOVER with .nix-profile PATH
      sed -i "s|^USR_BIN_REMOVER.*|USR_BIN_REMOVER = (r\'^$NIX_BIN_PATH/(.+)( --.*)?\', r\'\\\g<1>\')|" $target/scripts/rename_session_windows.py

      # Update substitute_sets with .nix-profile PATHs
      sed -i "s|^\ssubstitute_sets: List.*|    substitute_sets: List[Tuple] = field(default_factory=lambda: [(\'/$NIX_BIN_PATH/(.+) --.*\', \'\\\g<1>\'), (r\'.+ipython([32])\', r\'ipython\\\g<1>\'), USR_BIN_REMOVER, (r\'(bash) (.+)/(.+[ $])(.+)\', \'\\\g<3>\\\g<4>\')])|" $target/scripts/rename_session_windows.py

      # Update dir_programs with .nix-profile PATH for applications
      sed -i "s|^\sdir_programs: List.*|    dir_programs: List[str] = field(default_factory=lambda: [["$NIX_BIN_PATH/vim", "$NIX_BIN_PATH/vi", "$NIX_BIN_PATH/git", "$NIX_BIN_PATH/nvim"]])|" $target/scripts/rename_session_windows.py

      for f in tmux_window_name.tmux scripts/rename_session_windows.py; do
        wrapProgram $target/$f \
          --prefix PATH : ${lib.makeBinPath [ pythonInputs ]}
      done
    '';
  };
in
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
        extraConfig = ''
          # TODO: remove when https://github.com/nix-community/home-manager/pull/4670 is added
          set -g prefix C-a
        '';
      }
      pain-control
      tmux-sessionist
      yank
      {
        plugin = prefix-highlight;
        extraConfig = ''
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
        extraConfig = ''
          set -g @easy-motion-verbose "true"
          set -g @easy-motion-default-motion "bd-f"
        '';
      }
      {
        plugin = tmux-thumbs;
        extraConfig = "set -g @thumbs-key F";
      }
      {
        plugin = extrakto;
        extraConfig = ''
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
        extraConfig = ''
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
        extraConfig = ''
          set -g @fuzzback-bind "/"
          set -g @fuzzback-popup 1
          set -g @fuzzback-popup-size "80%"
        '';
      }
    ];
    extraConfig = builtins.readFile ../../dotfiles/tmux/.tmux.conf;
  };
}
