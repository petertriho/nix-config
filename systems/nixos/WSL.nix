{
  inputs,
  config,
  pkgs,
  ...
}:
{
  imports = [
    ./base.nix
    inputs.nixos-wsl.nixosModules.wsl
  ];

  wsl = {
    enable = true;
    defaultUser = config.user;
  };

  environment = {
    systemPackages = with pkgs; [
      wsl-open
      xdg-utils
    ];
    variables = {
      BROWSER = "wsl-open";
    };
  };
}
