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
      # gh-dash # github dashboard
      # gh-notify # github notification cli
      gh-stack # github stacked PRs
      git
      git-gone # git garbage collector
      # git-machete # git branch management
      git-spice # git stack diff tool
      # gitui # git tui
      # dependencies
      git-lfs
      delta # git diff viewer
      difftastic # structural diff tool
      # llm-agents.hunk
      # jujutsu
      mergiraf # git merge conflict resolver
      # rs-git-fsmonitor
      llm-agents.tuicr
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

  programs.gitui.enable = true;

  programs.lazygit = {
    enable = true;
    enableFishIntegration = false;
  };

  xdg.configFile = {
    # "git/fsmonitor.gitconfig" = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    #   source = config.lib.meta.mkDotfilesSymlink "git/.config/git/fsmonitor.gitconfig";
    # };
    "git/attributes".source = config.lib.meta.mkDotfilesSymlink "git/.config/git/attributes";
    "git/global.gitignore".source =
      config.lib.meta.mkDotfilesSymlink "git/.config/git/global.gitignore";
    "gh/config.yml".source = config.lib.meta.mkDotfilesSymlink "gh/.config/gh/config.yml";
  };

  # `~/.gitconfig` includes files from this directory, so an unreadable entry
  # aborts every git invocation rather than degrading. Both paths are required:
  # a directory grant does not follow the out-of-store symlinks inside it, so
  # the link directory only buys traversal and the tracked directory holds the
  # contents. Granting directories rather than files also covers the
  # host-specific identity that `home/hosts` drops in here.
  # `~/.gittemplates` is a link to a whole directory, so it resolves on its own.
  programs.nono.sharedFilesystem.read = [
    "$HOME/.config/git"
    "$HOME/.nix-config/dotfiles/git/.config/git"
    "$HOME/.gittemplates"
  ];
}
