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
  cpa-manager-plus = callPackage ./cpa-manager-plus { };
  codexbar = callPackage ./codexbar { };
  cups-brother-mfc9335cdw = callPackage ./cups-brother-mfc9335cdw { };
  effective-html = callPackage ./effective-html { };
  figlet-fonts = callPackage ./figlet-fonts { };
  hallmark = callPackage ./hallmark { };
  iris = inputs.iris.packages.${stdenv.hostPlatform.system}.iris.overrideAttrs (old: {
    patches = (old.patches or [ ]) ++ [ ./iris/iris-config.patch ];
    ldflags = (old.ldflags or [ ]) ++ [
      "-s"
      "-w"
      "-X=github.com/versenilvis/iris/root.Version=${old.version}"
    ];
  });
  kubectl-prof = callPackage ./kubectl-prof {
    buildGoModule = stablePkgs.buildGo126Module;
  };
  lg-buddy = callPackage ./lg-buddy { };
  impeccable = callPackage ./impeccable { };
  mermaid-ascii = callPackage ./mermaid-ascii { };
  multica = callPackage ./multica { };
  multica-selfhost = callPackage ./multica-selfhost { };
  nono-packs = callPackage ./nono-packs { };
  pi-acp = callPackage ./pi-acp { };
  playwriter = callPackage ./playwriter { };
  pybetter = callPackage ./pybetter { inherit pkgs; };
  python-validity = callPackage ./python-validity { };
  repowise = callPackage ./repowise {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  sem = callPackage ./sem { };
  sort-package-json = callPackage ./sort-package-json { };
  spawnpoint = callPackage ./spawnpoint {
    inherit (inputs) uv2nix pyproject-nix pyproject-build-systems;
  };
  superpowers = callPackage ./superpowers { };
  taste-skill = callPackage ./taste-skill { };
  vim-custom = callPackage ./vim-custom { };
  vscode-langservers-extracted = callPackage ./vscode-langservers-extracted { };
}
