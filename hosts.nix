{
  AMD-PC = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/AMD-PC;
    homeModule = ./home/AMD-PC.nix;
    user = "peter";
    roles = [ "desktop" ];
  };

  MBP15-I7 = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/MBP15-I7;
    homeModule = ./home/MBP15-I7.nix;
    user = "peter";
    roles = [
      "desktop"
      "laptop"
    ];
  };

  T480 = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/T480;
    homeModule = ./home/T480.nix;
    user = "peter";
    roles = [
      "desktop"
      "laptop"
    ];
  };

  WSL = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/WSL.nix;
    homeModule = ./home/WSL.nix;
    user = "peter";
    roles = [ "wsl" ];
  };

  X1-NANO = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/X1-NANO;
    homeModule = ./home/X1-NANO.nix;
    user = "peter";
    roles = [
      "desktop"
      "laptop"
    ];
  };

  MBP14-M1 = {
    platform = "darwin";
    system = "aarch64-darwin";
    systemModule = ./systems/darwin/MBP14-M1.nix;
    homeModule = ./home/MBP14-M1.nix;
    user = "peter";
    roles = [
      "darwin"
      "laptop"
    ];
  };

  droid = {
    platform = "home-manager";
    system = "aarch64-linux";
    homeModule = ./home/droid.nix;
    user = "droid";
    homePath = "/home/droid";
    roles = [ "standalone" ];
  };
}
