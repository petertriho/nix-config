{
  pkgs,
  beamPackages ? pkgs.beamMinimal27Packages,
  lib ? pkgs.lib,
}:
let
  beamPackages' = beamPackages.extend (
    _: prev: {
      elixir = prev.elixir_1_17;
    }
  );

  expertSrc = pkgs.fetchFromGitHub {
    owner = "elixir-lang";
    repo = "expert";
    rev = "4dfba220c97651c0f2c9eaf4b1c12d22c2055f37";
    hash = "sha256-E7ON8niVMJCfRIxclSMfXNOI4sQpvM+88PW7K82Hmjo=";
  };

  engineDeps = pkgs.callPackages "${expertSrc}/apps/engine/deps.nix" {
    inherit lib pkgs;
    beamPackages = beamPackages';
    overrides = x: y: { };
    overrideFenixOverlay = null;
  };

  mixNixDeps = pkgs.callPackages "${expertSrc}/apps/expert/deps.nix" {
    inherit lib pkgs;
    beamPackages = beamPackages';
    overrides = x: y: { };
    overrideFenixOverlay = null;
  };
in
beamPackages'.mixRelease rec {
  pname = "expert";
  version = "nightly-unstable-2025-10-16";

  src = expertSrc;

  inherit mixNixDeps;

  mixReleaseName = "plain";

  preConfigure = ''
    mkdir -p apps/engine/deps
    ${lib.concatMapStringsSep "\n" (dep: ''
      dep_name=$(basename ${dep} | cut -d '-' -f2)
      dep_path="apps/engine/deps/$dep_name"
      if [ -d "${dep}/src" ]; then
        ln -s ${dep}/src $dep_path
      fi
    '') (builtins.attrValues engineDeps)}
    cd apps/expert
  '';

  postInstall = ''
    mv $out/bin/plain $out/bin/expert
    wrapProgram $out/bin/expert --add-flag start
  '';

  removeCookie = false;

  passthru = {
    # not used by package, but exposed for repl and direct build access
    # e.g. nix build .#expert.mixNixDeps.jason
    inherit engineDeps mixNixDeps;
  };

  meta = with lib; {
    description = "Official Elixir Language Server Protocol implementation";
    homepage = "https://github.com/elixir-lang/expert";
    license = licenses.asl20;
    platforms = platforms.unix;
    mainProgram = "expert";
  };
}
