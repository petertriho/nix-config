{
  lib,
  stdenvNoCC,
  fetchFromGitHub,
  fetchurl,
}:
let
  version = "0.16.3";

  hashes = {
    "x86_64-linux" = "sha256-bEcIus9mgh8d/s6tZm+yvYtK2Xicd1rgW0Px7C4U/a0=";
    "aarch64-linux" = "";
    "x86_64-darwin" = "";
    "aarch64-darwin" = "sha256-cMAG5kDCqP3gaFWqZHYbu1o3kud8GL3bOiuuPvQQwVk=";
  };

  platform =
    {
      "x86_64-linux" = "linux-x64";
      "aarch64-linux" = "linux-arm64";
      "x86_64-darwin" = "darwin-x64";
      "aarch64-darwin" = "darwin-arm64";
    }
    .${stdenvNoCC.hostPlatform.system}
      or (throw "Unsupported platform: ${stdenvNoCC.hostPlatform.system}");

  sha256 =
    hashes.${stdenvNoCC.hostPlatform.system}
      or (throw "No hash for ${stdenvNoCC.hostPlatform.system} - add it to the hashes attrset");
in
stdenvNoCC.mkDerivation {
  pname = "plannotator";
  inherit version;

  src = fetchFromGitHub {
    owner = "backnotprop";
    repo = "plannotator";
    rev = "v${version}";
    sha256 = "sha256-D/UMun+ud9i7PQKpoNT6VF2ZJ+xyBnm0FXBHtOCtWx4=";
  };

  binary = fetchurl {
    url = "https://github.com/backnotprop/plannotator/releases/download/v${version}/plannotator-${platform}";
    inherit sha256;
  };

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/plannotator
    cp -r . $out/share/plannotator/

    install -Dm755 $binary $out/bin/plannotator

    runHook postInstall
  '';

  meta = with lib; {
    description = "Visual plan review tool for AI coding agents";
    homepage = "https://github.com/backnotprop/plannotator";
    license = with licenses; [
      asl20
      mit
    ];
    maintainers = [ ];
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
}
