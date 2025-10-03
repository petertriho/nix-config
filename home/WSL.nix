{ ... }:
{
  imports = [ ./base.nix ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-5-mini";
      SCRATCH_PATH = "/mnt/c/Users/peter/Nextcloud/Documents/Scratch";
    };
  };
}
