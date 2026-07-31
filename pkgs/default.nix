{
  pkgs ? import <nixpkgs> { },
  stablePkgs,
  inputs,
  ...
}:
with pkgs;
{
  anthropic-skills = callPackage ./anthropic-skills { };
  betterfox = callPackage ./betterfox { };
  cpa-manager-plus = callPackage ./cpa-manager-plus { };
  codexbar = callPackage ./codexbar { };
  cups-brother-mfc9335cdw = callPackage ./cups-brother-mfc9335cdw { };
  effective-html = callPackage ./effective-html { };
  figlet-fonts = callPackage ./figlet-fonts { };
  hallmark = callPackage ./hallmark { };
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
  lg-buddy = callPackage ./lg-buddy { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  playwriter = callPackage ./playwriter { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  python-validity = callPackage ./python-validity { };
  repowise = callPackage ./repowise {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  sem = callPackage ./sem { };
  sort-package-json = callPackage ./sort-package-json { };
  superpowers = callPackage ./superpowers { };
  taste-skill = callPackage ./taste-skill { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
