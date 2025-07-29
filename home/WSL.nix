{ ... }:
{
  imports = [ ./base.nix ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-4.1";
    };
  };
}
