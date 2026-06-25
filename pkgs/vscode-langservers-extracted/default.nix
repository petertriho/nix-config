{
  lib,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  unzip,
  vscodium,
  vscode-extensions,
}:
buildNpmPackage {
  pname = "vscode-langservers-extracted";
  version = "unstable-2026-05-25";

  srcs = [
    (fetchFromGitHub {
      owner = "zed-industries";
      repo = "vscode-langservers-extracted";
      rev = "76ae549afbee1b1ec55e12bb4e561b6f73b340be";
      sha256 = "0hzvd5g9590c2921bgyl9gi4l534a21r30vd6kx1pbnrw3imc9xs";
    })
  ]
  ++ lib.optionals (!stdenv.hostPlatform.isDarwin) [
    vscodium.src
  ];

  sourceRoot = "source";

  npmDepsHash = "sha256-G4KROyE0OPdDCEEcZOvQbM/h7PDaBCkrlOrGIoUJ1TY=";

  nativeBuildInputs = [ unzip ];

  buildPhase =
    let
      extensions =
        if stdenv.hostPlatform.isDarwin then
          "${vscodium}/Applications/VSCodium.app/Contents/Resources/app/extensions"
        else
          "../resources/app/extensions";
    in
    ''
      mkdir -p lib/packages/html/lib/node/
      npx babel ${extensions}/html-language-features/server/dist/node \
        --out-dir lib/packages/html/lib/node/

      npx babel ${extensions}/css-language-features/server/dist/node \
        --out-dir lib/css-language-server/node/
      npx babel ${extensions}/json-language-features/server/dist/node \
        --out-dir lib/json-language-server/node/
      cp -r ${vscode-extensions.dbaeumer.vscode-eslint}/share/vscode/extensions/dbaeumer.vscode-eslint/server/out \
        lib/eslint-language-server

      # Babel leaves import.meta.url behind while emitting CommonJS requires.
      # Node 24 then treats these files as ESM and crashes on the first require().
      substituteInPlace \
        lib/packages/html/lib/node/htmlServerMain.js \
        lib/css-language-server/node/cssServerMain.js \
        lib/json-language-server/node/jsonServerMain.js \
        --replace-fail "import.meta.url" "__filename"
    '';

  installPhase = ''
    runHook preInstall
    npmInstallHook

    cp -r lib $out/lib/node_modules/@zed-industries/vscode-langservers-extracted/

    runHook postInstall
  '';

  meta = with lib; {
    description = "HTML/CSS/JSON/ESLint language servers extracted from vscode";
    homepage = "https://github.com/zed-industries/vscode-langservers-extracted";
    license = licenses.mit;
  };
}
