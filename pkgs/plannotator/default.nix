{
  lib,
  stdenv,
  fetchurl,
}:

let
  version = "0.8.0";

  binaries = {
    x86_64-linux = {
      url = "https://github.com/backnotprop/plannotator/releases/download/v${version}/plannotator-linux-x64";
      hash = "sha256-plXEV3EYx3hJJUIAPobhBNtT7dDA2Q8KnrHx3F7R8b0=";
    };
    aarch64-linux = {
      url = "https://github.com/backnotprop/plannotator/releases/download/v${version}/plannotator-linux-arm64";
      hash = lib.fakeHash;
    };
    x86_64-darwin = {
      url = "https://github.com/backnotprop/plannotator/releases/download/v${version}/plannotator-darwin-x64";
      hash = lib.fakeHash;
    };
    aarch64-darwin = {
      url = "https://github.com/backnotprop/plannotator/releases/download/v${version}/plannotator-darwin-arm64";
      hash = lib.fakeHash;
    };
  };

  binary =
    binaries.${stdenv.hostPlatform.system}
      or (throw "Unsupported platform: ${stdenv.hostPlatform.system}");
in
stdenv.mkDerivation {
  pname = "plannotator";
  version = "0.8.0-unstable-2026-02-16";

  src = fetchurl binary;

  dontUnpack = true;
  dontBuild = true;
  dontStrip = true;

  installPhase = ''
    mkdir -p $out/bin
    cp $src $out/bin/plannotator
    chmod +x $out/bin/plannotator
  '';

  meta = {
    description = "AI coding agent for planning and code review";
    homepage = "https://github.com/backnotprop/plannotator";
    license = with lib.licenses; [
      mit
      asl20
    ];
    mainProgram = "plannotator";
    platforms = builtins.attrNames binaries;
  };
}
