{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.169-unstable-2026-06-30";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "218a4fcf1e9624af94fce4a3e5c93a701f7fa46c";
    hash = "sha256-jxQ2+bhVuVSLS+RcNlpPpsGFBPrRZ7mZBX5nSRHGgY8=";
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
