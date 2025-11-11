{
  pkgs,
  beamPackages ? pkgs.beamMinimal28Packages,
  lib ? pkgs.lib,
}:
let
  beamPackages' = beamPackages.extend (
    _: prev: {
      elixir = prev.elixir_1_18;
    }
  );

  expertSrc = pkgs.fetchFromGitHub {
    owner = "elixir-lang";
    repo = "expert";
    rev = "c5ac44164b69b0ec63d5f5b462c40ba787d9fe90";
    hash = "sha256-bYdBFnmd4Hm+JaRTarK2NoGTHDx6S4QXcmw35mzaif0=";
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
  version = "nightly-unstable-2025-11-10";

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
    
    # Patch mix.exs to set include_erts: false
    substituteInPlace mix.exs \
      --replace-fail 'plain: [' 'plain: [include_erts: false,'
  '';

  # Override installPhase to use default mix release command
  installPhase = ''
    runHook preInstall
    
    mix release ${mixReleaseName} --no-deps-check --path "$out"
    
    runHook postInstall
  '';
  
  postInstall = ''
    mv $out/bin/plain $out/bin/expert
    wrapProgram $out/bin/expert \
      --add-flag start \
      --prefix PATH : ${lib.makeBinPath [ beamPackages'.erlang beamPackages'.elixir ]}
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
