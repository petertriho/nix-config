{
  AMD-PC = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/AMD-PC;
    homeModule = ./home/hosts/AMD-PC.nix;
    user = "peter";
  };

  MBP15-I7 = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/MBP15-I7;
    homeModule = ./home/hosts/MBP15-I7.nix;
    user = "peter";
  };

  T480 = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/T480;
    homeModule = ./home/hosts/T480.nix;
    user = "peter";
  };

  WSL = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/WSL.nix;
    homeModule = ./home/hosts/WSL.nix;
    user = "peter";
  };

  X1-NANO = {
    platform = "nixos";
    system = "x86_64-linux";
    systemModule = ./systems/nixos/X1-NANO;
    homeModule = ./home/hosts/X1-NANO.nix;
    user = "peter";
  };

  MBP14-M1 = {
    platform = "darwin";
    system = "aarch64-darwin";
    systemModule = ./systems/darwin/MBP14-M1.nix;
    homeModule = ./home/hosts/MBP14-M1.nix;
    user = "peter";
  };

  droid = {
    platform = "home-manager";
    system = "aarch64-linux";
    homeModule = ./home/hosts/droid.nix;
    user = "droid";
    homePath = "/home/droid";
  };
}
