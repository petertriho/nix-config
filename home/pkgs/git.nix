{
  config,
  pkgs,
  ...
}:
{
  home = {
    packages = with pkgs; [
      git
      git-machete
      # dependencies
      delta
      difftastic
      jujutsu
      rs-git-fsmonitor
      watchman
    ];

    file = {
      ".gitconfig".source = config.lib.meta.mkDotfilesSymlink "git/.gitconfig";
      ".gittemplates".source = config.lib.meta.mkDotfilesSymlink "git/.gittemplates";
      ".config/git/fsmonitor.gitconfig".source =
        config.lib.meta.mkDotfilesSymlink "git/.config/git/fsmonitor.gitconfig";
    };
  };
}
