{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  nodejs,
}:

stdenvNoCC.mkDerivation rec {
  pname = "context-mode";
  version = "1.0.146";

  src = fetchurl {
    url = "https://registry.npmjs.org/context-mode/-/context-mode-${version}.tgz";
    hash = "sha512-9ZxZvg5n2rUiw7XU58jlsBldAcLefc3XhyFxPJC1KoLEuvGM34mvFgpU4SCwX3H6V9POkYwXO/e+KkE4uc2q7g==";
  };

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d $out/share/context-mode $out/bin
    cp -r . $out/share/context-mode/

    makeWrapper ${lib.getExe nodejs} $out/bin/context-mode \
      --add-flags $out/share/context-mode/cli.bundle.mjs

    runHook postInstall
  '';

  meta = with lib; {
    description = "Context window optimization for AI coding agents";
    homepage = "https://github.com/mksglu/context-mode";
    license = licenses.elastic20;
    mainProgram = "context-mode";
    maintainers = [ ];
  };
}
