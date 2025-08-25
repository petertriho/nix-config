{ ... }:
{
  imports = [ ./base.nix ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-4.1";
      SCRATCH_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Scratch";
    };
  };
}
