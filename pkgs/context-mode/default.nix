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
    rev = "5dfd90ef3e21c320ec2df7c34eb243009bef7c1a";
    hash = "sha256-QplJ4hsi3sPQA/PCI8JemxYhwpRlYTI7oqP5Z/q1geo=";
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
