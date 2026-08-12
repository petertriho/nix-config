{
  fetchurl,
  lib,
  stdenvNoCC,
}:
let
  versionData = import ./version.nix;
  inherit (versionData) version tag;

  assets = {
    x86_64-linux = {
      url = "https://github.com/multica-ai/multica/releases/download/${tag}/multica-cli-${version}-linux-amd64.tar.gz";
      hash = "sha256-c23SIrtDBbod0PVIPI1SzSgbrPVc/wQoW53aWpbioUA=";
    };
    aarch64-darwin = {
      url = "https://github.com/multica-ai/multica/releases/download/${tag}/multica-cli-${version}-darwin-arm64.tar.gz";
      hash = "sha256-M3PCoXbLYFmGyhuSuqI3JVQloYGZnM71DUD1RO/950E=";
    };
  };

  system = stdenvNoCC.hostPlatform.system;
  supported = builtins.hasAttr system assets;
  asset = if supported then assets.${system} else assets.x86_64-linux;
in
stdenvNoCC.mkDerivation {
  pname = "multica";
  inherit version;

  src = fetchurl { inherit (asset) url hash; };
  sourceRoot = ".";

  installPhase = ''
    runHook preInstall

    install -Dm555 multica "$out/bin/multica"
    install -Dm644 LICENSE "$out/share/licenses/multica/LICENSE"
    install -Dm644 NOTICE "$out/share/licenses/multica/NOTICE"
    install -Dm644 README.md "$out/share/doc/multica/README.md"
    install -Dm644 README.zh.md "$out/share/doc/multica/README.zh.md"

    "$out/bin/multica" version | grep -F '${version}' >/dev/null

    runHook postInstall
  '';

  passthru = {
    inherit versionData;
  };

  meta = {
    description = "Official Multica CLI and native agent daemon";
    homepage = "https://github.com/multica-ai/multica";
    changelog = "https://github.com/multica-ai/multica/releases/tag/${tag}";
    license = {
      fullName = "Multica License";
      shortName = "Multica";
      url = "https://github.com/multica-ai/multica/blob/${tag}/LICENSE";
      free = false;
    };
    mainProgram = "multica";
    platforms = builtins.attrNames assets;
    broken = !supported;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
