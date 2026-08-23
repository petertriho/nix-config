{ config, ... }:

let
  configPath = "${config.home.homeDirectory}/.nix-config";

  mkSymlink =
    relativePath:
    config.lib.file.mkOutOfStoreSymlink "${configPath}/${relativePath}";
in
{
  # https://github.com/nix-community/home-manager/issues/676
  lib.meta = {
    inherit configPath mkSymlink;

    mkDotfilesSymlink = relativePath: mkSymlink "dotfiles/${relativePath}";
  };
}
