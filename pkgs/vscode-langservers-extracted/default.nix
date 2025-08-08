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
  version = "unstable-2025-04-26";

  srcs = [
    (fetchFromGitHub {
      owner = "zed-industries";
      repo = "vscode-langservers-extracted";
      rev = "b644508b87b89e439627efe81a6967dc4c1d7e80";
      sha256 = "0sdi9s1inbh8wp7bmkxh0w2h0ax6gqfr2bx18z3sixd6gz05nbw3";
    })
  ]
  ++ lib.optionals (!stdenv.hostPlatform.isDarwin) [
    vscodium.src
  ];

  sourceRoot = "source";

  npmDepsHash = "sha256-/Af71mB/kD7zsZtyQfuOoPRSqnV+p6cY2BYlMB4VuUM=";

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
    '';

  installPhase = ''
    runHook preInstall
    npmInstallHook

    # Create packages directory structure at root level for binaries to find
    mkdir -p $out/lib/node_modules/@zed-industries/vscode-langservers-extracted/packages
    cp -r lib/packages/* $out/lib/node_modules/@zed-industries/vscode-langservers-extracted/packages/

    runHook postInstall
  '';

  meta = with lib; {
    description = "HTML/CSS/JSON/ESLint language servers extracted from vscode";
    homepage = "https://github.com/zed-industries/vscode-langservers-extracted";
    license = licenses.mit;
  };
}
