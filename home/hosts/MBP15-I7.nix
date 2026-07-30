{ pkgs, ... }:
{
  imports = [
    ../profiles/desktop.nix
    ../programs/intel-gpu.nix
  ];

  home.packages = with pkgs; [
    radeontop
  ];
}
