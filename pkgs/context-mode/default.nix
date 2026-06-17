{
  lib,
  buildNpmPackage,
  fetchFromGitHub,
  nodejs,
}:
buildNpmPackage {
  pname = "context-mode";
  version = "1.0.162-unstable-2026-06-16";

  src = fetchFromGitHub {
    owner = "mksglu";
    repo = "context-mode";
    rev = "0744efe2384ff3db1877e3ce18a3b8fb22290c36";
    hash = "sha256-Hr4sel4ibDhCVI4tcFUq7W261rs5rQmX/5YUce4iL6M=";
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
