{ lib, ... }:
{
  imports = [ ./base.nix ];
  home = {
    sessionVariables = rec {
      COPILOT_MODEL = "gpt-5-mini";
      SCRATCH_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Scratch";
      OBSIDIAN_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Obsidian";
      OBSIDIAN_VAULTS = lib.concatStringsSep ":" [
        "${OBSIDIAN_PATH}/Personal"
      ];
    };
  };
}
