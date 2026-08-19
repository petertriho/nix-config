{
  lib,
  pkgs,
  uv2nix,
  pyproject-nix,
  pyproject-build-systems,
}:
let
  # Tracks main (upstream's latest tag v0.9.3 is behind HEAD). Bump `rev`,
  # `version` date, `hash`, and `pretendVersion` together when following
  # upstream.
  version = "0.9.3-unstable-2026-08-19";

  # hatch-vcs derives the version from git tags and `_version.py` is
  # gitignored, so a `.git`-less source would build as the pyproject
  # `fallback-version` (0.1.0) and make `sp --version` lie. Bare semver only —
  # the `-unstable-DATE` suffix is not PEP 440.
  pretendVersion = "0.9.3";

  src = pkgs.fetchFromGitHub {
    owner = "mihirgupta0900";
    repo = "spawnpoint";
    rev = "4860bff4a9518f9dd9445af2f975649cbd7aba11";
    hash = "sha256-I8QZNG4PWCp/K59NYMAKk4bV72pwIIOiBanQEEGwcyw=";
  };

  workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = src; };

  pyprojectOverlay = workspace.mkPyprojectOverlay { sourcePreference = "wheel"; };

  # uv.lock records the root package as an editable source with no version and
  # no build-system metadata, so both have to be supplied here.
  pyprojectOverrides = final: prev: {
    spawnpoint = prev.spawnpoint.overrideAttrs (old: {
      nativeBuildInputs =
        (old.nativeBuildInputs or [ ])
        ++ final.resolveBuildSystem {
          hatchling = [ ];
          hatch-vcs = [ ];
        };
      env = (old.env or { }) // {
        SETUPTOOLS_SCM_PRETEND_VERSION = pretendVersion;
      };
    });
  };

  pythonSet =
    (pkgs.callPackage pyproject-nix.build.packages { python = pkgs.python312; }).overrideScope
      (
        lib.composeManyExtensions [
          pyproject-build-systems.overlays.wheel
          pyprojectOverlay
          pyprojectOverrides
        ]
      );

  venv = pythonSet.mkVirtualEnv "spawnpoint-env" workspace.deps.default;
in
# Expose only the two console scripts instead of the whole virtualenv (which
# would otherwise also shadow python/pip/etc. on PATH).
pkgs.runCommand "spawnpoint-${version}"
  {
    nativeBuildInputs = [ pkgs.makeWrapper ];
    passthru = {
      inherit
        pythonSet
        workspace
        venv
        src
        ;
    };
    meta = with lib; {
      description = "Spawn multi-repo worktree workspaces for feature development";
      homepage = "https://github.com/mihirgupta0900/spawnpoint";
      license = licenses.mit;
      mainProgram = "spawnpoint";
      platforms = platforms.unix;
    };
  }
  ''
    mkdir -p $out/bin $out/share/spawnpoint/skills
    makeWrapper ${lib.getExe' venv "spawnpoint"} $out/bin/spawnpoint
    makeWrapper ${lib.getExe' venv "sp"} $out/bin/sp
    cp -R ${src}/skills/spawnpoint $out/share/spawnpoint/skills/spawnpoint
  ''
