{ ... }:
{
  imports = [
    ./darwin.nix
  ];
  home = {
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
  programs.claude-code.zai.enable = true;
}
