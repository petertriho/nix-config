{ ... }:
{
  imports = [
    ./darwin.nix
  ];
  home = {
    sessionVariables = {
      COPILOT_MODEL = "gpt-5-mini";
    };
  };
}
