{config, ...}: {
  home.sessionPath = [
    "$HOME/.local/bin"
  ];

  home.file.".local/bin" = {
    source = config.lib.file.mkOutOfStoreSymlink ./bin;
    recursive = true;
  };
}
