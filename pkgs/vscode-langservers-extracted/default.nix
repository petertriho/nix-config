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
    vscodium.src
  ];

  sourceRoot = "source";

  npmDepsHash = "sha256-XGlFtmikUrnnWXsAYzTqw2K7Y2O0bUtYug0xXFIASBQ=";

  nativeBuildInputs = [ unzip ];

  buildPhase =
    let
      extensions =
        if stdenv.hostPlatform.isDarwin then
          "../VSCodium.app/Contents/Resources/app/extensions"
        else
          "../resources/app/extensions";
    in
    ''
      npx babel ${extensions}/css-language-features/server/dist/node \
        --out-dir lib/css-language-server/node/
      npx babel ${extensions}/html-language-features/server/dist/node \
        --out-dir lib/html-language-server/node/
      npx babel ${extensions}/json-language-features/server/dist/node \
        --out-dir lib/json-language-server/node/
      cp -r ${vscode-extensions.dbaeumer.vscode-eslint}/share/vscode/extensions/dbaeumer.vscode-eslint/server/out \
        lib/eslint-language-server
    '';

  meta = with lib; {
    description = "HTML/CSS/JSON/ESLint language servers extracted from vscode";
    homepage = "https://github.com/zed-industries/vscode-langservers-extracted";
    license = licenses.mit;
  };
}
