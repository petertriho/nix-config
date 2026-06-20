{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.162-unstable-2026-06-19";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "16ffdedd17bb14beac9fb62ce158ca41ea03eb0a";
    hash = "sha256-3VMh+SAfIBTpb9VwwU5hoRmX10I1xdCPkEtlbrxg7Ro=";
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
