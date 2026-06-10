{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.162-unstable-2026-06-10";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "e17427240897ea8b07006382fecfac825d66e003";
    hash = "sha256-6FuI+4fTxcp3kp1WpJFMRUZnAGRRcTGJ1ZzOLgpMWVE=";
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
