{
  pkgs ? import <nixpkgs> { },
  stablePkgs,
  inputs,
  ...
}:
with pkgs;
{
  anthropic-skills = callPackage ./anthropic-skills { };
  autoresearch = callPackage ./autoresearch { };
  betterfox = callPackage ./betterfox { };
  bladebro = callPackage ./bladebro { };
  codexbar = callPackage ./codexbar { };
  cups-brother-mfc9335cdw = callPackage ./cups-brother-mfc9335cdw { };
  donsetch = callPackage ./donsetch { };
  effective-html = callPackage ./effective-html { };
  figlet-fonts = callPackage ./figlet-fonts { };
  hallmark = callPackage ./hallmark { };
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
  lg-buddy = callPackage ./lg-buddy { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  nono-packs = callPackage ./nono-packs { };
  pi-acp = callPackage ./pi-acp { };
  playwriter = callPackage ./playwriter { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  python-validity = callPackage ./python-validity { };
  repowise = callPackage ./repowise {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  sort-package-json = callPackage ./sort-package-json { };
  spawnpoint = callPackage ./spawnpoint {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  superpowers = callPackage ./superpowers { };
  taste-skill = callPackage ./taste-skill { };
  # Return to the upstream cache once its runtime supports the system graphics libraries
  # and its Vicinae/Numen toolchains are compatible:
  # 1. Remove Vicinae's inputs.nixpkgs.follows in flake.nix.
  # 2. Regenerate flake.lock.
  # 3. Remove this override, keeping the upstream package alias.
  vicinae = inputs.vicinae.packages.${stdenv.hostPlatform.system}.default.override (
    lib.optionalAttrs stdenv.hostPlatform.isLinux {
      # Match Numen's compiler and C++ runtime instead of upstream's GCC 15 pin.
      gcc15Stdenv = stdenv;
    }
  );
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
  write-better = callPackage ./write-better { };
}
