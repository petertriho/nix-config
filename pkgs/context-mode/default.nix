{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.166-unstable-2026-06-25";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "5782bc815500d9b50d103a778aa61008861c8cfa";
    hash = "sha256-+NsjVZdvSILuC0Jcq74OLO5XlYZ7kg50meIfhHQqhn0=";
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
