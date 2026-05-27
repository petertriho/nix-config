{ pkgs, ... }:
{
  imports = [
    ./desktop.nix
    ./pkgs/intel-gpu.nix
  ];
  home = {
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
}
