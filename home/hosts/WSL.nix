{
  lib,
  pkgs,
  ...
}:
{
  imports = [ ../profiles/base.nix ];
  home = {
    packages = with pkgs; [
      ungoogled-chromium
    ];
    sessionVariables = rec {
      CHROME_BINARY = "${pkgs.ungoogled-chromium}/bin/chromium";
      CHROME_FLAGS = "--no-sandbox";
      SCRATCH_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Scratch";
      OBSIDIAN_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Obsidian";
      OBSIDIAN_VAULTS = lib.concatStringsSep ":" [
        "${OBSIDIAN_PATH}/Personal"
      ];
    };
  };
}
