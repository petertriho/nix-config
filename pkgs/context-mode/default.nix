{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "0-unstable-2026-05-27";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "276c2ad9136c2edd7c8f8ec84c7b5c185358c71f";
    hash = "sha256-XqRzvSjYd+BEO/wwRsF21VW40OE2B0PPoLJZd9c65d0=";
  };

  inherit nodejs;

  npmDepsHash = "sha256-HVbW9rqOnrMo8qyVAEQDEAOjUtbETc3uTl7u9UjRDqU=";

  postPatch = ''
    cp ${./package-lock.json} package-lock.json
    sed -i '/"postinstall": "node scripts\/postinstall.mjs"/d' package.json
    sed -i 's/^\(    "install:openclaw": .*\),$/\1/' package.json
  '';

  meta = with lib; {
    description = "Context window optimization for AI coding agents";
    homepage = "https://github.com/mksglu/context-mode";
    license = licenses.elastic20;
    mainProgram = "context-mode";
    maintainers = [ ];
  };
}
