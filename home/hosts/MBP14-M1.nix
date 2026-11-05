{ ... }: {
  imports = [
    ../profiles/darwin.nix
  ];
  programs = {
    claude-code = {
      enable = true;
    };
  };
}
