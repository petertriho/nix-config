{ pkgs, lib, ... }:
{
  programs.yazi = {
    enable = true;
    enableFishIntegration = true;

    extraPackages =
      with pkgs;
      [
        ffmpegthumbnailer
        file
        poppler
        unar

        fd
        ripgrep
        fzf
        zoxide
        jq
        git
        lazygit
        chafa
        imagemagick
        resvg
        _7zz
      ]
      ++ lib.optionals pkgs.stdenv.isLinux [
        eject
        udisks2
        util-linux
        wl-clipboard
      ];

    settings = {
      mgr = {
        sort_by = "natural";
        sort_sensitive = false;
        sort_dir_first = true;
        sort_translit = true;
        linemode = "size";
        show_symlink = true;
        scrolloff = 8;
      };

      preview = {
        wrap = "yes";
        tab_size = 2;
        max_width = 1200;
        max_height = 1800;
      };

      plugin = {
        prepend_fetchers = [
          {
            url = "*";
            run = "git";
            group = "git";
          }
          {
            url = "*/";
            run = "git";
            group = "git";
          }
        ];
      };
    };

    keymap = {
      mgr.prepend_keymap = [
        {
          on = "l";
          run = "plugin smart-enter";
          desc = "Enter directory or open file";
        }
        {
          on = "p";
          run = "plugin smart-paste";
          desc = "Paste into hovered directory or CWD";
        }
        {
          on = "F";
          run = "plugin smart-filter";
          desc = "Smart filter";
        }
        {
          on = "f";
          run = "plugin jump-to-char";
          desc = "Jump to char";
        }
        {
          on = [
            "c"
            "m"
          ];
          run = "plugin chmod";
          desc = "Chmod selected files";
        }
        {
          on = "<C-d>";
          run = "plugin diff";
          desc = "Diff selected with hovered file";
        }
        {
          on = "M";
          run = "plugin mount";
          desc = "Open mount manager";
        }
        {
          on = "T";
          run = "plugin toggle-pane min-preview";
          desc = "Show or hide preview pane";
        }
        {
          on = "\\";
          run = "plugin split-tabs spl_toggle";
          desc = "Toggle split tabs mode";
        }
        {
          on = "<Tab>";
          run = "plugin split-tabs spl_switch_tab";
          desc = "Switch to the other split pane";
        }
        {
          on = "P";
          run = "plugin split-tabs spl_preview";
          desc = "Toggle split-tabs preview pane";
        }
        {
          on = [
            "g"
            "i"
          ];
          run = "plugin lazygit";
          desc = "Open lazygit";
        }
      ];
    };

    plugins = {
      full-border = {
        package = pkgs.yaziPlugins.full-border;
        setup = true;
      };
      git = {
        package = pkgs.yaziPlugins.git;
        setup = true;
        settings = {
          order = 1500;
        };
      };
      smart-enter = pkgs.yaziPlugins.smart-enter;
      smart-filter = pkgs.yaziPlugins.smart-filter;
      smart-paste = pkgs.yaziPlugins.smart-paste;
      jump-to-char = pkgs.yaziPlugins.jump-to-char;
      chmod = pkgs.yaziPlugins.chmod;
      diff = pkgs.yaziPlugins.diff;
      mount = pkgs.yaziPlugins.mount;
      toggle-pane = pkgs.yaziPlugins.toggle-pane;
      split-tabs = pkgs.yaziPlugins.split-tabs;
      lazygit = pkgs.yaziPlugins.lazygit;
    };
  };
}
