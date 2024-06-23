{config, ...}: {
  home.sessionPath = [
    "$HOME/.local/bin"
  ];

  home.file.".local/bin".source = config.lib.meta.mkDotfilesSymlink "scripts/.local/bin";
}
