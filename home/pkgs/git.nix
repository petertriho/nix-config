{
  config,
  pkgs,
  ...
}:
{
  home = {
    packages = with pkgs; [
      gh
      gh-dash
      git
      git-lfs
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
      ".config/gh/config.yml".source = config.lib.meta.mkDotfilesSymlink "gh/.config/gh/config.yml";
    };
  };
}
