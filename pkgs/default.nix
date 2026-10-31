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
  keymods = callPackage ./keymods { };
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
  lg-buddy = callPackage ./lg-buddy { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  nono-packs = callPackage ./nono-packs { };
  playwriter = callPackage ./playwriter { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  python-validity = callPackage ./python-validity { };
  rea = callPackage ./rea {
    # REA needs a newer Node.js patch release than the unstable pin supplies.
    inherit (stablePkgs) nodejs_26;
  };
  repowise = callPackage ./repowise {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  sort-package-json = callPackage ./sort-package-json { };
  spawnpoint = callPackage ./spawnpoint {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  strix = callPackage ./strix { };
  superpowers = callPackage ./superpowers { };
  taste-skill = callPackage ./taste-skill { };
  terraform-skill = callPackage ./terraform-skill { };
  vicinae = inputs.vicinae.packages.${stdenv.hostPlatform.system}.default;
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
  write-better = callPackage ./write-better { };
}
