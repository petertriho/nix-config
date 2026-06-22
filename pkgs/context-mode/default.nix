{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.163-unstable-2026-06-22";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "8f5b2d414d4103ca97568637ff4abcb886753c9e";
    hash = "sha256-h5dKcDJ8qYzkmZXi4lr7I93ZJ5wD04Yq5EAwGFSxCSw=";
  };

  inherit nodejs;

  npmDepsHash = "sha256-HVbW9rqOnrMo8qyVAEQDEAOjUtbETc3uTl7u9UjRDqU=";

  postPatch = ''
    cp ${./package-lock.json} package-lock.json
    sed -i '/"postinstall": "node scripts\/postinstall.mjs"/d' package.json
    sed -i 's/^\(    "install:agy": .*\),$/\1/' package.json
  '';

  meta = with lib; {
    description = "Context window optimization for AI coding agents";
    homepage = "https://github.com/mksglu/context-mode";
    license = licenses.elastic20;
    mainProgram = "context-mode";
    maintainers = [ ];
  };
}
