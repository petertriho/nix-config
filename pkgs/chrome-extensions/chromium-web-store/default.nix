{
  lib,
  stdenvNoCC,
  fetchurl,
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "chromium-web-store";
  version = "1.5.5.4";

  src = fetchurl {
    url = "https://github.com/NeverDecaf/chromium-web-store/releases/download/v${finalAttrs.version}/Chromium.Web.Store.crx";
    hash = "sha256-Y8B1tKJbEa8sU22tGRlG6NlUf5LVtsJXss5BONKZbzI=";
  };

  dontUnpack = true;

  installPhase = ''
    runHook preInstall
    install -Dm444 $src $out/share/chrome-extensions/${finalAttrs.passthru.id}.crx
    runHook postInstall
  '';

  # Matches the home-manager programs.chromium.extensions entry shape.
  passthru = {
    id = "ocaahdebbfolfmndjeplogmgcagdmblk";
    crxPath = "${finalAttrs.finalPackage}/share/chrome-extensions/${finalAttrs.passthru.id}.crx";
  };

  meta = with lib; {
    description = "Adds Chrome Web Store installs and extension updates to ungoogled-chromium";
    homepage = "https://github.com/NeverDecaf/chromium-web-store";
    license = licenses.mit;
    platforms = platforms.all;
  };
})
