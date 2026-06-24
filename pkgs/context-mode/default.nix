{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.166-unstable-2026-06-23";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "9452bb7811611384f5bc060ea14323579610d118";
    hash = "sha256-w77aCkYv8VOnfiNs1xKk6SKe12pyNfahNHlyzceNBFw=";
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
