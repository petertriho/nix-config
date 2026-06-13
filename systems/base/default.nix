{
  outputs,
  pkgs,
  ...
}:
{
  imports = [
    ./environment.nix
    ./home-manager.nix
    ./options.nix
    outputs.systemModules.shells
  ];

  nix = {
    gc = {
      automatic = true;
      options = "--delete-older-than 30d";
    };
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      warn-dirty = false;
      trusted-users = [
        "root"
        (if pkgs.stdenv.isLinux then "@wheel" else "@admin")
      ];
    };
  };

  nixpkgs = {
    overlays = outputs.packageSets.overlayList;
    config = outputs.packageSets.nixpkgsConfig;
  };
}
