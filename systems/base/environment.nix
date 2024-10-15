{ pkgs, ... }:
{
  environment = {
    systemPackages = with pkgs; [
      vim-custom
    ];
    variables.EDITOR = "vim";
  };
}
