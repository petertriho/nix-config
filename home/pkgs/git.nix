{
  config,
  lib,
  pkgs,
  ...
}:
{
  home = {
    packages = with pkgs; [
      gh # github cli
      gh-dash # github dashboard
      gh-notify # github notification cli
      git
      git-gone # git garbage collector
      # git-machete # git branch management
      git-spice # git stack diff tool
      gitui # git tui
      # dependencies
      git-lfs
      delta # git diff viewer
      difftastic # structural diff tool
      # jujutsu
      lazygit # git tui
      mergiraf # git merge conflict resolver
      # rs-git-fsmonitor
      # watchman
    ];
    file = {
      ".gitconfig".source = config.lib.meta.mkDotfilesSymlink "git/.gitconfig";
      ".gittemplates".source = config.lib.meta.mkDotfilesSymlink "git/.gittemplates";
    };
    # Remove delta_side_by_side function when fixed
    # https://github.com/dandavison/delta/issues/359
    # https://github.com/wfxr/forgit/issues/121
    sessionVariables.FORGIT_PAGER = "delta --width \\$\{FZF_PREVIEW_COLUMNS:-$COLUMNS}";
  };

  xdg.configFile = {
    "git/fsmonitor.gitconfig" = lib.mkIf pkgs.stdenv.isDarwin {
      source = config.lib.meta.mkDotfilesSymlink "git/.config/git/fsmonitor.gitconfig";
    };
    "git/attributes".source = config.lib.meta.mkDotfilesSymlink "git/.config/git/attributes";
    "git/global.gitignore".source =
      config.lib.meta.mkDotfilesSymlink "git/.config/git/global.gitignore";
    "gh/config.yml".source = config.lib.meta.mkDotfilesSymlink "gh/.config/gh/config.yml";
  };
}
