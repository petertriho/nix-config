{
  inputs,
  lib,
  config,
  ...
}:
with lib; {
  # https://github.com/nix-community/home-manager/issues/676
  config = {
    lib.meta = {
      configPath = "${config.home.homeDirectory}/nix-config";
      mkSymlink = path:
        config.lib.file.mkOutOfStoreSymlink
        (config.lib.meta.configPath + removePrefix (toString inputs.self) (toString path));
    };
  };
}