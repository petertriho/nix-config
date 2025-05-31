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
      rs-git-fsmonitor
      watchman
    ];

    file.".gitconfig".source = config.lib.meta.mkDotfilesSymlink "git/.gitconfig";
    file.".gittemplates".source = config.lib.meta.mkDotfilesSymlink "git/.gittemplates";
  };
}
