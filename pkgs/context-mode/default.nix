{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.168-unstable-2026-06-26";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "0b4c96deba3d3d33269542c24a7f4843f0681efc";
    hash = "sha256-+R8YzEI0XdfZj9S7h9Tlhqx+V1wxThBDT6PapWYe3b0=";
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
