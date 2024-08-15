{
  config,
  pkgs,
  pkgs-stable,
  ...
}:
{
  home = {
    packages = with pkgs; [
      git
      # dependencies
      # TODO: remove when rust build is fixed in unstable
      pkgs-stable.delta
      difftastic
    ];

    file.".gitconfig".source = config.lib.meta.mkDotfilesSymlink "git/.gitconfig";
    file.".gittemplates".source = config.lib.meta.mkDotfilesSymlink "git/.gittemplates";
  };
}
