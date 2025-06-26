{ pkgs, ... }:
{
  home.packages = with pkgs; [ stable.devenv ];
}
