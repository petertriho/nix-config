{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    git
    # dependencies
    delta
    difftastic
  ];

  home.file.".gitconfig".source = config.lib.meta.mkDotfilesSymlink "git/.gitconfig";
  home.file.".gittemplates".source = config.lib.meta.mkDotfilesSymlink "git/.gittemplates";
}
