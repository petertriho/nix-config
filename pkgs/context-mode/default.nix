{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.168-unstable-2026-06-29";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "608584b4ab57354743a793d16412b77d23bd86ca";
    hash = "sha256-IWOHwpvBVV3gDmBqUIYe/j5796oh3PzLAzq4Xijvyvc=";
  };

  inherit nodejs;

  npmDepsHash = "sha256-HVbW9rqOnrMo8qyVAEQDEAOjUtbETc3uTl7u9UjRDqU=";

  postPatch = ''
    cp ${./package-lock.json} package-lock.json
    substituteInPlace package.json \
      --replace-fail $'",\n    "postinstall": "node scripts/postinstall.mjs"' '"'
  '';

  meta = with lib; {
    description = "Context window optimization for AI coding agents";
    homepage = "https://github.com/mksglu/context-mode";
    license = licenses.elastic20;
    mainProgram = "context-mode";
    maintainers = [ ];
  };
}
