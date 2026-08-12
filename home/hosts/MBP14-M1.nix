{ pkgs, ... }: {
  imports = [
    ../profiles/darwin.nix
  ];
  home = {
    packages = with pkgs; [
      multica
      multica-selfhost
    ];
    sessionVariables = {
      # COPILOT_MODEL = "gpt-5-mini";
    };
  };
}
